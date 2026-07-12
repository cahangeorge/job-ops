import type { SqliteJobQueue } from "@server/infra/job-queue-sqlite";
import * as jobsRepo from "@server/repositories/jobs";
import {
  applySettingsWritesInTransaction,
  type SettingKey,
} from "@server/repositories/settings";
import type { UpdateJobInput } from "@shared/types";
import type Database from "better-sqlite3";

const designResumeRootPayload = (input: {
  tenantId: string;
  documentId: string;
  revision: number;
  requestedBy: "system" | "user";
}) => ({
  taskType: "design_resume_auto_pdf_root" as const,
  tenantId: input.tenantId,
  documentId: input.documentId,
  revision: input.revision,
  requestedAt: new Date().toISOString(),
  requestedBy: input.requestedBy,
});

/**
 * Records a post-success source mutation and its root work separately from any
 * filesystem operation. It is intentionally at-least-once: the immutable
 * tenant/document/revision/operation key makes duplicate calls harmless.
 */
export function recordDesignResumeAutoPdfReconciliation(input: {
  database: Database.Database;
  queue: SqliteJobQueue;
  tenantId: string;
  documentId: string;
  revision: number;
  operation: string;
  requestedBy: "system" | "user";
}): void {
  const operation = input.operation.trim();
  if (!operation)
    throw new Error("Design Resume reconciliation operation is required");
  input.database.transaction(() => {
    input.database
      .prepare(
        "INSERT OR IGNORE INTO design_resume_pdf_reconciliations(tenant_id, document_id, revision, operation, created_at) VALUES (?, ?, ?, ?, ?)",
      )
      .run(
        input.tenantId,
        input.documentId,
        input.revision,
        operation,
        new Date().toISOString(),
      );
    input.queue.enqueueOutboxInTransaction(
      input.database,
      "auto_pdf_regeneration",
      designResumeRootPayload(input),
      {
        taskType: "design_resume_auto_pdf_root",
        dedupeKey: `${input.tenantId}:design-resume:${input.documentId}:${input.revision}:${operation}`,
      },
    );
  })();
}

/** Startup/recovery scan: every persisted document gets a deterministic root. */
export function reconcileDesignResumeAutoPdfRoots(input: {
  database: Database.Database;
  queue: SqliteJobQueue;
}): number {
  const documents = input.database
    .prepare(
      "SELECT tenant_id, id, revision FROM design_resume_documents ORDER BY tenant_id, id",
    )
    .all() as Array<{ tenant_id: string; id: string; revision: number }>;
  for (const document of documents) {
    recordDesignResumeAutoPdfReconciliation({
      database: input.database,
      queue: input.queue,
      tenantId: document.tenant_id,
      documentId: document.id,
      revision: document.revision,
      operation: "recovery",
      requestedBy: "system",
    });
  }
  return documents.length;
}

/**
 * The document update and root outbox insert share one SQLite transaction.
 * The immutable tenant/document/revision idempotency key is retained in the
 * outbox so retries after the root is completed cannot fan out twice.
 */
export function updateDesignResumeDocumentAndEnqueueAutoPdfRegeneration(input: {
  database: Database.Database;
  queue: SqliteJobQueue;
  tenantId: string;
  documentId: string;
  expectedRevision: number;
  title: string;
  resumeJson: Record<string, unknown>;
  sourceResumeId: string | null;
  sourceMode: string | null;
  importedAt: string | null;
  updatedAt: string;
  requestedBy: "system" | "user";
  failAfterOutboxInsert?: boolean;
}): boolean {
  return input.database.transaction(() => {
    const nextRevision = input.expectedRevision + 1;
    const changed = input.database
      .prepare(
        `UPDATE design_resume_documents
         SET title = ?, resume_json = ?, revision = ?, source_resume_id = ?,
             source_mode = ?, imported_at = ?, updated_at = ?
         WHERE tenant_id = ? AND id = ? AND revision = ?`,
      )
      .run(
        input.title,
        JSON.stringify(input.resumeJson),
        nextRevision,
        input.sourceResumeId,
        input.sourceMode,
        input.importedAt,
        input.updatedAt,
        input.tenantId,
        input.documentId,
        input.expectedRevision,
      ).changes;
    if (changed !== 1) return false;

    input.queue.enqueueOutboxInTransaction(
      input.database,
      "auto_pdf_regeneration",
      {
        taskType: "design_resume_auto_pdf_root",
        tenantId: input.tenantId,
        documentId: input.documentId,
        revision: nextRevision,
        requestedAt: input.updatedAt,
        requestedBy: input.requestedBy,
      },
      {
        taskType: "design_resume_auto_pdf_root",
        dedupeKey: `${input.tenantId}:design-resume:${input.documentId}:${nextRevision}`,
      },
    );
    if (input.failAfterOutboxInsert) {
      throw new Error("rollback requested by test");
    }
    return true;
  })();
}

