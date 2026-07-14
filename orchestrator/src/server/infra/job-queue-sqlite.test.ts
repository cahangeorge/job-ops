import {
  runVersionedMigrations,
  VERSIONED_MIGRATIONS,
} from "@server/db/versionedMigrations";
import Database from "better-sqlite3";
import { afterEach, describe, expect, it } from "vitest";
import {
  type AutoPdfRegenerationJobPayload,
  isAutoPdfRegenerationJobPayload,
} from "./job-queue";
import { SqliteJobQueue } from "./job-queue-sqlite";
import { runWithRequestContext } from "./request-context";

const now = new Date("2026-07-12T10:00:00.000Z");
const payload = (
  tenantId: string,
  jobId: string,
): AutoPdfRegenerationJobPayload => ({
  tenantId,
  jobId,
  reason: "manual_refresh" as const,
  requestedAt: now.toISOString(),
  requestedBy: "system" as const,
});

function expectAutoPdfPayload(
  payload: Parameters<typeof isAutoPdfRegenerationJobPayload>[0],
): AutoPdfRegenerationJobPayload {
  if (!isAutoPdfRegenerationJobPayload(payload)) {
    throw new Error("Expected auto PDF regeneration payload");
  }
  return payload;
}

describe("SqliteJobQueue", () => {
  const databases: Database.Database[] = [];
  afterEach(() => {
    databases.splice(0).forEach((database) => {
      database.close();
    });
  });

  function queue() {
    const database = new Database(":memory:");
    database.pragma("foreign_keys = ON");
    database.exec("CREATE TABLE tenants (id TEXT PRIMARY KEY)");
    database.exec("INSERT INTO tenants(id) VALUES ('tenant-a'), ('tenant-b')");
    runVersionedMigrations(
      database,
      VERSIONED_MIGRATIONS.filter(({ version }) => version >= 6),
    );
    databases.push(database);
    return new SqliteJobQueue(database, { now: () => now, random: () => 0 });
  }

  it("isolates active idempotency keys by tenant", async () => {
    const jobs = queue();
    const first = await jobs.enqueue(
      "auto_pdf_regeneration",
      payload("tenant-a", "job-1"),
      { dedupeKey: "job-1" },
    );
    const duplicate = await jobs.enqueue(
      "auto_pdf_regeneration",
      payload("tenant-a", "job-1"),
      { dedupeKey: "job-1" },
    );
    const otherTenant = await jobs.enqueue(
      "auto_pdf_regeneration",
      payload("tenant-b", "job-1"),
      { dedupeKey: "job-1" },
    );
    expect(duplicate).toMatchObject({ id: first.id, deduplicated: true });
    expect(otherTenant).toMatchObject({ deduplicated: false });
    expect(otherTenant.id).not.toBe(first.id);
  });

  it("keeps active idempotency keys distinct for task types in one queue", async () => {
    const jobs = queue();
    const first = await jobs.enqueue(
      "auto_pdf_regeneration",
      payload("tenant-a", "job-1"),
      { dedupeKey: "job-1", taskType: "render" },
    );
    const second = await jobs.enqueue(
      "auto_pdf_regeneration",
      payload("tenant-a", "job-1"),
      { dedupeKey: "job-1", taskType: "notify" },
    );

    expect(second).toMatchObject({ deduplicated: false });
    expect(second.id).not.toBe(first.id);
  });

  it("claims only available tasks in priority then stable creation order", async () => {
    const jobs = queue();
    await jobs.enqueue("auto_pdf_regeneration", payload("tenant-a", "later"), {
      delayMs: 1,
      priority: 99,
    });
    await jobs.enqueue("auto_pdf_regeneration", payload("tenant-a", "normal"), {
      priority: 1,
    });
    await jobs.enqueue("auto_pdf_regeneration", payload("tenant-a", "urgent"), {
      priority: 2,
    });
    const urgent = await jobs.claimNext("auto_pdf_regeneration", "worker-a");
    if (!urgent) throw new Error("Expected urgent task claim");
    expect(expectAutoPdfPayload(urgent.payload).jobId).toBe("urgent");
    const normal = await jobs.claimNext("auto_pdf_regeneration", "worker-b");
    if (!normal) throw new Error("Expected normal task claim");
    expect(expectAutoPdfPayload(normal.payload).jobId).toBe("normal");
    expect(
      await jobs.claimNext("auto_pdf_regeneration", "worker-c"),
    ).toBeNull();
  });

  it("exclusively leases then recovers expired leases", async () => {
    const jobs = queue();
    await jobs.enqueue("auto_pdf_regeneration", payload("tenant-a", "job-1"));
    const claim = await jobs.claimNext("auto_pdf_regeneration", "worker-a", {
      leaseMs: 100,
    });
    expect(
      await jobs.claimNext("auto_pdf_regeneration", "worker-b"),
    ).toBeNull();
    const recovered = await jobs.recoverExpiredLeases(
      new Date(now.getTime() + 101),
    );
    expect(recovered).toBe(1);
    expect(
      (
        await jobs.claimNext("auto_pdf_regeneration", "worker-b", {
          now: new Date(now.getTime() + 101),
        })
      )?.id,
    ).toBe(claim?.id);
  });

  it("only lets the matching tenant and lease owner settle a task", async () => {
    const jobs = queue();
    await jobs.enqueue("auto_pdf_regeneration", payload("tenant-a", "job-1"));
    const claim = await jobs.claimNext("auto_pdf_regeneration", "worker-a");
    if (!claim) throw new Error("Expected task claim");

    await jobs.complete(claim.id, {
      tenantId: "tenant-b",
      leaseOwner: "worker-a",
    });
    await jobs.fail(claim.id, {
      tenantId: "tenant-a",
      leaseOwner: "worker-b",
      message: "foreign worker",
      retryable: false,
    });
    expect(
      await jobs.claimNext("auto_pdf_regeneration", "worker-b"),
    ).toBeNull();

    await jobs.complete(claim.id, {
      tenantId: "tenant-a",
      leaseOwner: claim.leaseOwner,
    });
    expect(
      await jobs.claimNext("auto_pdf_regeneration", "worker-b"),
    ).toBeNull();
  });

  it("does not let an expired lease owner settle before recovery", async () => {
    let current = now;
    const database = new Database(":memory:");
    database.pragma("foreign_keys = ON");
    database.exec("CREATE TABLE tenants (id TEXT PRIMARY KEY)");
    database.exec("INSERT INTO tenants(id) VALUES ('tenant-a')");
    runVersionedMigrations(
      database,
      VERSIONED_MIGRATIONS.filter(({ version }) => version >= 6),
    );
    databases.push(database);
    const jobs = new SqliteJobQueue(database, { now: () => current });
    await jobs.enqueue("auto_pdf_regeneration", payload("tenant-a", "job-1"));
    const claim = await jobs.claimNext("auto_pdf_regeneration", "worker-a", {
      leaseMs: 100,
    });
    if (!claim) throw new Error("Expected task claim");

    current = new Date(now.getTime() + 101);
    await expect(
      jobs.complete(claim.id, {
        tenantId: "tenant-a",
        leaseOwner: claim.leaseOwner,
      }),
    ).resolves.toEqual({ completed: false });
    await expect(
      jobs.fail(claim.id, {
        tenantId: "tenant-a",
        leaseOwner: claim.leaseOwner,
        message: "expired",
        retryable: false,
      }),
    ).resolves.toEqual({ deadLettered: false, settled: false });

    expect(await jobs.recoverExpiredLeases()).toBe(1);
    expect(
      await jobs.claimNext("auto_pdf_regeneration", "worker-b"),
    ).not.toBeNull();
  });

  it("does not let a former lease owner settle after another worker reclaims", async () => {
    let current = now;
    const database = new Database(":memory:");
    database.pragma("foreign_keys = ON");
    database.exec("CREATE TABLE tenants (id TEXT PRIMARY KEY)");
    database.exec("INSERT INTO tenants(id) VALUES ('tenant-a')");
    runVersionedMigrations(
      database,
      VERSIONED_MIGRATIONS.filter(({ version }) => version >= 6),
    );
    databases.push(database);
    const jobs = new SqliteJobQueue(database, { now: () => current });
    await jobs.enqueue("auto_pdf_regeneration", payload("tenant-a", "job-1"));
    const first = await jobs.claimNext("auto_pdf_regeneration", "worker-a", {
      leaseMs: 100,
    });
    if (!first) throw new Error("Expected first task claim");

    current = new Date(now.getTime() + 101);
    await jobs.recoverExpiredLeases();
    const second = await jobs.claimNext("auto_pdf_regeneration", "worker-b");
    if (!second) throw new Error("Expected reclaimed task");

    await expect(
      jobs.complete(first.id, {
        tenantId: "tenant-a",
        leaseOwner: first.leaseOwner,
      }),
    ).resolves.toEqual({ completed: false });
    await expect(
      jobs.fail(first.id, {
        tenantId: "tenant-a",
        leaseOwner: first.leaseOwner,
        message: "former owner",
        retryable: false,
      }),
    ).resolves.toEqual({ deadLettered: false, settled: false });

    await expect(
      jobs.complete(second.id, {
        tenantId: "tenant-a",
        leaseOwner: second.leaseOwner,
      }),
    ).resolves.toEqual({ completed: true });
  });

  it("gives reserveNext a unique lease token so a stale drain cannot settle its reclaim", async () => {
    let current = now;
    const database = new Database(":memory:");
    database.pragma("foreign_keys = ON");
    database.exec("CREATE TABLE tenants (id TEXT PRIMARY KEY)");
    database.exec("INSERT INTO tenants(id) VALUES ('tenant-a')");
    runVersionedMigrations(
      database,
      VERSIONED_MIGRATIONS.filter(({ version }) => version >= 6),
    );
    databases.push(database);
    const jobs = new SqliteJobQueue(database, { now: () => current });
    await jobs.enqueue("auto_pdf_regeneration", payload("tenant-a", "job-1"));

    const first = await jobs.reserveNext("auto_pdf_regeneration");
    if (!first?.leaseOwner) throw new Error("Expected first leased task");

    current = new Date(now.getTime() + 30_001);
    const second = await jobs.reserveNext("auto_pdf_regeneration");
    if (!second?.leaseOwner) throw new Error("Expected reclaimed leased task");

    expect(second.leaseOwner).not.toBe(first.leaseOwner);
    await expect(
      jobs.complete(first.id, {
        tenantId: "tenant-a",
        leaseOwner: first.leaseOwner,
      }),
    ).resolves.toEqual({ completed: false });
    await expect(
      jobs.complete(second.id, {
        tenantId: "tenant-a",
        leaseOwner: second.leaseOwner,
      }),
    ).resolves.toEqual({ completed: true });
  });

  it("reports the earliest due timestamp across pending outbox and ready tasks", async () => {
    let current = now;
    const database = new Database(":memory:");
    database.pragma("foreign_keys = ON");
    database.exec("CREATE TABLE tenants (id TEXT PRIMARY KEY)");
    database.exec("INSERT INTO tenants(id) VALUES ('tenant-a')");
    runVersionedMigrations(
      database,
      VERSIONED_MIGRATIONS.filter(({ version }) => version >= 6),
    );
    databases.push(database);
    const jobs = new SqliteJobQueue(database, { now: () => current });
    await jobs.enqueue("auto_pdf_regeneration", payload("tenant-a", "later"), {
      delayMs: 2_000,
    });
    await jobs.enqueueOutbox(
      "auto_pdf_regeneration",
      payload("tenant-a", "sooner"),
      { delayMs: 1_000 },
    );

    await expect(jobs.getEarliestDueAt()).resolves.toEqual(
      new Date(now.getTime() + 1_000),
    );
    current = new Date(now.getTime() + 1_000);
    await jobs.dispatchOutbox();
    await expect(jobs.getEarliestDueAt()).resolves.toEqual(current);
  });

  it("includes active lease expiry in the earliest durable due time", async () => {
    const current = now;
    const database = new Database(":memory:");
    database.pragma("foreign_keys = ON");
    database.exec("CREATE TABLE tenants (id TEXT PRIMARY KEY)");
    database.exec("INSERT INTO tenants(id) VALUES ('tenant-a')");
    runVersionedMigrations(
      database,
      VERSIONED_MIGRATIONS.filter(({ version }) => version >= 6),
    );
    databases.push(database);
    const jobs = new SqliteJobQueue(database, { now: () => current });
    await jobs.enqueue("auto_pdf_regeneration", payload("tenant-a", "leased"));
    const claim = await jobs.claimNext("auto_pdf_regeneration", "worker-a", {
      leaseMs: 1_000,
    });
    if (!claim) throw new Error("Expected leased task");

    await expect(jobs.getEarliestDueAt()).resolves.toEqual(
      new Date(current.getTime() + 1_000),
    );

    await jobs.complete(claim.id, {
      tenantId: "tenant-a",
      leaseOwner: claim.leaseOwner,
    });
    await expect(jobs.getEarliestDueAt()).resolves.toBeNull();
  });

  it("records sanitized failed attempts and dead letters after bounded retries", async () => {
    const jobs = queue();
    await jobs.enqueue("auto_pdf_regeneration", payload("tenant-a", "job-1"), {
      maxAttempts: 2,
    });
    const first = await jobs.claimNext("auto_pdf_regeneration", "worker");
    expect(first).not.toBeNull();
    if (!first) throw new Error("Expected first task claim");
    await jobs.fail(first.id, {
      tenantId: "tenant-a",
      leaseOwner: first.leaseOwner,
      message: `token=top-secret ${"x".repeat(500)}`,
      retryable: true,
    });
    const second = await jobs.claimNext("auto_pdf_regeneration", "worker", {
      now: new Date(now.getTime() + 1000),
    });
    expect(second).not.toBeNull();
    if (!second) throw new Error("Expected retry task claim");
    await jobs.fail(second.id, {
      tenantId: "tenant-a",
      leaseOwner: second.leaseOwner,
      message: "password=hunter2",
      retryable: true,
    });
    expect(await jobs.getDeadLetters("tenant-a")).toMatchObject([
      {
        taskId: first.id,
        lastError: expect.not.stringMatching(/top-secret|hunter2/),
      },
    ]);
  });

  it("turns an undispatched outbox record into one idempotent task after restart", async () => {
    const jobs = queue();
    await jobs.enqueueOutbox(
      "auto_pdf_regeneration",
      payload("tenant-a", "job-1"),
      { dedupeKey: "job-1" },
    );
    expect(await jobs.dispatchOutbox()).toBe(1);
    expect(await jobs.dispatchOutbox()).toBe(0);
    const claimed = await jobs.claimNext("auto_pdf_regeneration", "worker");
    if (!claimed) throw new Error("Expected dispatched task claim");
    expect(expectAutoPdfPayload(claimed.payload).jobId).toBe("job-1");
  });

  it("allows a completed child invalidation to be enqueued again while deduplicating active work", async () => {
    const jobs = queue();
    const options = {
      taskType: "auto_pdf_regeneration",
      dedupeKey: "tenant-a:job-1",
    };

    await jobs.enqueueOutbox(
      "auto_pdf_regeneration",
      payload("tenant-a", "job-1"),
      options,
    );
    await jobs.dispatchOutbox();
    const first = await jobs.claimNext("auto_pdf_regeneration", "worker-a");
    if (!first) throw new Error("Expected first child task claim");

    await jobs.enqueueOutbox(
      "auto_pdf_regeneration",
      payload("tenant-a", "job-1"),
      options,
    );
    await jobs.dispatchOutbox();
    expect(
      await jobs.claimNext("auto_pdf_regeneration", "worker-b"),
    ).toBeNull();

    await jobs.complete(first.id, {
      tenantId: "tenant-a",
      leaseOwner: first.leaseOwner,
    });
    await jobs.enqueueOutbox(
      "auto_pdf_regeneration",
      payload("tenant-a", "job-1"),
      options,
    );
    await jobs.dispatchOutbox();

    const later = await jobs.claimNext("auto_pdf_regeneration", "worker-b");
    if (!later) throw new Error("Expected later child invalidation claim");
    expect(later.id).not.toBe(first.id);
  });

  it("dispatches a delayed outbox row on a live worker wake once it becomes due", async () => {
    let current = now;
    const database = new Database(":memory:");
    database.pragma("foreign_keys = ON");
    database.exec("CREATE TABLE tenants (id TEXT PRIMARY KEY)");
    database.exec("INSERT INTO tenants(id) VALUES ('tenant-a')");
    runVersionedMigrations(
      database,
      VERSIONED_MIGRATIONS.filter(({ version }) => version >= 6),
    );
    databases.push(database);
    const jobs = new SqliteJobQueue(database, { now: () => current });

    await jobs.enqueueOutbox(
      "auto_pdf_regeneration",
      payload("tenant-a", "delayed-job"),
      { delayMs: 1000 },
    );
    expect(await jobs.reserveNext("auto_pdf_regeneration")).toBeNull();

    current = new Date(now.getTime() + 1000);
    const delayed = await jobs.reserveNext("auto_pdf_regeneration");
    if (!delayed) throw new Error("Expected delayed task claim");
    expect(expectAutoPdfPayload(delayed.payload).jobId).toBe("delayed-job");
  });

  it("copies the safe request context from outbox to a claimed workflow task", async () => {
    const jobs = queue();
    await runWithRequestContext(
      {
        requestId: "request-1",
        pipelineRunId: "run-1",
        jobId: "job-context",
        tenantId: "tenant-a",
        userId: "must-not-persist",
      },
      () =>
        jobs.enqueueOutbox(
          "auto_pdf_regeneration",
          payload("tenant-a", "job-1"),
        ),
    );

    const claim = await jobs.reserveNext("auto_pdf_regeneration");
    expect(claim).toMatchObject({
      requestContext: {
        requestId: "request-1",
        pipelineRunId: "run-1",
        jobId: "job-context",
      },
    });
    expect(JSON.stringify(claim)).not.toContain("must-not-persist");
  });

  it("returns a bounded tenant-scoped health DTO without durable payloads or errors", async () => {
    const jobs = queue();
    await jobs.enqueue("auto_pdf_regeneration", payload("tenant-a", "ready"), {
      priority: 1,
    });
    await jobs.enqueue("auto_pdf_regeneration", payload("tenant-b", "foreign"));
    const claimed = await jobs.claimNext("auto_pdf_regeneration", "worker-a");
    if (!claimed) throw new Error("Expected task claim");
    await jobs.fail(claimed.id, {
      tenantId: "tenant-a",
      leaseOwner: claimed.leaseOwner,
      message: "password=never-return-this-error",
      retryable: false,
    });
    await jobs.enqueue(
      "auto_pdf_regeneration",
      payload("tenant-a", "ready-after-dead-letter"),
    );
    await jobs.enqueueOutbox(
      "auto_pdf_regeneration",
      payload("tenant-a", "outbox"),
      { delayMs: 1000 },
    );

    const health = await jobs.getHealthSummary("tenant-a", {
      deadLetterLimit: 1,
    });

    expect(health).toMatchObject({
      states: { ready: 1, leased: 0, completed: 0, deadLetter: 1 },
      pendingOutbox: 1,
      deadLetters: [
        expect.objectContaining({
          taskId: claimed.id,
          taskType: "auto_pdf_regeneration",
        }),
      ],
    });
    expect(health.earliestDueAt).toBe(now.toISOString());
    expect(health.oldestReadyAgeMs).toBe(0);
    expect(JSON.stringify(health)).not.toMatch(
      /payload|requestContext|password|error|tenant-b|foreign/i,
    );
  });

  it("replays one terminal tenant DLQ task while preserving immutable task, attempt, and DLQ history", async () => {
    const jobs = queue();
    await jobs.enqueue("auto_pdf_regeneration", payload("tenant-a", "replay"));
    const claim = await jobs.claimNext("auto_pdf_regeneration", "worker-a");
    if (!claim) throw new Error("Expected task claim");
    await jobs.fail(claim.id, {
      tenantId: "tenant-a",
      leaseOwner: claim.leaseOwner,
      message: "sensitive failure text",
      retryable: false,
    });
    const database = (jobs as unknown as { database: Database.Database })
      .database;
    const deadLetterBeforeReplay = database
      .prepare("SELECT * FROM workflow_dead_letters WHERE task_id = ?")
      .get(claim.id);

    const replay = await jobs.replayDeadLetter({
      tenantId: "tenant-a",
      taskId: claim.id,
      operatorId: "operator-a",
      requestId: "request-a",
    });
    expect(replay).toMatchObject({ replayed: true });
    if (!replay.replayed) throw new Error("Expected dead-letter replay");
    expect(replay.replayTaskId).not.toBe(claim.id);
    expect(
      database
        .prepare("SELECT state, attempt_count FROM workflow_tasks WHERE id = ?")
        .get(claim.id),
    ).toEqual({ state: "dead_letter", attempt_count: 1 });
    expect(
      database
        .prepare(
          "SELECT count(*) AS count FROM workflow_task_attempts WHERE task_id = ?",
        )
        .get(claim.id),
    ).toEqual({ count: 1 });
    const originalDeadLetter = database
      .prepare("SELECT * FROM workflow_dead_letters WHERE task_id = ?")
      .get(claim.id);
    expect(originalDeadLetter).toEqual(deadLetterBeforeReplay);
    expect(() =>
      database
        .prepare("UPDATE workflow_dead_letters SET last_error = 'changed'")
        .run(),
    ).toThrow(/immutable/);
    expect(() =>
      database.prepare("DELETE FROM workflow_dead_letters").run(),
    ).toThrow(/immutable/);
    expect(
      database
        .prepare(
          "SELECT operator_id, request_id FROM workflow_dead_letter_replays WHERE original_task_id = ?",
        )
        .get(claim.id),
    ).toEqual({ operator_id: "operator-a", request_id: "request-a" });
    expect(() =>
      database
        .prepare(
          "UPDATE workflow_dead_letter_replays SET request_id = 'changed'",
        )
        .run(),
    ).toThrow(/append-only/);
    expect(() =>
      database.prepare("DELETE FROM workflow_dead_letter_replays").run(),
    ).toThrow(/append-only/);
    expect(
      database
        .prepare(
          "SELECT state, attempt_count, payload_json FROM workflow_tasks WHERE id = ?",
        )
        .get(replay.replayTaskId),
    ).toEqual({
      state: "ready",
      attempt_count: 0,
      payload_json: JSON.stringify(payload("tenant-a", "replay")),
    });
  });

  it("rejects malformed or unsupported stored replay payloads without creating a replay", async () => {
    const jobs = queue();
    await jobs.enqueue("auto_pdf_regeneration", payload("tenant-a", "replay"));
    const database = (jobs as unknown as { database: Database.Database })
      .database;
    database
      .prepare(
        "UPDATE workflow_tasks SET payload_json = ?, payload_version = ? WHERE tenant_id = ?",
      )
      .run('{"arbitrary":true}', 99, "tenant-a");
    const claim = await jobs.claimNext("auto_pdf_regeneration", "worker-a");
    if (!claim) throw new Error("Expected task claim");
    await jobs.fail(claim.id, {
      tenantId: "tenant-a",
      leaseOwner: claim.leaseOwner,
      message: "failed",
      retryable: false,
    });
    await expect(
      jobs.replayDeadLetter({ tenantId: "tenant-a", taskId: claim.id }),
    ).resolves.toEqual({ replayed: false, reason: "invalid_payload" });
    expect(
      database
        .prepare("SELECT count(*) AS count FROM workflow_dead_letter_replays")
        .get(),
    ).toEqual({ count: 0 });
  });

  it("does not replay a cross-tenant or already replayed dead letter", async () => {
    const jobs = queue();
    await jobs.enqueue("auto_pdf_regeneration", payload("tenant-a", "replay"));
    const claim = await jobs.claimNext("auto_pdf_regeneration", "worker-a");
    if (!claim) throw new Error("Expected task claim");
    await jobs.fail(claim.id, {
      tenantId: "tenant-a",
      leaseOwner: claim.leaseOwner,
      message: "failed",
      retryable: false,
    });

    await expect(
      jobs.replayDeadLetter({ tenantId: "tenant-b", taskId: claim.id }),
    ).resolves.toEqual({ replayed: false, reason: "not_found" });
    await expect(
      jobs.replayDeadLetter({ tenantId: "tenant-a", taskId: claim.id }),
    ).resolves.toMatchObject({ replayed: true });
    await expect(
      jobs.replayDeadLetter({ tenantId: "tenant-a", taskId: claim.id }),
    ).resolves.toEqual({ replayed: false, reason: "already_replayed" });
  });

  it("dispatches an outbox record once when two dispatchers race", async () => {
    const jobs = queue();
    await jobs.enqueueOutbox(
      "auto_pdf_regeneration",
      payload("tenant-a", "job-1"),
      { dedupeKey: "job-1" },
    );
    const secondDispatcher = new SqliteJobQueue(
      (jobs as unknown as { database: Database.Database }).database,
      { now: () => now },
    );

    expect(
      await Promise.all([
        jobs.dispatchOutbox(),
        secondDispatcher.dispatchOutbox(),
      ]),
    ).toEqual([1, 0]);
  });

  it("rolls back an outbox record with its source transaction and commits one with it", async () => {
    const jobs = queue();
    const database = (jobs as unknown as { database: Database.Database })
      .database;
    database.exec("CREATE TABLE source_mutations (id TEXT PRIMARY KEY)");

    expect(() =>
      database.transaction(() => {
        database
          .prepare("INSERT INTO source_mutations(id) VALUES ('rollback')")
          .run();
        jobs.enqueueOutboxInTransaction(
          database,
          "auto_pdf_regeneration",
          payload("tenant-a", "rollback"),
        );
        throw new Error("rollback source mutation");
      })(),
    ).toThrow("rollback source mutation");
    expect(
      database.prepare("SELECT count(*) AS count FROM workflow_outbox").get(),
    ).toEqual({ count: 0 });

    database.transaction(() => {
      database
        .prepare("INSERT INTO source_mutations(id) VALUES ('commit')")
        .run();
      jobs.enqueueOutboxInTransaction(
        database,
        "auto_pdf_regeneration",
        payload("tenant-a", "commit"),
      );
    })();
    expect(
      database.prepare("SELECT count(*) AS count FROM workflow_outbox").get(),
    ).toEqual({ count: 1 });
  });
});
