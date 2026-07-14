import { randomUUID } from "node:crypto";
import type Database from "better-sqlite3";
import type {
  EnqueueJobOptions,
  EnqueueJobResult,
  JobQueue,
  JobQueueName,
  QueueJobRecord,
  ReserveNextOptions,
} from "./job-queue";
import { isKnownAutoPdfRegenerationPayload } from "./job-queue";
import { getRequestContext } from "./request-context";
import { redactString } from "./sanitize";

type Clock = { now?: () => Date; random?: () => number };
type TaskRow = {
  id: string;
  tenant_id: string;
  queue_name: JobQueueName;
  task_type: string;
  payload_version: number;
  payload_json: string;
  priority: number;
  created_at: string;
  attempt_count: number;
  max_attempts: number;
  request_context_json: string;
};
type OutboxRow = {
  id: string;
  tenant_id: string;
  queue_name: JobQueueName;
  task_type: string;
  payload_json: string;
  idempotency_key: string | null;
  priority: number;
  request_context_json: string;
};
type Claim = QueueJobRecord & {
  leaseOwner: string;
  leaseExpiresAt: string;
  attempt: number;
};
type HealthState = "ready" | "leased" | "completed" | "dead_letter";
type DeadLetterForReplay = {
  id: string;
  task_id: string;
  queue_name: JobQueueName;
  task_type: string;
  payload_version: number;
  payload_json: string;
  max_attempts: number;
};
const MAX_HEALTH_DEAD_LETTERS = 50;
const MAX_AUDIT_VALUE_LENGTH = 200;
const iso = (date: Date) => date.toISOString();
const errorSummary = (message: string) =>
  redactString(
    message.replace(
      /(token|password|secret|api.?key)\s*[=:]\s*[^\s,;]+/gi,
      "$1=[REDACTED]",
    ),
    400,
  );
function requestContextJson(): string {
  const context = getRequestContext();
  return JSON.stringify({
    requestId: context?.requestId,
    pipelineRunId: context?.pipelineRunId,
    jobId: context?.jobId,
  });
}

function parseRequestContext(value: string): QueueJobRecord["requestContext"] {
  try {
    const parsed = JSON.parse(value) as Record<string, unknown>;
    const context = Object.fromEntries(
      (["requestId", "pipelineRunId", "jobId"] as const).flatMap((key) => {
        const candidate = parsed[key];
        return typeof candidate === "string" && candidate.length <= 200
          ? [[key, candidate]]
          : [];
      }),
    );
    return Object.keys(context).length > 0 ? context : undefined;
  } catch {
    return undefined;
  }
}

function insertOutbox<K extends JobQueueName>(
  database: Database.Database,
  now: Date,
  queue: K,
  payload: QueueJobRecord<K>["payload"],
  options: EnqueueJobOptions = {},
): string {
  const id = randomUUID();
  const result = database
    .prepare(
      "INSERT OR IGNORE INTO workflow_outbox(id, tenant_id, queue_name, task_type, payload_version, payload_json, idempotency_key, priority, available_at, request_context_json, created_at) VALUES (?, ?, ?, ?, 1, ?, ?, ?, ?, ?, ?)",
    )
    .run(
      id,
      payload.tenantId,
      queue,
      options.taskType?.trim() || queue,
      JSON.stringify(payload),
      options.dedupeKey?.trim() || null,
      options.priority ?? 0,
      iso(new Date(now.getTime() + Math.max(0, options.delayMs ?? 0))),
      requestContextJson(),
      iso(now),
    );
  if (result.changes === 0 && options.dedupeKey?.trim()) {
    const existing = database
      .prepare(
        "SELECT id FROM workflow_outbox WHERE tenant_id = ? AND queue_name = ? AND task_type = ? AND idempotency_key = ?",
      )
      .get(
        payload.tenantId,
        queue,
        options.taskType?.trim() || queue,
        options.dedupeKey.trim(),
      ) as { id: string } | undefined;
    return existing?.id ?? id;
  }
  return id;
}

export class SqliteJobQueue implements JobQueue {
  constructor(
    private readonly database: Database.Database,
    private readonly clock: Clock = {},
  ) {}
  private now() {
    return this.clock.now?.() ?? new Date();
  }