export function updateJobAndEnqueueAutoPdfRegeneration(input: {
  database: Database.Database;
  queue: SqliteJobQueue;
  tenantId: string;
  jobId: string;
  update: UpdateJobInput;
  requestedBy: "system" | "user";
  shouldEnqueue?: (
    job: NonNullable<ReturnType<typeof jobsRepo.updateJobInTransaction>>,
  ) => boolean;
  failAfterOutboxInsert?: boolean;
}): ReturnType<typeof jobsRepo.updateJobInTransaction> {
  return input.database.transaction(() => {
    const job = jobsRepo.updateJobInTransaction(
      input.database,
      input.jobId,
      input.update,
      input.tenantId,
    );
    if (!job) return null;
    if (input.shouldEnqueue?.(job) ?? true) {
      input.queue.enqueueOutboxInTransaction(
        input.database,
        "auto_pdf_regeneration",
        {
          tenantId: input.tenantId,
          jobId: input.jobId,
          reason: "tailoring_updated",
          requestedAt: new Date().toISOString(),
          requestedBy: input.requestedBy,
        },
        { dedupeKey: `${input.tenantId}:${input.jobId}` },
      );
    }
    if (input.failAfterOutboxInsert) {
      throw new Error("rollback requested by test");
    }
    return job;
  })();
}

/**
 * Persists AI-generated tailoring fields and the dependent auto-PDF work as
 * one unit. The caller decides whether the generated fields changed a PDF
 * that is eligible for regeneration.
 */
export function updateSummarizedJobAndEnqueueAutoPdfRegeneration(input: {
  database: Database.Database;
  queue: SqliteJobQueue;
  tenantId: string;
  jobId: string;
  update: Pick<
    UpdateJobInput,
    | "tailoredSummary"
    | "tailoredHeadline"
    | "tailoredSkills"
    | "selectedProjectIds"
  >;
  requestedBy: "system" | "user";
  shouldEnqueue: (
    job: NonNullable<ReturnType<typeof jobsRepo.updateJobInTransaction>>,
  ) => boolean;
  failAfterOutboxInsert?: boolean;
}): ReturnType<typeof jobsRepo.updateJobInTransaction> {
  return updateJobAndEnqueueAutoPdfRegeneration(input);
}

export function updateSettingsAndEnqueueAutoPdfRegeneration(input: {
  database: Database.Database;
  queue: SqliteJobQueue;
  tenantId: string;
  updates: ReadonlyArray<{ settingKey: SettingKey; value: string | null }>;
  requestedBy: "system" | "user";
  transactionId: string;
  requestId: string | null;
  enqueueRoot?: boolean;
  failAfterOutboxInsert?: boolean;
}): void {
  input.database.transaction(() => {
    applySettingsWritesInTransaction(
      input.database,
      input.tenantId,
      input.updates.map(({ settingKey, value }) => ({
        key: settingKey,
        value,
      })),
    );
    if (input.enqueueRoot ?? true) {
      input.queue.enqueueOutboxInTransaction(
        input.database,
        "auto_pdf_regeneration",
        {
          taskType: "settings_auto_pdf_root",
          tenantId: input.tenantId,
          updatedSettingKeys: input.updates.map(({ settingKey }) => settingKey),
          requestedAt: new Date().toISOString(),
          requestedBy: input.requestedBy,
          transactionId: input.transactionId,
          requestId: input.requestId,
        },
        {
          taskType: "settings_auto_pdf_root",
          dedupeKey: `${input.tenantId}:settings:${input.transactionId}:${input.requestId ?? "none"}`,
        },
      );
    }
    if (input.failAfterOutboxInsert) {
      throw new Error("rollback requested by test");
    }
  })();
}
