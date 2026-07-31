import {
  runVersionedMigrations,
  VERSIONED_MIGRATIONS,
} from "@server/db/versionedMigrations";
import { SqliteJobQueue } from "@server/infra/job-queue-sqlite";
import Database from "better-sqlite3";
import { describe, expect, it } from "vitest";
import {
  reconcileDesignResumeAutoPdfRoots,
  recordDesignResumeAutoPdfReconciliation,
  updateDesignResumeDocumentAndEnqueueAutoPdfRegeneration,
  updateJobAndEnqueueAutoPdfRegeneration,
  updateSettingsAndEnqueueAutoPdfRegeneration,
  updateSummarizedJobAndEnqueueAutoPdfRegeneration,
} from "./auto-pdf-producers";

describe("post-success Design Resume PDF reconciliation", () => {
  function setup() {
    const database = new Database(":memory:");
    database.pragma("foreign_keys = ON");
    database.exec(`
      CREATE TABLE tenants (id TEXT PRIMARY KEY);
      INSERT INTO tenants(id) VALUES ('tenant-1');
      CREATE TABLE design_resume_documents (
        id TEXT NOT NULL,
        tenant_id TEXT NOT NULL,
        title TEXT NOT NULL,
        resume_json TEXT NOT NULL,
        revision INTEGER NOT NULL,
        source_resume_id TEXT,
        source_mode TEXT,
        imported_at TEXT,
        created_at TEXT NOT NULL,
        updated_at TEXT NOT NULL,
        PRIMARY KEY (tenant_id, id),
        FOREIGN KEY (tenant_id) REFERENCES tenants(id)
      );
      INSERT INTO design_resume_documents VALUES
        ('primary', 'tenant-1', 'Resume', '{}', 3, NULL, NULL, NULL, '2026-07-12T10:00:00.000Z', '2026-07-12T10:00:00.000Z');
    `);
    runVersionedMigrations(
      database,
      VERSIONED_MIGRATIONS.filter(({ version }) => version >= 6),
    );
    return { database, queue: new SqliteJobQueue(database) };
  }

  it("records picture localization once and makes duplicate retries idempotent", () => {
    const { database, queue } = setup();
    const input = {
      database,
      queue,
      tenantId: "tenant-1",
      documentId: "primary",
      revision: 3,
      operation: "picture_localization",
      requestedBy: "user" as const,
    };

    recordDesignResumeAutoPdfReconciliation(input);
    recordDesignResumeAutoPdfReconciliation(input);

    expect(
      database
        .prepare(
          "SELECT count(*) AS count FROM design_resume_pdf_reconciliations",
        )
        .get(),
    ).toEqual({ count: 1 });
    expect(
      database.prepare("SELECT count(*) AS count FROM workflow_outbox").get(),
    ).toEqual({ count: 1 });
  });

  it("recovers missing post-success work after a reconciliation insert failure", () => {
    const { database, queue } = setup();
    database.exec(`
      CREATE TRIGGER fail_reconciliation_outbox BEFORE INSERT ON workflow_outbox
      BEGIN SELECT RAISE(ABORT, 'outbox unavailable'); END;
    `);

    expect(() =>
      recordDesignResumeAutoPdfReconciliation({
        database,
        queue,
        tenantId: "tenant-1",
        documentId: "primary",
        revision: 3,
        operation: "import",
        requestedBy: "user",
      }),
    ).toThrow("outbox unavailable");
    expect(
      database
        .prepare(
          "SELECT count(*) AS count FROM design_resume_pdf_reconciliations",
        )
        .get(),
    ).toEqual({ count: 0 });

    database.exec("DROP TRIGGER fail_reconciliation_outbox");
    expect(reconcileDesignResumeAutoPdfRoots({ database, queue })).toBe(1);
    expect(
      database
        .prepare("SELECT operation FROM design_resume_pdf_reconciliations")
        .all(),
    ).toEqual([{ operation: "recovery" }]);
    expect(
      database.prepare("SELECT count(*) AS count FROM workflow_outbox").get(),
    ).toEqual({ count: 1 });
  });
});