  getCurrentTime(): Date {
    return this.now();
  }

  async enqueue<K extends JobQueueName>(
    queue: K,
    payload: QueueJobRecord<K>["payload"],
    options: EnqueueJobOptions & { maxAttempts?: number } = {},
  ): Promise<EnqueueJobResult> {
    const tenantId = payload.tenantId;
    const dedupeKey = options.dedupeKey?.trim() || undefined;
    const now = this.now();
    const existing = dedupeKey
      ? (this.database
          .prepare(
            "SELECT id, created_at FROM workflow_tasks WHERE tenant_id = ? AND queue_name = ? AND task_type = ? AND idempotency_key = ? AND state IN ('ready', 'leased')",
          )
          .get(tenantId, queue, options.taskType?.trim() || queue, dedupeKey) as
          | { id: string; created_at: string }
          | undefined)
      : undefined;
    if (existing)
      return {
        id: existing.id,
        queue,
        acceptedAt: existing.created_at,
        deduplicated: true,
        dedupeKey,
      };
    const id = randomUUID();
    try {
      this.database
        .prepare(
          `INSERT INTO workflow_tasks (id, tenant_id, queue_name, task_type, payload_version, payload_json, idempotency_key, state, priority, available_at, attempt_count, max_attempts, request_context_json, created_at, updated_at) VALUES (?, ?, ?, ?, 1, ?, ?, 'ready', ?, ?, 0, ?, ?, ?, ?)`,
        )
        .run(
          id,
          tenantId,
          queue,
          options.taskType?.trim() || queue,
          JSON.stringify(payload),
          dedupeKey ?? null,
          options.priority ?? 0,
          iso(new Date(now.getTime() + Math.max(0, options.delayMs ?? 0))),
          options.maxAttempts ?? 3,
          requestContextJson(),
          iso(now),
          iso(now),
        );
    } catch (error) {
      if (
        dedupeKey &&
        error instanceof Error &&
        error.message.includes("UNIQUE")
      )
        return this.enqueue(queue, payload, options);
      throw error;
    }
    return { id, queue, acceptedAt: iso(now), deduplicated: false, dedupeKey };
  }

  async enqueueOutbox<K extends JobQueueName>(
    queue: K,
    payload: QueueJobRecord<K>["payload"],
    options: EnqueueJobOptions = {},
  ): Promise<string> {
    return this.enqueueOutboxInTransaction(
      this.database,
      queue,
      payload,
      options,
    );
  }

  /** Inserts into the caller's SQLite transaction; it never uses global DB state. */
  enqueueOutboxInTransaction<K extends JobQueueName>(
    transaction: Database.Database,
    queue: K,
    payload: QueueJobRecord<K>["payload"],
    options: EnqueueJobOptions = {},
  ): string {
    return insertOutbox(transaction, this.now(), queue, payload, options);
  }

  async dispatchOutbox(limit = 100): Promise<number> {
    const now = this.now();
    return this.database.transaction(() => {
      const rows = this.database
        .prepare(
          "SELECT * FROM workflow_outbox WHERE dispatched_at IS NULL AND available_at <= ? ORDER BY created_at, id LIMIT ?",
        )
        .all(iso(now), limit) as OutboxRow[];
      for (const row of rows) {
        const existing = row.idempotency_key
          ? this.database
              .prepare(
                "SELECT id FROM workflow_tasks WHERE tenant_id = ? AND queue_name = ? AND task_type = ? AND idempotency_key = ? AND state IN ('ready', 'leased')",
              )
              .get(
                row.tenant_id,
                row.queue_name,
                row.task_type,
                row.idempotency_key,
              )
          : undefined;
        if (!existing) {
          this.database
            .prepare(
              "INSERT INTO workflow_tasks (id, tenant_id, queue_name, task_type, payload_version, payload_json, idempotency_key, state, priority, available_at, attempt_count, max_attempts, request_context_json, created_at, updated_at) VALUES (?, ?, ?, ?, 1, ?, ?, 'ready', ?, ?, 0, 3, ?, ?, ?)",
            )
            .run(
              randomUUID(),
              row.tenant_id,
              row.queue_name,
              row.task_type,
              row.payload_json,
              row.idempotency_key,
              row.priority,
              iso(now),
              row.request_context_json,
              iso(now),
              iso(now),
            );
        }
        this.database
          .prepare(
            "UPDATE workflow_outbox SET dispatched_at = ? WHERE id = ? AND dispatched_at IS NULL",
          )
          .run(iso(now), row.id);
      }
      return rows.length;
    })();
  }

