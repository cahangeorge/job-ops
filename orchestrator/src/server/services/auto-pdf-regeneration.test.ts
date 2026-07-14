import {
  runVersionedMigrations,
  VERSIONED_MIGRATIONS,
} from "@server/db/versionedMigrations";
import { createJob } from "@shared/testing/factories";
import Database from "better-sqlite3";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  enqueue: vi.fn(),
  reserveNext: vi.fn(),
  acknowledge: vi.fn(),
  reject: vi.fn(),
  getReadyJobsWithGeneratedPdfs: vi.fn(),
  getJobById: vi.fn(),
  generateFinalPdf: vi.fn(),
}));

vi.mock("@server/infra/job-queue-registry", () => ({
  getJobQueue: vi.fn(() => ({
    enqueue: mocks.enqueue,
    reserveNext: mocks.reserveNext,
    acknowledge: mocks.acknowledge,
    reject: mocks.reject,
  })),
}));

vi.mock("@server/repositories/jobs", () => ({
  getReadyJobsWithGeneratedPdfs: mocks.getReadyJobsWithGeneratedPdfs,
  getJobById: mocks.getJobById,
}));

vi.mock("../pipeline", () => ({
  generateFinalPdf: mocks.generateFinalPdf,
}));

vi.mock("@server/tenancy/context", () => ({
  getActiveTenantId: vi.fn(() => "tenant-test"),
}));

vi.mock("./pdf-fingerprint", () => ({
  resolvePdfFingerprintContext: vi.fn().mockResolvedValue({
    version: "v1",
    designResumeDocumentId: null,
    designResumeRevision: null,
    designResumeUpdatedAt: null,
    pdfRenderer: "latex",
    typstTheme: "classic",
    rxresumeBaseResumeId: null,
  }),
  getJobPdfFreshness: vi.fn((job: { pdfFingerprint?: string | null }) =>
    job.pdfFingerprint === "fresh" ? "current" : "stale",
  ),
}));

import { getJobQueue } from "@server/infra/job-queue-registry";
import { SqliteJobQueue } from "@server/infra/job-queue-sqlite";
import {
  enqueueAutoPdfRegenerationForJob,
  enqueueAutoPdfRegenerationForSettingsChanges,
  initializeAutoPdfRegenerationWorker,
  shouldEnqueueTailoringAutoPdfRegeneration,
  stopAutoPdfRegenerationWorker,
  wakeAutoPdfRegenerationWorker,
} from "./auto-pdf-regeneration";
import { resolvePdfFingerprintContext } from "./pdf-fingerprint";

async function waitForCondition(
  condition: () => boolean,
  description: string,
): Promise<void> {
  for (let attempt = 0; attempt < 100; attempt += 1) {
    if (condition()) return;
    await new Promise<void>((resolve) => setImmediate(resolve));
  }
  throw new Error(`Timed out waiting for ${description}`);
}

