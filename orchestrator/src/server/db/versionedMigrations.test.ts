import Database from "better-sqlite3";
import { afterEach, describe, expect, it } from "vitest";
import {
  runVersionedMigrations,
  VERSIONED_MIGRATIONS,
} from "./versionedMigrations";

describe("versioned SQLite migrations", () => {
  const databases: Database.Database[] = [];

  afterEach(() => {
    for (const database of databases.splice(0)) database.close();
  });

  function databaseWithJobs(): Database.Database {
    const database = new Database(":memory:");
    databases.push(database);
    database.exec(`
      PRAGMA foreign_keys = ON;
      CREATE TABLE tenants (id TEXT PRIMARY KEY);
      CREATE TABLE users (id TEXT PRIMARY KEY);
      CREATE TABLE tenant_memberships (
        id TEXT PRIMARY KEY,
        user_id TEXT NOT NULL,
        tenant_id TEXT NOT NULL,
        UNIQUE (tenant_id, user_id)
      );
      CREATE TABLE jobs (id TEXT PRIMARY KEY, tenant_id TEXT NOT NULL, pdf_path TEXT);
      CREATE TABLE interview_stories (id TEXT PRIMARY KEY, tenant_id TEXT NOT NULL);
    `);
    return database;
  }

  function assertCompositeForeignKey(database: Database.Database): void {
    database.pragma("foreign_keys = ON");
    database.exec(`
      CREATE TABLE new_job_child (
        id TEXT PRIMARY KEY,
        tenant_id TEXT NOT NULL,
        job_id TEXT NOT NULL,
        FOREIGN KEY (tenant_id, job_id) REFERENCES jobs(tenant_id, id)
      )
    `);
    database
      .prepare("INSERT INTO jobs(id, tenant_id) VALUES (?, ?)")
      .run("job-a", "tenant-a");
    database
      .prepare("INSERT INTO jobs(id, tenant_id) VALUES (?, ?)")
      .run("job-b", "tenant-b");
    expect(() =>
      database
        .prepare(
          "INSERT INTO new_job_child(id, tenant_id, job_id) VALUES (?, ?, ?)",
        )
        .run("child-a", "tenant-a", "job-a"),
    ).not.toThrow();
    expect(() =>
      database
        .prepare(
          "INSERT INTO new_job_child(id, tenant_id, job_id) VALUES (?, ?, ?)",
        )
        .run("child-cross", "tenant-a", "job-b"),
    ).toThrow(/FOREIGN KEY constraint failed/);
    expect(() =>
      database
        .prepare(
          "INSERT INTO new_job_child(id, tenant_id, job_id) VALUES (?, ?, ?)",
        )
        .run("child-missing", "tenant-a", "missing"),
    ).toThrow(/FOREIGN KEY constraint failed/);
  }

  it("adds the composite jobs key for a fresh database", () => {
    const database = databaseWithJobs();

    runVersionedMigrations(database);

    assertCompositeForeignKey(database);
  });

  it("applies once and supports an existing database", () => {
    const database = databaseWithJobs();
    database
      .prepare("INSERT INTO jobs(id, tenant_id) VALUES (?, ?)")
      .run("existing-job", "tenant-existing");

    runVersionedMigrations(database);
    runVersionedMigrations(database);

    expect(
      database.prepare("SELECT count(*) AS count FROM schema_migrations").get(),
    ).toEqual({ count: 5 });
    assertCompositeForeignKey(database);
  });

  it("rejects duplicate versions and checksum drift", () => {
    const database = databaseWithJobs();
    const migration = {
      version: 2,
      sql: "CREATE TABLE migration_probe (id TEXT)",
    };

    runVersionedMigrations(database, [migration]);

    expect(() =>
      runVersionedMigrations(database, [
        { ...migration, sql: "CREATE TABLE changed_probe (id TEXT)" },
      ]),
    ).toThrow(/Checksum drift/);
    expect(() =>
      runVersionedMigrations(database, [migration, migration]),
    ).toThrow(/Duplicate migration version/);
    expect(() =>
      runVersionedMigrations(database, [
        { version: 4, sql: "CREATE TABLE migration_four (id TEXT)" },
        { version: 3, sql: "CREATE TABLE migration_three (id TEXT)" },
      ]),
    ).toThrow(/strictly increasing/);
    const invalidDatabase = new Database(":memory:");
    databases.push(invalidDatabase);
    for (const version of [0, -1, 1.5, Number.MAX_SAFE_INTEGER + 1]) {
      expect(() =>
        runVersionedMigrations(invalidDatabase, [
          { version, sql: "CREATE TABLE invalid_version (id TEXT)" },
        ]),
      ).toThrow(/Invalid migration version/);
    }
    expect(
      invalidDatabase
        .prepare(
          "SELECT name FROM sqlite_master WHERE type = 'table' AND name = 'schema_migrations'",
        )
        .get(),
    ).toBeUndefined();
    expect(() => runVersionedMigrations(database, [])).toThrow(
      /Missing migration history/,
    );
  });

  it("preserves the caller foreign-key pragma state", () => {
    const database = new Database(":memory:");
    databases.push(database);
    database.exec("CREATE TABLE parent (id TEXT PRIMARY KEY)");
    database.pragma("foreign_keys = OFF");

    runVersionedMigrations(database, [
      {
        version: 1,
        sql: "CREATE TABLE child (parent_id TEXT REFERENCES parent(id))",
      },
    ]);

    expect(database.pragma("foreign_keys", { simple: true })).toBe(0);
    expect(() =>
      database
        .prepare("INSERT INTO child(parent_id) VALUES (?)")
        .run("missing"),
    ).not.toThrow();
  });

  it("migrates valid populated version-two audit tables", () => {
    const database = databaseWithJobs();
    runVersionedMigrations(database, VERSIONED_MIGRATIONS.slice(0, 2));
    database.exec(`
      INSERT INTO tenants(id) VALUES ('tenant-a');
      INSERT INTO jobs(id, tenant_id) VALUES ('job-a', 'tenant-a');
      INSERT INTO interview_stories(id, tenant_id) VALUES ('story-a', 'tenant-a');
      INSERT INTO application_dossiers(id, tenant_id, job_id, lifecycle_state)
      VALUES ('dossier-a', 'tenant-a', 'job-a', 'draft');
      INSERT INTO application_draft_revisions(
        id, tenant_id, dossier_id, job_id, revision_number, job_snapshot, resume_snapshot,
        story_snapshot, content_snapshot, provenance, content_hash
      ) VALUES ('revision-a', 'tenant-a', 'dossier-a', 'job-a', 1, '{}', '{}', '{}', '{}', '{}', '${"a".repeat(64)}');
      INSERT INTO submitted_application_artifacts(
        id, tenant_id, dossier_id, job_id, draft_revision_id, storage_path,
        sha256, byte_size, media_type, qa_result
      ) VALUES ('artifact-a', 'tenant-a', 'dossier-a', 'job-a', 'revision-a', 'data/submitted-applications/a.pdf', '${"b".repeat(64)}', 1, 'application/pdf', 'passed');
    `);

    runVersionedMigrations(database);

    expect(() =>
      database
        .prepare("DELETE FROM application_dossiers WHERE id = ?")
        .run("dossier-a"),
    ).toThrow(/FOREIGN KEY constraint failed/);
  });

  it("rolls back version three when legacy data violates rebuilt table checks", () => {
    const database = databaseWithJobs();
    runVersionedMigrations(database, VERSIONED_MIGRATIONS.slice(0, 2));
    database.exec(`
      INSERT INTO tenants(id) VALUES ('tenant-a');
      INSERT INTO jobs(id, tenant_id) VALUES ('job-a', 'tenant-a');
      INSERT INTO application_dossiers(id, tenant_id, job_id, lifecycle_state)
      VALUES ('dossier-a', 'tenant-a', 'job-a', 'draft');
      INSERT INTO application_draft_revisions(
        id, tenant_id, dossier_id, job_id, revision_number, job_snapshot, resume_snapshot,
        story_snapshot, content_snapshot, provenance, content_hash
      ) VALUES ('revision-invalid', 'tenant-a', 'dossier-a', 'job-a', 1, '{}', '{}', '{}', '{}', '{}', '${"A".repeat(64)}');
    `);

    expect(() => runVersionedMigrations(database)).toThrow(
      /CHECK constraint failed/,
    );
    expect(
      database
        .prepare(
          "SELECT content_hash FROM application_draft_revisions WHERE id = ?",
        )
        .get("revision-invalid"),
    ).toEqual({ content_hash: "A".repeat(64) });
    expect(
      database
        .prepare("SELECT version FROM schema_migrations ORDER BY version")
        .all(),
    ).toEqual([{ version: 1 }, { version: 2 }]);
    expect(
      database
        .prepare(
          "SELECT name FROM sqlite_master WHERE type = 'table' AND name = ?",
        )
        .get("application_draft_revisions_new"),
    ).toBeUndefined();
  });

  it("rolls back a failed migration without recording it", () => {
    const database = databaseWithJobs();

    expect(() =>
      runVersionedMigrations(database, [
        {
          version: 3,
          sql: "CREATE TABLE rolled_back_probe (id TEXT); INVALID SQL",
        },
      ]),
    ).toThrow();
    expect(
      database
        .prepare(
          "SELECT name FROM sqlite_master WHERE type = 'table' AND name = ?",
        )
        .get("rolled_back_probe"),
    ).toBeUndefined();
    expect(
      database.prepare("SELECT count(*) AS count FROM schema_migrations").get(),
    ).toEqual({ count: 0 });
  });

  it("creates tenant-safe unified application contracts and rejects cross-tenant relations", () => {
    const database = databaseWithJobs();
    runVersionedMigrations(database);
    database.exec(`
      INSERT INTO tenants(id) VALUES ('tenant-a'), ('tenant-b');
      INSERT INTO users(id) VALUES ('user-a'), ('user-b');
      INSERT INTO tenant_memberships(id, tenant_id, user_id)
      VALUES ('membership-a', 'tenant-a', 'user-a'), ('membership-b', 'tenant-b', 'user-b');
      INSERT INTO jobs(id, tenant_id) VALUES ('job-a', 'tenant-a'), ('job-b', 'tenant-b');
      INSERT INTO interview_stories(id, tenant_id) VALUES ('story-a', 'tenant-a'), ('story-b', 'tenant-b');
      INSERT INTO application_dossiers(id, tenant_id, job_id, lifecycle_state)
      VALUES ('dossier-a', 'tenant-a', 'job-a', 'draft');
    `);

    expect(() =>
      database
        .prepare(
          "INSERT INTO application_dossiers(id, tenant_id, job_id, lifecycle_state) VALUES (?, ?, ?, ?)",
        )
        .run("dossier-cross", "tenant-a", "job-b", "draft"),
    ).toThrow(/FOREIGN KEY constraint failed/);
    expect(() =>
      database
        .prepare(
          `INSERT INTO application_draft_revisions(
        id, tenant_id, dossier_id, job_id, revision_number, job_snapshot, resume_snapshot,
        story_snapshot, content_snapshot, provenance, content_hash
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
        )
        .run(
          "revision-cross",
          "tenant-a",
          "dossier-a",
          "job-b",
          1,
          "{}",
          "{}",
          "{}",
          "{}",
          "{}",
          "a".repeat(64),
        ),
    ).toThrow(/FOREIGN KEY constraint failed/);
    expect(() =>
      database
        .prepare(
          "INSERT INTO application_approvals(id, tenant_id, dossier_id, job_id, decision, approved_by_user_id, policy_version, request_id) VALUES (?, ?, ?, ?, ?, ?, ?, ?)",
        )
        .run(
          "approval-cross",
          "tenant-a",
          "dossier-a",
          "job-a",
          "approved",
          "user-b",
          "policy-1",
          "request-1",
        ),
    ).toThrow(/FOREIGN KEY constraint failed/);
    database.exec(
      "INSERT INTO story_tags(id, tenant_id, name) VALUES ('tag-a', 'tenant-a', 'leadership')",
    );
    expect(() =>
      database
        .prepare(
          "INSERT INTO story_tag_assignments(id, tenant_id, story_id, tag_id) VALUES (?, ?, ?, ?)",
        )
        .run("assignment-cross", "tenant-a", "story-b", "tag-a"),
    ).toThrow(/FOREIGN KEY constraint failed/);
  });

  it("enforces append-only unique revisions and submitted-artifact isolation", () => {
    const database = databaseWithJobs();
    runVersionedMigrations(database);
    database.exec(`
      INSERT INTO tenants(id) VALUES ('tenant-a');
      INSERT INTO users(id) VALUES ('user-a');
      INSERT INTO tenant_memberships(id, tenant_id, user_id) VALUES ('membership-a', 'tenant-a', 'user-a');
      INSERT INTO jobs(id, tenant_id) VALUES ('job-a', 'tenant-a');
      INSERT INTO application_dossiers(id, tenant_id, job_id, lifecycle_state) VALUES ('dossier-a', 'tenant-a', 'job-a', 'draft');
      INSERT INTO application_draft_revisions(
        id, tenant_id, dossier_id, job_id, revision_number, job_snapshot, resume_snapshot,
        story_snapshot, content_snapshot, provenance, content_hash
      ) VALUES ('revision-a', 'tenant-a', 'dossier-a', 'job-a', 1, '{}', '{}', '{}', '{}', '{}', '${"a".repeat(64)}');
    `);
    const duplicateRevision = () =>
      database
        .prepare(
          `INSERT INTO application_draft_revisions(
        id, tenant_id, dossier_id, job_id, revision_number, job_snapshot, resume_snapshot,
        story_snapshot, content_snapshot, provenance, content_hash
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
        )
        .run(
          "revision-duplicate",
          "tenant-a",
          "dossier-a",
          "job-a",
          1,
          "{}",
          "{}",
          "{}",
          "{}",
          "{}",
          "b".repeat(64),
        );
    expect(duplicateRevision).toThrow(/UNIQUE constraint failed/);
    expect(() =>
      database
        .prepare(
          "UPDATE application_draft_revisions SET content_hash = ? WHERE id = ?",
        )
        .run("b".repeat(64), "revision-a"),
    ).toThrow(/append-only/);
    expect(() =>
      database
        .prepare(
          "INSERT INTO submitted_application_artifacts(id, tenant_id, dossier_id, job_id, draft_revision_id, storage_path, sha256, byte_size, media_type, qa_result) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)",
        )
        .run(
          "artifact-working-path",
          "tenant-a",
          "dossier-a",
          "job-a",
          "revision-a",
          "data/pdfs/working.pdf",
          "c".repeat(64),
          1,
          "application/pdf",
          "passed",
        ),
    ).toThrow(/submitted application artifact validation failed/);
    database
      .prepare("UPDATE jobs SET pdf_path = ? WHERE id = ?")
      .run("data/submitted-applications/aliased.pdf", "job-a");
    expect(() =>
      database
        .prepare(
          "INSERT INTO submitted_application_artifacts(id, tenant_id, dossier_id, job_id, draft_revision_id, storage_path, sha256, byte_size, media_type, qa_result) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)",
        )
        .run(
          "artifact-aliased-path",
          "tenant-a",
          "dossier-a",
          "job-a",
          "revision-a",
          "data/submitted-applications/aliased.pdf",
          "c".repeat(64),
          1,
          "application/pdf",
          "passed",
        ),
    ).toThrow(/cannot alias working pdf_path/);
    expect(() =>
      database
        .prepare(
          "INSERT INTO submitted_application_artifacts(id, tenant_id, dossier_id, job_id, draft_revision_id, storage_path, sha256, byte_size, media_type, qa_result) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)",
        )
        .run(
          "artifact-a",
          "tenant-a",
          "dossier-a",
          "job-a",
          "revision-a",
          "data/submitted-applications/a.pdf",
          "c".repeat(64),
          1,
          "application/pdf",
          "passed",
        ),
    ).not.toThrow();
    expect(() =>
      database
        .prepare("DELETE FROM submitted_application_artifacts WHERE id = ?")
        .run("artifact-a"),
    ).toThrow(/append-only/);
    expect(() =>
      database
        .prepare(
          "INSERT INTO submitted_application_artifacts(id, tenant_id, dossier_id, job_id, draft_revision_id, storage_path, sha256, byte_size, media_type, qa_result) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)",
        )
        .run(
          "artifact-retry",
          "tenant-a",
          "dossier-a",
          "job-a",
          "revision-a",
          "data/submitted-applications/retry.pdf",
          "c".repeat(64),
          1,
          "application/pdf",
          "passed",
        ),
    ).toThrow(/UNIQUE constraint failed/);
  });

  it("rejects bounded and unsafe immutable application inputs", () => {
    const database = databaseWithJobs();
    runVersionedMigrations(database);
    database.exec(`
      INSERT INTO tenants(id) VALUES ('tenant-a');
      INSERT INTO jobs(id, tenant_id) VALUES ('job-a', 'tenant-a');
      INSERT INTO application_dossiers(id, tenant_id, job_id, lifecycle_state)
      VALUES ('dossier-a', 'tenant-a', 'job-a', 'draft');
    `);

    const insertRevision = (overrides: Partial<Record<string, string>> = {}) =>
      database
        .prepare(
          `INSERT INTO application_draft_revisions(
            id, tenant_id, dossier_id, job_id, revision_number, job_snapshot,
            resume_snapshot, story_snapshot, content_snapshot, provenance, content_hash
          ) VALUES (?, 'tenant-a', 'dossier-a', 'job-a', 1, ?, ?, ?, ?, ?, ?)`,
        )
        .run(
          overrides.id ?? "revision-a",
          overrides.jobSnapshot ?? "{}",
          overrides.resumeSnapshot ?? "{}",
          overrides.storySnapshot ?? "{}",
          overrides.contentSnapshot ?? "{}",
          overrides.provenance ?? "{}",
          overrides.contentHash ?? "a".repeat(64),
        );

    expect(() => insertRevision({ contentHash: "g".repeat(64) })).toThrow(
      /SHA-256/,
    );
    expect(() =>
      insertRevision({ resumeSnapshot: `"${"x".repeat(500_001)}"` }),
    ).toThrow(/CHECK constraint failed/);
    insertRevision();
    expect(() =>
      database
        .prepare(
          `INSERT INTO submitted_application_artifacts(
            id, tenant_id, dossier_id, job_id, draft_revision_id, storage_path,
            sha256, byte_size, media_type, qa_result
          ) VALUES (?, 'tenant-a', 'dossier-a', 'job-a', 'revision-a', ?, ?, 1, ?, 'passed')`,
        )
        .run(
          "artifact-invalid",
          "data/submitted-applications/../working.pdf",
          "z".repeat(64),
          "not a media type",
        ),
    ).toThrow(/submitted application artifact/);
    expect(() =>
      database
        .prepare(
          `INSERT INTO job_posting_snapshots(
            id, tenant_id, job_id, normalized_text, content_hash, source_url,
            retrieved_at, retrieval_metadata
          ) VALUES ('posting-invalid', 'tenant-a', 'job-a', ?, ?, 'https://example.com', '2026-01-01T00:00:00.000Z', '{}')`,
        )
        .run("x".repeat(1_000_001), "f".repeat(64)),
    ).toThrow(/CHECK constraint failed/);
  });

  it("enforces immutable, bounded stage-event observation snapshots", () => {
    const database = databaseWithJobs();
    runVersionedMigrations(database);
    database.exec(`
      INSERT INTO tenants(id) VALUES ('tenant-a');
      INSERT INTO competencies(id, tenant_id, name)
      VALUES ('competency-a', 'tenant-a', 'Communication');
      INSERT INTO competency_evidence(
        id, tenant_id, competency_id, source_type, source_id, extraction_method,
        confidence, evidence_excerpt, evidence_hash, observation_stage, observation_outcome
      ) VALUES (
        'evidence-a', 'tenant-a', 'competency-a', 'stage_event', 'event-a', 'manual',
        0.8, 'Recorded interview result', '${"a".repeat(64)}', 'technical_interview', 'rejected'
      );
    `);

    expect(() =>
      database
        .prepare(
          `INSERT INTO competency_evidence(
            id, tenant_id, competency_id, source_type, source_id, extraction_method,
            confidence, evidence_excerpt, evidence_hash
          ) VALUES ('evidence-missing', 'tenant-a', 'competency-a', 'stage_event', 'event-b', 'manual', 0.8, 'Missing snapshot', '${"b".repeat(64)}')`,
        )
        .run(),
    ).toThrow(/CHECK constraint failed/);
    expect(() =>
      database
        .prepare(
          `INSERT INTO competency_evidence(
            id, tenant_id, competency_id, source_type, source_id, extraction_method,
            confidence, evidence_excerpt, evidence_hash, observation_stage, observation_outcome
          ) VALUES ('evidence-invalid', 'tenant-a', 'competency-a', 'stage_event', 'event-c', 'manual', 0.8, 'Invalid snapshot', '${"c".repeat(64)}', 'invalid', 'rejected')`,
        )
        .run(),
    ).toThrow(/CHECK constraint failed/);
    expect(() =>
      database
        .prepare(
          "UPDATE competency_evidence SET observation_outcome = 'withdrawn' WHERE id = 'evidence-a'",
        )
        .run(),
    ).toThrow(/append-only/);
  });

  it("allows only one final artifact and retains audit records with their parents", () => {
    const database = databaseWithJobs();
    runVersionedMigrations(database);
    database.exec(`
      INSERT INTO tenants(id) VALUES ('tenant-a');
      INSERT INTO jobs(id, tenant_id) VALUES ('job-a', 'tenant-a');
      INSERT INTO interview_stories(id, tenant_id) VALUES ('story-a', 'tenant-a');
      INSERT INTO application_dossiers(id, tenant_id, job_id, lifecycle_state)
      VALUES ('dossier-a', 'tenant-a', 'job-a', 'draft');
      INSERT INTO application_draft_revisions(
        id, tenant_id, dossier_id, job_id, revision_number, job_snapshot, resume_snapshot,
        story_snapshot, content_snapshot, provenance, content_hash
      ) VALUES ('revision-a', 'tenant-a', 'dossier-a', 'job-a', 1, '{}', '{}', '{}', '{}', '{}', '${"a".repeat(64)}');
      INSERT INTO story_usage_events(id, tenant_id, story_id, job_id, usage_kind, provenance)
      VALUES ('usage-a', 'tenant-a', 'story-a', 'job-a', 'draft', '{}');
    `);
    const insertArtifact = (id: string, sha256: string) =>
      database
        .prepare(
          `INSERT INTO submitted_application_artifacts(
            id, tenant_id, dossier_id, job_id, draft_revision_id, storage_path,
            sha256, byte_size, media_type, qa_result
          ) VALUES (?, 'tenant-a', 'dossier-a', 'job-a', 'revision-a', ?, ?, 1, 'application/pdf', 'passed')`,
        )
        .run(id, `data/submitted-applications/${id}.pdf`, sha256);
    insertArtifact("artifact-a", "b".repeat(64));

    expect(() => insertArtifact("artifact-retry", "c".repeat(64))).toThrow(
      /UNIQUE constraint failed/,
    );
    expect(() =>
      database
        .prepare("DELETE FROM story_usage_events WHERE id = ?")
        .run("usage-a"),
    ).toThrow(/append-only/);
    expect(() =>
      database
        .prepare("UPDATE story_usage_events SET usage_kind = ? WHERE id = ?")
        .run("interview_prep", "usage-a"),
    ).toThrow(/append-only/);
    expect(() =>
      database
        .prepare("DELETE FROM application_dossiers WHERE id = ?")
        .run("dossier-a"),
    ).toThrow(/FOREIGN KEY constraint failed/);
    expect(() =>
      database.prepare("DELETE FROM jobs WHERE id = ?").run("job-a"),
    ).toThrow(/FOREIGN KEY constraint failed/);
    expect(() =>
      database.prepare("DELETE FROM tenants WHERE id = ?").run("tenant-a"),
    ).toThrow(/FOREIGN KEY constraint failed/);
  });

  it("keeps approval users referenced with RESTRICT and allows only one tenant overlay", () => {
    const database = databaseWithJobs();
    runVersionedMigrations(database);
    database.exec(`
      INSERT INTO tenants(id) VALUES ('tenant-a');
      INSERT INTO users(id) VALUES ('user-a');
      INSERT INTO tenant_memberships(id, tenant_id, user_id) VALUES ('membership-a', 'tenant-a', 'user-a');
      INSERT INTO jobs(id, tenant_id) VALUES ('job-a', 'tenant-a');
      INSERT INTO application_dossiers(id, tenant_id, job_id, lifecycle_state) VALUES ('dossier-a', 'tenant-a', 'job-a', 'draft');
      INSERT INTO application_approvals(id, tenant_id, dossier_id, job_id, decision, approved_by_user_id, policy_version, request_id)
      VALUES ('approval-a', 'tenant-a', 'dossier-a', 'job-a', 'approved', 'user-a', 'policy-1', 'request-1');
      INSERT INTO job_posting_snapshots(
        id, tenant_id, job_id, normalized_text, content_hash, source_url, retrieved_at, retrieval_metadata
      ) VALUES ('posting-a', 'tenant-a', 'job-a', 'Normalized posting', '${"e".repeat(64)}', 'https://example.com/jobs/a', '2026-01-01T00:00:00.000Z', '{}');
      INSERT INTO career_profile_overlays(tenant_id, preferences, targets, constraints, provenance)
      VALUES ('tenant-a', '{}', '{}', '{}', '{}');
    `);
    expect(() =>
      database.prepare("DELETE FROM users WHERE id = ?").run("user-a"),
    ).toThrow(/FOREIGN KEY constraint failed/);
    expect(() =>
      database
        .prepare("UPDATE application_approvals SET decision = ? WHERE id = ?")
        .run("rejected", "approval-a"),
    ).toThrow(/append-only/);
    expect(() =>
      database
        .prepare(
          "UPDATE job_posting_snapshots SET normalized_text = ? WHERE id = ?",
        )
        .run("Changed", "posting-a"),
    ).toThrow(/append-only/);
    expect(() =>
      database
        .prepare("DELETE FROM application_dossiers WHERE id = ?")
        .run("dossier-a"),
    ).toThrow(/FOREIGN KEY constraint failed/);
    expect(
      database
        .prepare("SELECT id FROM application_approvals WHERE id = ?")
        .get("approval-a"),
    ).toEqual({ id: "approval-a" });
    expect(() =>
      database
        .prepare(
          "INSERT INTO career_profile_overlays(tenant_id, preferences, targets, constraints, provenance) VALUES (?, ?, ?, ?, ?)",
        )
        .run("tenant-a", "{}", "{}", "{}", "{}"),
    ).toThrow(/UNIQUE constraint failed/);
    expect(() =>
      database
        .prepare(
          "INSERT INTO career_profile_overlays(tenant_id, preferences, targets, constraints, provenance) VALUES (?, ?, ?, ?, ?)",
        )
        .run("tenant-missing", "{}", "{}", "{}", "{}"),
    ).toThrow(/FOREIGN KEY constraint failed/);
  });
});