  async claimNext<K extends JobQueueName>(
    queue: K,
    workerId: string,
    options: { leaseMs?: number; now?: Date } = {},
  ): Promise<Claim | null> {
    const now = options.now ?? this.now();
    const leaseOwner = `${workerId}:${randomUUID()}`;
    const leaseExpiresAt = iso(
      new Date(now.getTime() + (options.leaseMs ?? 30_000)),
    );
    return this.database.transaction(() => {
      const row = this.database
        .prepare(
          `SELECT * FROM workflow_tasks WHERE queue_name = ? AND state = 'ready' AND available_at <= ? ORDER BY priority DESC, created_at, id LIMIT 1`,
        )
        .get(queue, iso(now)) as TaskRow | undefined;
      if (!row) return null;
      const changed = this.database
        .prepare(
          `UPDATE workflow_tasks SET state = 'leased', lease_owner = ?, lease_expires_at = ?, heartbeat_at = ?, attempt_count = attempt_count + 1, updated_at = ? WHERE id = ? AND state = 'ready'`,
        )
        .run(leaseOwner, leaseExpiresAt, iso(now), iso(now), row.id).changes;
      if (!changed) return null;
      this.database
        .prepare(
          "INSERT INTO workflow_task_attempts(id, tenant_id, task_id, attempt_number, lease_owner, started_at) VALUES (?, ?, ?, ?, ?, ?)",
        )
        .run(
          randomUUID(),
          row.tenant_id,
          row.id,
          row.attempt_count + 1,
          leaseOwner,
          iso(now),
        );
      return {
        id: row.id,
        queue: row.queue_name,
        payload: JSON.parse(row.payload_json),
        acceptedAt: row.created_at,
        options: { priority: row.priority },
        requestContext: parseRequestContext(row.request_context_json),
        leaseOwner,
        leaseExpiresAt,
        attempt: row.attempt_count + 1,
      } as Claim;
    })();
  }
  async reserveNext<K extends JobQueueName>(
    queue: K,
    options: ReserveNextOptions = {},
  ) {
    // A live durable worker can be the only process awake when a delayed
    // outbox record becomes due, so reconcile it before every drain attempt.
    await this.recoverExpiredLeases();
    await this.dispatchOutbox();
    if (options.shouldClaim && !options.shouldClaim()) return null;
    return this.claimNext(
      queue,
      "legacy-worker",
    ) as Promise<QueueJobRecord<K> | null>;
  }
  async getEarliestDueAt(): Promise<Date | null> {
    const row = this.database
      .prepare(
        `SELECT MIN(available_at) AS due_at FROM (
          SELECT available_at FROM workflow_outbox WHERE dispatched_at IS NULL
          UNION ALL
          SELECT available_at FROM workflow_tasks WHERE state = 'ready'
          UNION ALL
          SELECT lease_expires_at AS available_at
          FROM workflow_tasks
          WHERE state = 'leased' AND lease_expires_at IS NOT NULL
        )`,
      )
      .get() as { due_at: string | null };
    return row.due_at ? new Date(row.due_at) : null;
  }
  async acknowledge(jobId: string) {
    const task = this.database
      .prepare("SELECT tenant_id, lease_owner FROM workflow_tasks WHERE id = ?")
      .get(jobId) as
      | { tenant_id: string; lease_owner: string | null }
      | undefined;
    if (task?.lease_owner)
      await this.complete(jobId, {
        tenantId: task.tenant_id,
        leaseOwner: task.lease_owner,
      });
  }
  async reject(jobId: string) {
    const task = this.database
      .prepare("SELECT tenant_id, lease_owner FROM workflow_tasks WHERE id = ?")
      .get(jobId) as
      | { tenant_id: string; lease_owner: string | null }
      | undefined;
    if (task?.lease_owner)
      await this.fail(jobId, {
        tenantId: task.tenant_id,
        leaseOwner: task.lease_owner,
        message: "Rejected by legacy worker",
        retryable: false,
      });
  }
  async complete(
    taskId: string,
    lease: { tenantId: string; leaseOwner: string },
  ): Promise<{ completed: boolean }> {
    const now = iso(this.now());
    return this.database.transaction(() => {
      const task = this.database
        .prepare(
          "SELECT * FROM workflow_tasks WHERE id = ? AND tenant_id = ? AND lease_owner = ? AND state = 'leased' AND lease_expires_at > ?",
        )
        .get(taskId, lease.tenantId, lease.leaseOwner, now) as
        | TaskRow
        | undefined;
      if (!task) return { completed: false };
      const changed = this.database
        .prepare(
          "UPDATE workflow_tasks SET state = 'completed', completed_at = ?, lease_owner = NULL, lease_expires_at = NULL, updated_at = ? WHERE id = ? AND tenant_id = ? AND lease_owner = ? AND state = 'leased' AND lease_expires_at > ?",
        )
        .run(now, now, taskId, lease.tenantId, lease.leaseOwner, now).changes;
      if (!changed) return { completed: false };
      this.database
        .prepare(
          "UPDATE workflow_task_attempts SET finished_at = ?, outcome = 'completed' WHERE task_id = ? AND attempt_number = ?",
        )
        .run(now, taskId, task.attempt_count);
      return { completed: true };
    })();
  }
  async fail(
    taskId: string,
    input: {
      tenantId: string;
      leaseOwner: string;
      message: string;
      retryable: boolean;
    },
  ): Promise<{
    deadLettered: boolean;
    retryDelayMs?: number;
    settled: boolean;
  }> {
    const now = this.now();
    return this.database.transaction(() => {
      const task = this.database
        .prepare(
          "SELECT * FROM workflow_tasks WHERE id = ? AND tenant_id = ? AND lease_owner = ? AND state = 'leased' AND lease_expires_at > ?",
        )
        .get(taskId, input.tenantId, input.leaseOwner, iso(now)) as
        | TaskRow
        | undefined;
      if (!task) return { deadLettered: false, settled: false };
      const summary = errorSummary(input.message);
      const dead = !input.retryable || task.attempt_count >= task.max_attempts;
      const jitter = this.clock.random?.() ?? Math.random();
      const delay =
        Math.min(60_000, 1000 * 2 ** Math.max(0, task.attempt_count - 1)) +
        Math.floor(jitter * 250);
      if (dead) {
        const changed = this.database
          .prepare(
            "UPDATE workflow_tasks SET state = 'dead_letter', last_error = ?, lease_owner = NULL, lease_expires_at = NULL, updated_at = ? WHERE id = ? AND tenant_id = ? AND lease_owner = ? AND state = 'leased' AND lease_expires_at > ?",
          )
          .run(
            summary,
            iso(now),
            taskId,
            input.tenantId,
            input.leaseOwner,
            iso(now),
          ).changes;
        if (!changed) return { deadLettered: false, settled: false };
        this.database
          .prepare(
            "UPDATE workflow_task_attempts SET finished_at = ?, outcome = 'dead_letter', error_summary = ? WHERE task_id = ? AND attempt_number = ?",
          )
          .run(iso(now), summary, taskId, task.attempt_count);
        this.database
          .prepare(
            "INSERT OR IGNORE INTO workflow_dead_letters(id, tenant_id, task_id, queue_name, task_type, payload_version, payload_json, request_context_json, last_error, dead_lettered_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)",
          )
          .run(
            randomUUID(),
            task.tenant_id,
            task.id,
            task.queue_name,
            task.task_type,
            task.payload_version,
            task.payload_json,
            task.request_context_json,
            summary,
            iso(now),
          );
        return { deadLettered: true, settled: true };
      }
      const changed = this.database
        .prepare(
          "UPDATE workflow_tasks SET state = 'ready', available_at = ?, last_error = ?, lease_owner = NULL, lease_expires_at = NULL, updated_at = ? WHERE id = ? AND tenant_id = ? AND lease_owner = ? AND state = 'leased' AND lease_expires_at > ?",
        )
        .run(
          iso(new Date(now.getTime() + delay)),
          summary,
          iso(now),
          taskId,
          input.tenantId,
          input.leaseOwner,
          iso(now),
        ).changes;
      if (!changed) return { deadLettered: false, settled: false };
      this.database
        .prepare(
          "UPDATE workflow_task_attempts SET finished_at = ?, outcome = 'retry', error_summary = ? WHERE task_id = ? AND attempt_number = ?",
        )
        .run(iso(now), summary, taskId, task.attempt_count);
      return { deadLettered: false, retryDelayMs: delay, settled: true };
    })();
  }
  async recoverExpiredLeases(now = this.now()): Promise<number> {
    return this.database.transaction(() => {
      const rows = this.database
        .prepare(
          "SELECT * FROM workflow_tasks WHERE state = 'leased' AND lease_expires_at <= ?",
        )
        .all(iso(now)) as TaskRow[];
      for (const task of rows) {
        this.database
          .prepare(
            "UPDATE workflow_tasks SET state = 'ready', lease_owner = NULL, lease_expires_at = NULL, available_at = ?, updated_at = ? WHERE id = ?",
          )
          .run(iso(now), iso(now), task.id);
        this.database
          .prepare(
            "UPDATE workflow_task_attempts SET finished_at = ?, outcome = 'recovered' WHERE task_id = ? AND attempt_number = ?",
          )
          .run(iso(now), task.id, task.attempt_count);
      }
      return rows.length;
    })();
  }
  async getDeadLetters(tenantId: string) {
    return this.database
      .prepare(
        "SELECT task_id AS taskId, last_error AS lastError FROM workflow_dead_letters WHERE tenant_id = ? ORDER BY dead_lettered_at",
      )
      .all(tenantId) as Array<{ taskId: string; lastError: string | null }>;
  }