describe("Design Resume PATCH durable producer integration", () => {
  function setup() {
    const database = new Database(":memory:");
    database.exec(`
      CREATE TABLE design_resume_documents (
        id TEXT NOT NULL,
        tenant_id TEXT NOT NULL,
        title TEXT NOT NULL,
        resume_json TEXT NOT NULL,
        revision INTEGER NOT NULL,
        source_resume_id TEXT,
        source_mode TEXT,
        imported_at TEXT,
        created_at TEXT NOT NULL,
        updated_at TEXT NOT NULL,
        PRIMARY KEY (tenant_id, id)
      );
      CREATE TABLE workflow_outbox (
        id TEXT PRIMARY KEY,
        tenant_id TEXT NOT NULL,
        queue_name TEXT NOT NULL,
        task_type TEXT NOT NULL,
        payload_version INTEGER NOT NULL,
        payload_json TEXT NOT NULL,
        idempotency_key TEXT,
        priority INTEGER NOT NULL,
        available_at TEXT NOT NULL,
        enqueue_sequence INTEGER NOT NULL,
        request_context_json TEXT NOT NULL,
        created_at TEXT NOT NULL,
        dispatched_at TEXT
      );
      CREATE TABLE workflow_enqueue_sequence (
        singleton INTEGER PRIMARY KEY,
        last_value INTEGER NOT NULL
      );
      INSERT INTO workflow_enqueue_sequence(singleton, last_value) VALUES (1, 0);
      CREATE UNIQUE INDEX workflow_outbox_immutable_idempotency
        ON workflow_outbox(tenant_id, queue_name, task_type, idempotency_key)
        WHERE idempotency_key IS NOT NULL;
    `);
    database
      .prepare(`INSERT INTO design_resume_documents
      (id, tenant_id, title, resume_json, revision, created_at, updated_at)
      VALUES (?, ?, ?, ?, ?, ?, ?)`)
      .run(
        "primary",
        "tenant-1",
        "Before",
        '{"version":"v5"}',
        1,
        "2026-07-12T10:00:00.000Z",
        "2026-07-12T10:00:00.000Z",
      );
    database
      .prepare(`INSERT INTO design_resume_documents
      (id, tenant_id, title, resume_json, revision, created_at, updated_at)
      VALUES (?, ?, ?, ?, ?, ?, ?)`)
      .run(
        "primary",
        "tenant-2",
        "Tenant two",
        '{"version":"v5"}',
        4,
        "2026-07-12T10:00:00.000Z",
        "2026-07-12T10:00:00.000Z",
      );
    return { database, queue: new SqliteJobQueue(database) };
  }

  const input = (database: Database.Database, queue: SqliteJobQueue) => ({
    database,
    queue,
    tenantId: "tenant-1",
    documentId: "primary",
    expectedRevision: 1,
    title: "After",
    resumeJson: { version: "v5", basics: { name: "After" } },
    sourceResumeId: null,
    sourceMode: "v5",
    importedAt: null,
    updatedAt: "2026-07-12T10:01:00.000Z",
    requestedBy: "user" as const,
  });

  it("rolls back the document revision and root outbox together, commits once, and scopes dedupe by tenant", () => {
    const { database, queue } = setup();
    const request = input(database, queue);

    expect(() =>
      updateDesignResumeDocumentAndEnqueueAutoPdfRegeneration({
        ...request,
        failAfterOutboxInsert: true,
      }),
    ).toThrow("rollback requested by test");
    expect(
      database
        .prepare(
          "SELECT revision, title FROM design_resume_documents WHERE tenant_id = ? AND id = ?",
        )
        .get("tenant-1", "primary"),
    ).toEqual({ revision: 1, title: "Before" });
    expect(
      database.prepare("SELECT count(*) AS count FROM workflow_outbox").get(),
    ).toEqual({ count: 0 });

    expect(
      updateDesignResumeDocumentAndEnqueueAutoPdfRegeneration(request),
    ).toBe(true);
    expect(
      database
        .prepare(
          "SELECT revision, title FROM design_resume_documents WHERE tenant_id = ? AND id = ?",
        )
        .get("tenant-1", "primary"),
    ).toEqual({ revision: 2, title: "After" });
    expect(
      database
        .prepare(
          "SELECT revision, title FROM design_resume_documents WHERE tenant_id = ? AND id = ?",
        )
        .get("tenant-2", "primary"),
    ).toEqual({ revision: 4, title: "Tenant two" });
    const outbox = database
      .prepare(
        "SELECT tenant_id, task_type, idempotency_key, payload_json FROM workflow_outbox",
      )
      .all() as Array<Record<string, string>>;
    expect(outbox).toHaveLength(1);
    expect(outbox[0]).toMatchObject({
      tenant_id: "tenant-1",
      task_type: "design_resume_auto_pdf_root",
      idempotency_key: "tenant-1:design-resume:primary:2",
    });
    expect(JSON.parse(outbox[0].payload_json)).toMatchObject({
      taskType: "design_resume_auto_pdf_root",
      tenantId: "tenant-1",
      documentId: "primary",
      revision: 2,
    });

    queue.enqueueOutboxInTransaction(
      database,
      "auto_pdf_regeneration",
      {
        taskType: "design_resume_auto_pdf_root",
        tenantId: "tenant-1",
        documentId: "primary",
        revision: 2,
        requestedAt: "2026-07-12T10:01:00.000Z",
        requestedBy: "user",
      },
      {
        taskType: "design_resume_auto_pdf_root",
        dedupeKey: "tenant-1:design-resume:primary:2",
      },
    );
    expect(
      database.prepare("SELECT count(*) AS count FROM workflow_outbox").get(),
    ).toEqual({ count: 1 });
  });
});