describe("auto PDF regeneration", () => {
  beforeEach(async () => {
    vi.useRealTimers();
    await stopAutoPdfRegenerationWorker({ timeoutMs: 0 });
    const { sqlite } = await import("@server/db");
    sqlite.exec(
      "CREATE TABLE IF NOT EXISTS design_resume_documents (tenant_id TEXT NOT NULL, id TEXT NOT NULL, revision INTEGER NOT NULL, PRIMARY KEY (tenant_id, id))",
    );
    vi.clearAllMocks();
    vi.mocked(getJobQueue).mockReturnValue({
      enqueue: mocks.enqueue,
      reserveNext: mocks.reserveNext,
      acknowledge: mocks.acknowledge,
      reject: mocks.reject,
    });
    mocks.enqueue.mockResolvedValue({
      id: "queue-job-1",
      queue: "auto_pdf_regeneration",
      acceptedAt: "2026-05-04T10:00:00.000Z",
      deduplicated: false,
    });
    mocks.reserveNext.mockResolvedValue(null);
    mocks.acknowledge.mockResolvedValue(undefined);
    mocks.reject.mockResolvedValue(undefined);
    mocks.getReadyJobsWithGeneratedPdfs.mockResolvedValue([]);
    mocks.getJobById.mockResolvedValue(null);
    mocks.generateFinalPdf.mockResolvedValue({ success: true });
    vi.mocked(resolvePdfFingerprintContext).mockResolvedValue({
      version: "v1",
      designResumeDocumentId: null,
      designResumeRevision: null,
      designResumeUpdatedAt: null,
      pdfRenderer: "latex",
      typstTheme: "classic",
      rxresumeBaseResumeId: null,
    });
  });

  afterEach(async () => {
    vi.useRealTimers();
    await stopAutoPdfRegenerationWorker({ timeoutMs: 0 });
  });

  it("installs only persisted correlation ids while executing a claimed task", async () => {
    const { getRequestContext } = await import("@infra/request-context");
    let observedContext: ReturnType<typeof getRequestContext>;
    mocks.reserveNext
      .mockResolvedValueOnce({
        id: "job-context-1",
        queue: "auto_pdf_regeneration",
        acceptedAt: "2026-05-04T10:00:00.000Z",
        requestContext: {
          requestId: "request-1",
          pipelineRunId: "pipeline-1",
          jobId: "job-context",
        },
        payload: {
          tenantId: "tenant-test",
          jobId: "job-context",
          reason: "manual_refresh",
          requestedAt: "2026-05-04T10:00:00.000Z",
          requestedBy: "user",
        },
      })
      .mockResolvedValue(null);
    mocks.getJobById.mockImplementation(async () => {
      observedContext = getRequestContext();
      return null;
    });

    await initializeAutoPdfRegenerationWorker();
    await waitForCondition(
      () => observedContext !== undefined,
      "the claimed task request context",
    );

    expect(observedContext).toMatchObject({
      requestId: "request-1",
      pipelineRunId: "pipeline-1",
      jobId: "job-context",
      tenantId: "tenant-test",
    });
  });

  it("wakes a live durable worker for a failed task retry without another producer or restart", async () => {
    vi.useFakeTimers({ now: new Date("2026-05-04T10:00:00.000Z") });
    const database = new Database(":memory:");
    database.pragma("foreign_keys = ON");
    database.exec("CREATE TABLE tenants (id TEXT PRIMARY KEY)");
    database.exec("INSERT INTO tenants(id) VALUES ('tenant-test')");
    runVersionedMigrations(
      database,
      VERSIONED_MIGRATIONS.filter(({ version }) => version >= 6),
    );
    const queue = new SqliteJobQueue(database, {
      now: () => new Date(Date.now()),
      random: () => 0,
    });
    vi.mocked(getJobQueue).mockReturnValue(queue);
    mocks.getJobById.mockResolvedValue(
      createJob({
        id: "retry-job",
        status: "ready",
        pdfSource: "generated",
        pdfFingerprint: "stale",
      }),
    );
    mocks.generateFinalPdf
      .mockRejectedValueOnce(new Error("temporary renderer failure"))
      .mockResolvedValueOnce({ success: true });
    try {
      await initializeAutoPdfRegenerationWorker();
      await enqueueAutoPdfRegenerationForJob({
        jobId: "retry-job",
        reason: "manual_refresh",
        requestedBy: "system",
      });
      await vi.advanceTimersByTimeAsync(0);
      expect(mocks.generateFinalPdf).toHaveBeenCalledTimes(1);

      await vi.advanceTimersByTimeAsync(1000);
      expect(mocks.generateFinalPdf).toHaveBeenCalledTimes(2);
      expect(await queue.getDeadLetters("tenant-test")).toEqual([]);
    } finally {
      await stopAutoPdfRegenerationWorker({ timeoutMs: 0 });
      database.close();
      vi.useRealTimers();
    }
  });

  it("schedules future outbox work at startup and processes it when due without another producer", async () => {
    vi.useFakeTimers({ now: new Date("2026-05-04T10:00:00.000Z") });
    const database = new Database(":memory:");
    database.pragma("foreign_keys = ON");
    database.exec("CREATE TABLE tenants (id TEXT PRIMARY KEY)");
    database.exec("INSERT INTO tenants(id) VALUES ('tenant-test')");
    runVersionedMigrations(
      database,
      VERSIONED_MIGRATIONS.filter(({ version }) => version >= 6),
    );
    const queue = new SqliteJobQueue(database, {
      now: () => new Date(Date.now()),
      random: () => 0,
    });
    vi.mocked(getJobQueue).mockReturnValue(queue);
    mocks.getJobById.mockResolvedValue(
      createJob({
        id: "future-job",
        status: "ready",
        pdfSource: "generated",
        pdfFingerprint: "stale",
      }),
    );
    try {
      await queue.enqueueOutbox(
        "auto_pdf_regeneration",
        {
          tenantId: "tenant-test",
          jobId: "future-job",
          reason: "manual_refresh",
          requestedAt: new Date(Date.now()).toISOString(),
          requestedBy: "system",
        },
        { delayMs: 1000 },
      );

      await initializeAutoPdfRegenerationWorker();
      await vi.advanceTimersByTimeAsync(999);
      expect(mocks.generateFinalPdf).not.toHaveBeenCalled();

      await vi.advanceTimersByTimeAsync(1);
      expect(mocks.generateFinalPdf).toHaveBeenCalledTimes(1);
    } finally {
      database.close();
      vi.useRealTimers();
    }
  });

  it("keeps a future wake after an immediate task arrives", async () => {
    vi.useFakeTimers({ now: new Date("2026-05-04T10:00:00.000Z") });
    const database = new Database(":memory:");
    database.pragma("foreign_keys = ON");
    database.exec("CREATE TABLE tenants (id TEXT PRIMARY KEY)");
    database.exec("INSERT INTO tenants(id) VALUES ('tenant-test')");
    runVersionedMigrations(
      database,
      VERSIONED_MIGRATIONS.filter(({ version }) => version >= 6),
    );
    const queue = new SqliteJobQueue(database, {
      now: () => new Date(Date.now()),
      random: () => 0,
    });
    vi.mocked(getJobQueue).mockReturnValue(queue);
    mocks.getJobById.mockImplementation(async (jobId: string) =>
      createJob({
        id: jobId,
        status: "ready",
        pdfSource: "generated",
        pdfFingerprint: "stale",
      }),
    );
    try {
      await queue.enqueueOutbox(
        "auto_pdf_regeneration",
        {
          tenantId: "tenant-test",
          jobId: "future-job",
          reason: "manual_refresh",
          requestedAt: new Date(Date.now()).toISOString(),
          requestedBy: "system",
        },
        { delayMs: 1000 },
      );
      await initializeAutoPdfRegenerationWorker();

      await enqueueAutoPdfRegenerationForJob({
        jobId: "immediate-job",
        reason: "manual_refresh",
        requestedBy: "system",
      });
      await vi.advanceTimersByTimeAsync(0);
      expect(mocks.generateFinalPdf).toHaveBeenCalledTimes(1);

      await vi.advanceTimersByTimeAsync(1000);
      expect(mocks.generateFinalPdf).toHaveBeenCalledTimes(2);
    } finally {
      database.close();
      vi.useRealTimers();
    }
  });

  it("recovers an expired lease at its durable wake after an immediate drain", async () => {
    vi.useFakeTimers({ now: new Date("2026-05-04T10:00:00.000Z") });
    const database = new Database(":memory:");
    database.pragma("foreign_keys = ON");
    database.exec("CREATE TABLE tenants (id TEXT PRIMARY KEY)");
    database.exec("INSERT INTO tenants(id) VALUES ('tenant-test')");
    runVersionedMigrations(
      database,
      VERSIONED_MIGRATIONS.filter(({ version }) => version >= 6),
    );
    const queue = new SqliteJobQueue(database, {
      now: () => new Date(Date.now()),
      random: () => 0,
    });
    vi.mocked(getJobQueue).mockReturnValue(queue);
    mocks.getJobById.mockImplementation(async (jobId: string) =>
      createJob({
        id: jobId,
        status: "ready",
        pdfSource: "generated",
        pdfFingerprint: "stale",
      }),
    );
    try {
      await queue.enqueue("auto_pdf_regeneration", {
        tenantId: "tenant-test",
        jobId: "expired-lease-job",
        reason: "manual_refresh",
        requestedAt: new Date(Date.now()).toISOString(),
        requestedBy: "system",
      });
      const abandoned = await queue.claimNext(
        "auto_pdf_regeneration",
        "worker-a",
        { leaseMs: 1_000 },
      );
      if (!abandoned) throw new Error("Expected initial lease");

      await initializeAutoPdfRegenerationWorker();
      await enqueueAutoPdfRegenerationForJob({
        jobId: "immediate-job",
        reason: "manual_refresh",
        requestedBy: "system",
      });
      await vi.advanceTimersByTimeAsync(0);
      expect(mocks.generateFinalPdf).toHaveBeenCalledTimes(1);

      await vi.advanceTimersByTimeAsync(1_000);
      expect(mocks.generateFinalPdf).toHaveBeenCalledTimes(2);
    } finally {
      database.close();
      vi.useRealTimers();
    }
  });

  it("quiesces without claiming another task and lets startup recover the timed-out active lease", async () => {
    let current = new Date("2026-05-04T10:00:00.000Z");
    const database = new Database(":memory:");
    database.pragma("foreign_keys = ON");
    database.exec("CREATE TABLE tenants (id TEXT PRIMARY KEY)");
    database.exec("INSERT INTO tenants(id) VALUES ('tenant-test')");
    runVersionedMigrations(
      database,
      VERSIONED_MIGRATIONS.filter(({ version }) => version >= 6),
    );
    const queue = new SqliteJobQueue(database, { now: () => current });
    vi.mocked(getJobQueue).mockReturnValue(queue);
    let releaseActive!: () => void;
    mocks.getJobById.mockImplementation(
      () =>
        new Promise((resolve) => {
          releaseActive = () => resolve(null);
        }),
    );
    try {
      await queue.enqueue("auto_pdf_regeneration", {
        tenantId: "tenant-test",
        jobId: "active",
        reason: "manual_refresh",
        requestedAt: current.toISOString(),
        requestedBy: "system",
      });
      await queue.enqueue("auto_pdf_regeneration", {
        tenantId: "tenant-test",
        jobId: "waiting",
        reason: "manual_refresh",
        requestedAt: current.toISOString(),
        requestedBy: "system",
      });

      await initializeAutoPdfRegenerationWorker();
      await waitForCondition(
        () =>
          (
            database
              .prepare(
                "SELECT state FROM workflow_tasks WHERE json_extract(payload_json, '$.jobId') = 'active'",
              )
              .get() as { state: string } | undefined
          )?.state === "leased",
        "the active task claim",
      );
      await stopAutoPdfRegenerationWorker({ timeoutMs: 1 });

      expect(
        database
          .prepare(
            "SELECT state FROM workflow_tasks WHERE json_extract(payload_json, '$.jobId') = 'active'",
          )
          .get(),
      ).toEqual({ state: "leased" });
      expect(
        database
          .prepare(
            "SELECT state FROM workflow_tasks WHERE json_extract(payload_json, '$.jobId') = 'waiting'",
          )
          .get(),
      ).toEqual({ state: "ready" });

      current = new Date(current.getTime() + 30_001);
      releaseActive();
      await stopAutoPdfRegenerationWorker({ timeoutMs: 1000 });
      mocks.getJobById.mockResolvedValue(null);
      await initializeAutoPdfRegenerationWorker();
      await waitForCondition(
        () =>
          (
            database
              .prepare(
                "SELECT state FROM workflow_tasks WHERE json_extract(payload_json, '$.jobId') = 'active'",
              )
              .get() as { state: string } | undefined
          )?.state === "completed",
        "the recovered active task to settle",
      );
      await stopAutoPdfRegenerationWorker({ timeoutMs: 1000 });

      expect(
        database
          .prepare(
            "SELECT attempt_count, state FROM workflow_tasks WHERE json_extract(payload_json, '$.jobId') = 'active'",
          )
          .get(),
      ).toEqual({ attempt_count: 2, state: "completed" });
    } finally {
      await stopAutoPdfRegenerationWorker({ timeoutMs: 10 });
      database.close();
    }
  });

  it("does not claim work when the reserve gate is closed before the SQL claim", async () => {
    const database = new Database(":memory:");
    database.pragma("foreign_keys = ON");
    database.exec("CREATE TABLE tenants (id TEXT PRIMARY KEY)");
    database.exec("INSERT INTO tenants(id) VALUES ('tenant-test')");
    runVersionedMigrations(
      database,
      VERSIONED_MIGRATIONS.filter(({ version }) => version >= 6),
    );
    const queue = new SqliteJobQueue(database);
    await queue.enqueue("auto_pdf_regeneration", {
      tenantId: "tenant-test",
      jobId: "waiting",
      reason: "manual_refresh",
      requestedAt: "2026-05-04T10:00:00.000Z",
      requestedBy: "system",
    });

    const result = await queue.reserveNext("auto_pdf_regeneration", {
      shouldClaim: () => false,
    });

    expect(result).toBeNull();
    expect(
      database
        .prepare(
          "SELECT state, lease_owner FROM workflow_tasks WHERE json_extract(payload_json, '$.jobId') = 'waiting'",
        )
        .get(),
    ).toEqual({ state: "ready", lease_owner: null });
    database.close();
  });

  it("defers initialization rather than awaiting a permanently unresolved old drain", async () => {
    let releaseActive!: () => void;
    mocks.reserveNext.mockImplementationOnce(
      () =>
        new Promise((resolve) => {
          releaseActive = () => resolve(null);
        }),
    );
    await initializeAutoPdfRegenerationWorker();
    await waitForCondition(() => releaseActive !== undefined, "old drain");
    await stopAutoPdfRegenerationWorker({ timeoutMs: 0 });

    await expect(
      initializeAutoPdfRegenerationWorker({ previousDrainTimeoutMs: 0 }),
    ).resolves.toEqual({
      started: false,
      reason: "previous_drain_active",
    });
    expect(mocks.reserveNext).toHaveBeenCalledTimes(1);

    releaseActive();
    await stopAutoPdfRegenerationWorker({ timeoutMs: 100 });
  });

  it("wakes a live durable worker to claim and process a replayed task", async () => {
    const database = new Database(":memory:");
    database.pragma("foreign_keys = ON");
    database.exec("CREATE TABLE tenants (id TEXT PRIMARY KEY)");
    database.exec("INSERT INTO tenants(id) VALUES ('tenant-test')");
    runVersionedMigrations(
      database,
      VERSIONED_MIGRATIONS.filter(({ version }) => version >= 6),
    );
    const queue = new SqliteJobQueue(database);
    vi.mocked(getJobQueue).mockReturnValue(queue);
    mocks.getJobById.mockResolvedValue(null);
    try {
      await initializeAutoPdfRegenerationWorker();
      await queue.enqueue("auto_pdf_regeneration", {
        tenantId: "tenant-test",
        jobId: "replayed-job",
        reason: "manual_refresh",
        requestedAt: new Date().toISOString(),
        requestedBy: "system",
      });
      await wakeAutoPdfRegenerationWorker();
      await waitForCondition(
        () =>
          (
            database.prepare("SELECT state FROM workflow_tasks").get() as {
              state: string;
            }
          ).state === "completed",
        "the replayed task to be processed",
      );
    } finally {
      await stopAutoPdfRegenerationWorker({ timeoutMs: 100 });
      database.close();
    }
  });

  it("schedules a future retry after restart and lets it reach the DLQ", async () => {
    vi.useFakeTimers({ now: new Date("2026-05-04T10:00:00.000Z") });
    const database = new Database(":memory:");
    database.pragma("foreign_keys = ON");
    database.exec("CREATE TABLE tenants (id TEXT PRIMARY KEY)");
    database.exec("INSERT INTO tenants(id) VALUES ('tenant-test')");
    runVersionedMigrations(
      database,
      VERSIONED_MIGRATIONS.filter(({ version }) => version >= 6),
    );
    const queue = new SqliteJobQueue(database, {
      now: () => new Date(Date.now()),
      random: () => 0,
    });
    vi.mocked(getJobQueue).mockReturnValue(queue);
    mocks.getJobById.mockResolvedValue(
      createJob({
        id: "retry-after-restart",
        status: "ready",
        pdfSource: "generated",
        pdfFingerprint: "stale",
      }),
    );
    mocks.generateFinalPdf.mockRejectedValue(new Error("renderer unavailable"));
    try {
      await queue.enqueue(
        "auto_pdf_regeneration",
        {
          tenantId: "tenant-test",
          jobId: "retry-after-restart",
          reason: "manual_refresh",
          requestedAt: new Date(Date.now()).toISOString(),
          requestedBy: "system",
        },
        { maxAttempts: 2 },
      );
      const first = await queue.claimNext(
        "auto_pdf_regeneration",
        "old-worker",
      );
      if (!first) throw new Error("Expected initial task claim");
      await queue.fail(first.id, {
        tenantId: "tenant-test",
        leaseOwner: first.leaseOwner,
        message: "restart before retry",
        retryable: true,
      });

      await initializeAutoPdfRegenerationWorker();
      await vi.advanceTimersByTimeAsync(1000);

      expect(mocks.generateFinalPdf).toHaveBeenCalledTimes(1);
      expect(await queue.getDeadLetters("tenant-test")).toHaveLength(1);
    } finally {
      database.close();
      vi.useRealTimers();
    }
  });

  it("skips enqueue for non-PDF-impacting setting changes", async () => {
    const enqueued = await enqueueAutoPdfRegenerationForSettingsChanges({
      updatedSettingKeys: ["model", "searchTerms"],
      requestedBy: "user",
    });

    expect(enqueued).toBe(0);
    expect(mocks.getReadyJobsWithGeneratedPdfs).not.toHaveBeenCalled();
    expect(mocks.enqueue).not.toHaveBeenCalled();
  });

  it("enqueues ready generated PDFs with settings_changed reason", async () => {
    mocks.getReadyJobsWithGeneratedPdfs.mockResolvedValue([
      createJob({
        id: "job-1",
        status: "ready",
        pdfPath: "data/pdfs/job-1.pdf",
        pdfSource: "generated",
        pdfFingerprint: "stale",
      }),
      createJob({
        id: "job-2",
        status: "ready",
        pdfPath: "data/pdfs/job-2.pdf",
        pdfSource: "generated",
        pdfFingerprint: "stale",
      }),
    ]);

    const enqueued = await enqueueAutoPdfRegenerationForSettingsChanges({
      updatedSettingKeys: ["pdfRenderer"],
      requestedBy: "user",
    });

    expect(enqueued).toBe(2);
    expect(mocks.getReadyJobsWithGeneratedPdfs).toHaveBeenCalledWith(25, 0);
    expect(mocks.enqueue).toHaveBeenCalledTimes(2);
    expect(mocks.enqueue).toHaveBeenNthCalledWith(
      1,
      "auto_pdf_regeneration",
      expect.objectContaining({
        tenantId: "tenant-test",
        jobId: "job-1",
        reason: "settings_changed",
        requestedBy: "user",
      }),
      { dedupeKey: "tenant-test:job-1" },
    );
    expect(mocks.enqueue).toHaveBeenNthCalledWith(
      2,
      "auto_pdf_regeneration",
      expect.objectContaining({
        tenantId: "tenant-test",
        jobId: "job-2",
        reason: "settings_changed",
        requestedBy: "user",
      }),
      { dedupeKey: "tenant-test:job-2" },
    );
  });

  it("fans out a dispatched settings root task into deduplicated stale-job tasks", async () => {
    mocks.reserveNext
      .mockResolvedValueOnce({
        id: "settings-root-1",
        queue: "auto_pdf_regeneration",
        acceptedAt: "2026-05-04T10:00:00.000Z",
        payload: {
          taskType: "settings_auto_pdf_root",
          tenantId: "tenant-test",
          updatedSettingKeys: ["pdfRenderer"],
          requestedAt: "2026-05-04T10:00:00.000Z",
          requestedBy: "user",
          transactionId: "settings-revision-1",
          requestId: "request-1",
        },
      })
      .mockResolvedValue(null);
    mocks.getReadyJobsWithGeneratedPdfs.mockResolvedValue([
      createJob({
        id: "job-stale",
        status: "ready",
        pdfPath: "data/pdfs/job-stale.pdf",
        pdfSource: "generated",
        pdfFingerprint: "stale",
      }),
    ]);

    await initializeAutoPdfRegenerationWorker();
    await waitForCondition(
      () => mocks.enqueue.mock.calls.length > 0,
      "the settings root fanout",
    );

    expect(mocks.enqueue).toHaveBeenCalledWith(
      "auto_pdf_regeneration",
      expect.objectContaining({
        tenantId: "tenant-test",
        jobId: "job-stale",
        reason: "settings_changed",
      }),
      { dedupeKey: "tenant-test:job-stale" },
    );
  });

  it("fans out a claimed Design Resume revision root only after it is dispatched", async () => {
    mocks.reserveNext
      .mockResolvedValueOnce({
        id: "design-resume-root-1",
        queue: "auto_pdf_regeneration",
        acceptedAt: "2026-05-04T10:00:00.000Z",
        payload: {
          taskType: "design_resume_auto_pdf_root",
          tenantId: "tenant-test",
          documentId: "primary_tenant-test",
          revision: 8,
          requestedAt: "2026-05-04T10:00:00.000Z",
          requestedBy: "user",
        },
      })
      .mockResolvedValue(null);
    mocks.getReadyJobsWithGeneratedPdfs.mockResolvedValue([
      createJob({
        id: "job-stale-from-resume",
        status: "ready",
        pdfPath: "data/pdfs/job-stale-from-resume.pdf",
        pdfSource: "generated",
        pdfFingerprint: "stale",
      }),
    ]);

    await initializeAutoPdfRegenerationWorker();
    await waitForCondition(
      () => mocks.enqueue.mock.calls.length > 0,
      "the Design Resume root fanout",
    );

    expect(mocks.enqueue).toHaveBeenCalledWith(
      "auto_pdf_regeneration",
      expect.objectContaining({
        tenantId: "tenant-test",
        jobId: "job-stale-from-resume",
        reason: "design_resume_updated",
      }),
      { dedupeKey: "tenant-test:job-stale-from-resume" },
    );
  });

  it("skips current generated PDFs when enqueueing settings refreshes", async () => {
    mocks.getReadyJobsWithGeneratedPdfs.mockResolvedValue([
      createJob({
        id: "job-current",
        status: "ready",
        pdfPath: "data/pdfs/job-current.pdf",
        pdfSource: "generated",
        pdfFingerprint: "fresh",
      }),
      createJob({
        id: "job-stale",
        status: "ready",
        pdfPath: "data/pdfs/job-stale.pdf",
        pdfSource: "generated",
        pdfFingerprint: "stale",
      }),
    ]);

    const enqueued = await enqueueAutoPdfRegenerationForSettingsChanges({
      updatedSettingKeys: ["pdfRenderer"],
      requestedBy: "user",
    });

    expect(enqueued).toBe(1);
    expect(mocks.enqueue).toHaveBeenCalledTimes(1);
    expect(mocks.enqueue).toHaveBeenCalledWith(
      "auto_pdf_regeneration",
      expect.objectContaining({ jobId: "job-stale" }),
      { dedupeKey: "tenant-test:job-stale" },
    );
  });

  it("skips Typst theme-only setting changes when Typst is not active", async () => {
    const enqueued = await enqueueAutoPdfRegenerationForSettingsChanges({
      updatedSettingKeys: ["typstTheme"],
      requestedBy: "user",
    });

    expect(enqueued).toBe(0);
    expect(mocks.getReadyJobsWithGeneratedPdfs).not.toHaveBeenCalled();
    expect(mocks.enqueue).not.toHaveBeenCalled();
  });

  it("enqueues Typst theme-only setting changes when Typst is active", async () => {
    vi.mocked(resolvePdfFingerprintContext).mockResolvedValue({
      version: "v1",
      designResumeDocumentId: null,
      designResumeRevision: null,
      designResumeUpdatedAt: null,
      pdfRenderer: "typst",
      typstTheme: "compact",
      rxresumeBaseResumeId: null,
    });
    mocks.getReadyJobsWithGeneratedPdfs.mockResolvedValue([
      createJob({
        id: "job-typst",
        status: "ready",
        pdfPath: "data/pdfs/job-typst.pdf",
        pdfSource: "generated",
        pdfFingerprint: "stale",
      }),
    ]);

    const enqueued = await enqueueAutoPdfRegenerationForSettingsChanges({
      updatedSettingKeys: ["typstTheme"],
      requestedBy: "user",
    });

    expect(enqueued).toBe(1);
    expect(mocks.enqueue).toHaveBeenCalledWith(
      "auto_pdf_regeneration",
      expect.objectContaining({ jobId: "job-typst" }),
      { dedupeKey: "tenant-test:job-typst" },
    );
  });

  it("marks ready generated jobs stale when tailoring fields change", () => {
    const previous = createJob({
      status: "ready",
      pdfSource: "generated",
      tailoredSummary: "before",
    });
    const next = createJob({
      status: "ready",
      pdfSource: "generated",
      tailoredSummary: "after",
    });

    expect(shouldEnqueueTailoringAutoPdfRegeneration(previous, next)).toBe(
      true,
    );
  });

  it("ignores jobs that are not backed by generated PDFs", () => {
    const previous = createJob({
      status: "ready",
      pdfSource: "uploaded",
      tailoredSummary: "before",
    });
    const next = createJob({
      status: "ready",
      pdfSource: "uploaded",
      tailoredSummary: "after",
    });

    expect(shouldEnqueueTailoringAutoPdfRegeneration(previous, next)).toBe(
      false,
    );
  });
});