  async getHealthSummary(
    tenantId: string,
    options: { deadLetterLimit?: number } = {},
  ): Promise<{
    states: {
      ready: number;
      leased: number;
      completed: number;
      deadLetter: number;
    };
    pendingOutbox: number;
    earliestDueAt: string | null;
    oldestReadyAgeMs: number | null;
    deadLetters: Array<{
      taskId: string;
      queue: JobQueueName;
      taskType: string;
      deadLetteredAt: string;
      replayedAt: string | null;
    }>;
  }> {
    const now = this.now();
    const deadLetterLimit = Math.max(
      1,
      Math.min(MAX_HEALTH_DEAD_LETTERS, options.deadLetterLimit ?? 20),
    );
    const stateRows = this.database
      .prepare(
        "SELECT state, count(*) AS count FROM workflow_tasks WHERE tenant_id = ? GROUP BY state",
      )
      .all(tenantId) as Array<{ state: HealthState; count: number }>;
    const counts = new Map(stateRows.map((row) => [row.state, row.count]));
    const pendingOutbox = this.database
      .prepare(
        "SELECT count(*) AS count FROM workflow_outbox WHERE tenant_id = ? AND dispatched_at IS NULL",
      )
      .get(tenantId) as { count: number };
    const earliestDue = this.database
      .prepare(
        `SELECT MIN(available_at) AS due_at FROM (
          SELECT available_at FROM workflow_outbox WHERE tenant_id = ? AND dispatched_at IS NULL
          UNION ALL
          SELECT available_at FROM workflow_tasks WHERE tenant_id = ? AND state = 'ready'
        )`,
      )
      .get(tenantId, tenantId) as { due_at: string | null };
    const oldestReady = this.database
      .prepare(
        "SELECT MIN(created_at) AS created_at FROM workflow_tasks WHERE tenant_id = ? AND state = 'ready'",
      )
      .get(tenantId) as { created_at: string | null };
    const deadLetters = this.database
      .prepare(
        `SELECT task_id AS taskId, queue_name AS queue, task_type AS taskType,
          d.dead_lettered_at AS deadLetteredAt, r.replayed_at AS replayedAt
         FROM workflow_dead_letters d
         LEFT JOIN workflow_dead_letter_replays r ON r.dead_letter_id = d.id
         WHERE d.tenant_id = ?
         ORDER BY dead_lettered_at DESC, task_id DESC LIMIT ?`,
      )
      .all(tenantId, deadLetterLimit) as Array<{
      taskId: string;
      queue: JobQueueName;
      taskType: string;
      deadLetteredAt: string;
      replayedAt: string | null;
    }>;
    return {
      states: {
        ready: counts.get("ready") ?? 0,
        leased: counts.get("leased") ?? 0,
        completed: counts.get("completed") ?? 0,
        deadLetter: counts.get("dead_letter") ?? 0,
      },
      pendingOutbox: pendingOutbox.count,
      earliestDueAt: earliestDue.due_at,
      oldestReadyAgeMs: oldestReady.created_at
        ? Math.max(
            0,
            now.getTime() - new Date(oldestReady.created_at).getTime(),
          )
        : null,
      deadLetters,
    };
  }