describe("transactional auto PDF producers", () => {
  it("rolls back summarize-produced tailoring fields with its tenant-scoped child outbox, then commits one child", async () => {
    const database = new Database(":memory:");
    database.exec(`
      CREATE TABLE jobs (
        id TEXT NOT NULL,
        tenant_id TEXT NOT NULL,
        status TEXT NOT NULL,
        pdf_source TEXT,
        tailored_summary TEXT,
        tailored_headline TEXT,
        tailored_skills TEXT,
        selected_project_ids TEXT,
        updated_at TEXT NOT NULL,
        PRIMARY KEY (tenant_id, id)
      );
      CREATE TABLE workflow_outbox (
        id TEXT PRIMARY KEY,
        tenant_id TEXT NOT NULL,
        queue_name TEXT NOT NULL,
        task_type TEXT NOT NULL,
        payload_version INTEGER NOT NULL,
        payload_json TEXT NOT NULL,
        idempotency_key TEXT,
        priority INTEGER NOT NULL,
        available_at TEXT NOT NULL,
        enqueue_sequence INTEGER NOT NULL,
        request_context_json TEXT NOT NULL,
        created_at TEXT NOT NULL,
        dispatched_at TEXT
      );
      CREATE UNIQUE INDEX workflow_outbox_immutable_idempotency
        ON workflow_outbox(tenant_id, queue_name, task_type, idempotency_key)
        WHERE idempotency_key IS NOT NULL;
      CREATE TABLE workflow_tasks (
        id TEXT PRIMARY KEY,
        tenant_id TEXT NOT NULL,
        queue_name TEXT NOT NULL,
        task_type TEXT NOT NULL,
        payload_version INTEGER NOT NULL,
        payload_json TEXT NOT NULL,
        idempotency_key TEXT,
        state TEXT NOT NULL,
        priority INTEGER NOT NULL,
        available_at TEXT NOT NULL,
        enqueue_sequence INTEGER NOT NULL,
        attempt_count INTEGER NOT NULL,
        max_attempts INTEGER NOT NULL,
        request_context_json TEXT NOT NULL,
        created_at TEXT NOT NULL,
        updated_at TEXT NOT NULL,
        lease_owner TEXT,
        lease_expires_at TEXT,
        heartbeat_at TEXT,
        completed_at TEXT,
        last_error TEXT
      );
      CREATE TABLE workflow_enqueue_sequence (
        singleton INTEGER PRIMARY KEY,
        last_value INTEGER NOT NULL
      );
      INSERT INTO workflow_enqueue_sequence(singleton, last_value) VALUES (1, 0);
    `);
    database
      .prepare(
        `INSERT INTO jobs(
          id, tenant_id, status, pdf_source, tailored_summary,
          tailored_headline, tailored_skills, selected_project_ids, updated_at
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      )
      .run(
        "job-1",
        "tenant-1",
        "ready",
        "generated",
        "Before summary",
        "Before headline",
        '["Before"]',
        "before-project",
        "2026-07-12T10:00:00.000Z",
      );
    database
      .prepare(
        `INSERT INTO jobs(
          id, tenant_id, status, pdf_source, tailored_summary,
          tailored_headline, tailored_skills, selected_project_ids, updated_at
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      )
      .run(
        "job-1",
        "tenant-2",
        "ready",
        "generated",
        "Other tenant summary",
        "Other tenant headline",
        '["Other tenant"]',
        "other-tenant-project",
        "2026-07-12T10:00:00.000Z",
      );
    const queue = new SqliteJobQueue(database, {
      now: () => new Date("2026-07-12T10:01:00.000Z"),
    });
    const update = {
      tailoredSummary: "After summary",
      tailoredHeadline: "After headline",
      tailoredSkills: '["After"]',
      selectedProjectIds: "after-project",
    };

    expect(() =>
      updateSummarizedJobAndEnqueueAutoPdfRegeneration({
        database,
        queue,
        tenantId: "tenant-1",
        jobId: "job-1",
        update,
        requestedBy: "user",
        shouldEnqueue: () => true,
        failAfterOutboxInsert: true,
      }),
    ).toThrow("rollback requested by test");

    expect(
      database
        .prepare(
          `SELECT tailored_summary, tailored_headline, tailored_skills, selected_project_ids
           FROM jobs WHERE tenant_id = ? AND id = ?`,
        )
        .get("tenant-1", "job-1"),
    ).toEqual({
      tailored_summary: "Before summary",
      tailored_headline: "Before headline",
      tailored_skills: '["Before"]',
      selected_project_ids: "before-project",
    });
    expect(
      database.prepare("SELECT count(*) AS count FROM workflow_outbox").get(),
    ).toEqual({ count: 0 });

    updateSummarizedJobAndEnqueueAutoPdfRegeneration({
      database,
      queue,
      tenantId: "tenant-1",
      jobId: "job-1",
      update: {
        tailoredSummary: "Before summary",
        tailoredHeadline: "Before headline",
        tailoredSkills: '["Before"]',
        selectedProjectIds: "before-project",
      },
      requestedBy: "user",
      shouldEnqueue: () => false,
    });
    expect(
      database.prepare("SELECT count(*) AS count FROM workflow_outbox").get(),
    ).toEqual({ count: 0 });

    updateSummarizedJobAndEnqueueAutoPdfRegeneration({
      database,
      queue,
      tenantId: "tenant-1",
      jobId: "job-1",
      update,
      requestedBy: "user",
      shouldEnqueue: () => true,
    });

    expect(
      database
        .prepare(
          "SELECT tenant_id, task_type, payload_json FROM workflow_outbox",
        )
        .all(),
    ).toEqual([
      {
        tenant_id: "tenant-1",
        task_type: "auto_pdf_regeneration",
        payload_json: expect.stringContaining('"jobId":"job-1"'),
      },
    ]);
    expect(
      database
        .prepare(
          "SELECT tailored_summary FROM jobs WHERE tenant_id = ? AND id = ?",
        )
        .get("tenant-2", "job-1"),
    ).toEqual({ tailored_summary: "Other tenant summary" });
    await queue.dispatchOutbox();
    expect(
      database.prepare("SELECT tenant_id, task_type FROM workflow_tasks").all(),
    ).toEqual([{ tenant_id: "tenant-1", task_type: "auto_pdf_regeneration" }]);
  });

  it("rolls back a tailoring update and its auto-PDF outbox record together", () => {
    const database = new Database(":memory:");
    database.exec(`
      CREATE TABLE jobs (
        id TEXT NOT NULL,
        tenant_id TEXT NOT NULL,
        tailored_headline TEXT,
        updated_at TEXT NOT NULL,
        PRIMARY KEY (tenant_id, id)
      );
      CREATE TABLE workflow_outbox (
        id TEXT PRIMARY KEY,
        tenant_id TEXT NOT NULL,
        queue_name TEXT NOT NULL,
        task_type TEXT NOT NULL,
        payload_version INTEGER NOT NULL,
        payload_json TEXT NOT NULL,
        idempotency_key TEXT,
        priority INTEGER NOT NULL,
        available_at TEXT NOT NULL,
        enqueue_sequence INTEGER NOT NULL,
        request_context_json TEXT NOT NULL,
        created_at TEXT NOT NULL,
        dispatched_at TEXT
      );
      CREATE TABLE workflow_enqueue_sequence (
        singleton INTEGER PRIMARY KEY,
        last_value INTEGER NOT NULL
      );
      INSERT INTO workflow_enqueue_sequence(singleton, last_value) VALUES (1, 0);
    `);
    database
      .prepare(
        "INSERT INTO jobs(id, tenant_id, tailored_headline, updated_at) VALUES (?, ?, ?, ?)",
      )
      .run("job-1", "tenant-1", "Before", "2026-07-12T10:00:00.000Z");
    const queue = new SqliteJobQueue(database, {
      now: () => new Date("2026-07-12T10:01:00.000Z"),
    });

    expect(() =>
      updateJobAndEnqueueAutoPdfRegeneration({
        database,
        queue,
        tenantId: "tenant-1",
        jobId: "job-1",
        update: { tailoredHeadline: "After" },
        requestedBy: "user",
        failAfterOutboxInsert: true,
      }),
    ).toThrow("rollback requested by test");

    expect(
      database
        .prepare(
          "SELECT tailored_headline FROM jobs WHERE tenant_id = ? AND id = ?",
        )
        .get("tenant-1", "job-1"),
    ).toEqual({ tailored_headline: "Before" });
    expect(
      database.prepare("SELECT count(*) AS count FROM workflow_outbox").get(),
    ).toEqual({ count: 0 });

    updateJobAndEnqueueAutoPdfRegeneration({
      database,
      queue,
      tenantId: "tenant-1",
      jobId: "job-1",
      update: { tailoredHeadline: "After" },
      requestedBy: "user",
    });

    expect(
      database
        .prepare(
          "SELECT tailored_headline FROM jobs WHERE tenant_id = ? AND id = ?",
        )
        .get("tenant-1", "job-1"),
    ).toEqual({ tailored_headline: "After" });
    expect(
      database.prepare("SELECT count(*) AS count FROM workflow_outbox").get(),
    ).toEqual({ count: 1 });
  });
});

describe("transactional settings auto PDF producer", () => {
  it("rolls back settings and the root outbox together, then commits each once", () => {
    const database = new Database(":memory:");
    database.exec(`
      CREATE TABLE settings (
        tenant_id TEXT NOT NULL,
        key TEXT NOT NULL,
        value TEXT NOT NULL,
        created_at TEXT NOT NULL,
        updated_at TEXT NOT NULL,
        UNIQUE(tenant_id, key)
      );
      CREATE TABLE workflow_outbox (
        id TEXT PRIMARY KEY,
        tenant_id TEXT NOT NULL,
        queue_name TEXT NOT NULL,
        task_type TEXT NOT NULL,
        payload_version INTEGER NOT NULL,
        payload_json TEXT NOT NULL,
        idempotency_key TEXT,
        priority INTEGER NOT NULL,
        available_at TEXT NOT NULL,
        enqueue_sequence INTEGER NOT NULL,
        request_context_json TEXT NOT NULL,
        created_at TEXT NOT NULL,
        dispatched_at TEXT
      );
      CREATE TABLE workflow_enqueue_sequence (
        singleton INTEGER PRIMARY KEY,
        last_value INTEGER NOT NULL
      );
      INSERT INTO workflow_enqueue_sequence(singleton, last_value) VALUES (1, 0);
    `);
    database
      .prepare(
        "INSERT INTO settings(tenant_id, key, value, created_at, updated_at) VALUES (?, ?, ?, ?, ?)",
      )
      .run(
        "tenant-1",
        "pdfRenderer",
        "rxresume",
        "2026-07-12T10:00:00.000Z",
        "2026-07-12T10:00:00.000Z",
      );
    database
      .prepare(
        "INSERT INTO settings(tenant_id, key, value, created_at, updated_at) VALUES (?, ?, ?, ?, ?)",
      )
      .run(
        "tenant-2",
        "pdfRenderer",
        "tenant-2-renderer",
        "2026-07-12T10:00:00.000Z",
        "2026-07-12T10:00:00.000Z",
      );
    database
      .prepare(
        "INSERT INTO settings(tenant_id, key, value, created_at, updated_at) VALUES (?, ?, ?, ?, ?)",
      )
      .run(
        "tenant-1",
        "jobspyLocation",
        "legacy",
        "2026-07-12T10:00:00.000Z",
        "2026-07-12T10:00:00.000Z",
      );
    const queue = new SqliteJobQueue(database, {
      now: () => new Date("2026-07-12T10:01:00.000Z"),
    });
    const input = {
      database,
      queue,
      tenantId: "tenant-1",
      updates: [
        { settingKey: "pdfRenderer", value: "latex" },
        { settingKey: "searchCities", value: '["Berlin"]' },
        { settingKey: "jobspyLocation", value: null },
      ],
      requestedBy: "user" as const,
      transactionId: "settings-revision-1",
      requestId: "request-1",
    } satisfies Parameters<
      typeof updateSettingsAndEnqueueAutoPdfRegeneration
    >[0];

    expect(() =>
      updateSettingsAndEnqueueAutoPdfRegeneration({
        ...input,
        failAfterOutboxInsert: true,
      }),
    ).toThrow("rollback requested by test");
    expect(
      database
        .prepare(
          "SELECT key, value FROM settings WHERE tenant_id = ? ORDER BY key",
        )
        .all("tenant-1"),
    ).toEqual([
      { key: "jobspyLocation", value: "legacy" },
      { key: "pdfRenderer", value: "rxresume" },
    ]);
    expect(
      database.prepare("SELECT count(*) AS count FROM workflow_outbox").get(),
    ).toEqual({ count: 0 });

    updateSettingsAndEnqueueAutoPdfRegeneration(input);

    expect(
      database
        .prepare(
          "SELECT key, value FROM settings WHERE tenant_id = ? ORDER BY key",
        )
        .all("tenant-1"),
    ).toEqual([
      { key: "pdfRenderer", value: "latex" },
      { key: "searchCities", value: '["Berlin"]' },
    ]);
    const outbox = database
      .prepare(
        "SELECT task_type, idempotency_key, payload_json FROM workflow_outbox",
      )
      .all();
    expect(outbox).toHaveLength(1);
    expect(outbox[0]).toMatchObject({
      task_type: "settings_auto_pdf_root",
      idempotency_key: "tenant-1:settings:settings-revision-1:request-1",
    });
    expect(
      database
        .prepare("SELECT value FROM settings WHERE tenant_id = ? AND key = ?")
        .get("tenant-2", "pdfRenderer"),
    ).toEqual({ value: "tenant-2-renderer" });
  });
});