  async replayDeadLetter(input: {
    tenantId: string;
    taskId: string;
    operatorId?: string;
    requestId?: string;
  }): Promise<
    | { replayed: true; replayTaskId: string }
    | {
        replayed: false;
        reason: "not_found" | "already_replayed" | "invalid_payload";
      }
  > {
    const now = iso(this.now());
    const safeAuditValue = (value: string | undefined) =>
      value?.trim().slice(0, MAX_AUDIT_VALUE_LENGTH) || null;
    try {
      return this.database.transaction(() => {
        const deadLetter = this.database
          .prepare(
            `SELECT d.id, d.task_id, d.queue_name, d.task_type, d.payload_version, d.payload_json,
             t.max_attempts
           FROM workflow_dead_letters d
           JOIN workflow_tasks t ON t.id = d.task_id AND t.tenant_id = d.tenant_id
           WHERE d.tenant_id = ? AND d.task_id = ? AND t.state = 'dead_letter'`,
          )
          .get(input.tenantId, input.taskId) as DeadLetterForReplay | undefined;
        if (!deadLetter)
          return { replayed: false, reason: "not_found" } as const;
        const alreadyReplayed = this.database
          .prepare(
            "SELECT 1 FROM workflow_dead_letter_replays WHERE dead_letter_id = ?",
          )
          .get(deadLetter.id);
        if (alreadyReplayed)
          return { replayed: false, reason: "already_replayed" } as const;

        let storedPayload: unknown;
        try {
          storedPayload = JSON.parse(deadLetter.payload_json);
        } catch {
          return { replayed: false, reason: "invalid_payload" } as const;
        }
        if (
          deadLetter.payload_version !== 1 ||
          deadLetter.queue_name !== "auto_pdf_regeneration" ||
          !isKnownAutoPdfRegenerationPayload(storedPayload) ||
          storedPayload.tenantId !== input.tenantId
        ) {
          return { replayed: false, reason: "invalid_payload" } as const;
        }

        const replayTaskId = randomUUID();
        this.database
          .prepare(
            `INSERT INTO workflow_tasks (id, tenant_id, queue_name, task_type, payload_version,
             payload_json, state, priority, available_at, attempt_count, max_attempts,
             request_context_json, created_at, updated_at)
           VALUES (?, ?, ?, ?, ?, ?, 'ready', 0, ?, 0, ?, ?, ?, ?)`,
          )
          .run(
            replayTaskId,
            input.tenantId,
            deadLetter.queue_name,
            deadLetter.task_type,
            deadLetter.payload_version,
            deadLetter.payload_json,
            now,
            deadLetter.max_attempts,
            JSON.stringify({
              requestId: safeAuditValue(input.requestId) ?? undefined,
            }),
            now,
            now,
          );
        this.database
          .prepare(
            `INSERT INTO workflow_dead_letter_replays(id, tenant_id, dead_letter_id, original_task_id,
            replay_task_id, operator_id, request_id, replayed_at)
           VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
          )
          .run(
            randomUUID(),
            input.tenantId,
            deadLetter.id,
            deadLetter.task_id,
            replayTaskId,
            safeAuditValue(input.operatorId),
            safeAuditValue(input.requestId),
            now,
          );
        return { replayed: true, replayTaskId } as const;
      })();
    } catch (error) {
      if (
        error instanceof Error &&
        /UNIQUE constraint failed/.test(error.message)
      ) {
        return { replayed: false, reason: "already_replayed" } as const;
      }
      throw error;
    }
  }
}
