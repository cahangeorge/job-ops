export const JOB_QUEUE_NAMES = ["auto_pdf_regeneration"] as const;

export type JobQueueName = (typeof JOB_QUEUE_NAMES)[number];

export type AutoPdfRegenerationReason =
  | "design_resume_updated"
  | "tailoring_updated"
  | "settings_changed"
  | "manual_refresh";

export interface AutoPdfRegenerationJobPayload {
  tenantId: string;
  jobId: string;
  reason: AutoPdfRegenerationReason;
  requestedAt: string;
  requestedBy: "system" | "user";
}

/** A durable fan-out request created atomically with a settings change. */
export interface SettingsAutoPdfRootJobPayload {
  taskType: "settings_auto_pdf_root";
  tenantId: string;
  updatedSettingKeys: string[];
  requestedAt: string;
  requestedBy: "system" | "user";
  transactionId: string;
  requestId: string | null;
}

/** A durable fan-out request created atomically with a Design Resume revision. */
export interface DesignResumeAutoPdfRootJobPayload {
  taskType: "design_resume_auto_pdf_root";
  tenantId: string;
  documentId: string;
  revision: number;
  requestedAt: string;
  requestedBy: "system" | "user";
}

export interface JobQueuePayloadByName {
  auto_pdf_regeneration:
    | AutoPdfRegenerationJobPayload
    | SettingsAutoPdfRootJobPayload
    | DesignResumeAutoPdfRootJobPayload;
}

export function isAutoPdfRegenerationJobPayload(
  payload: unknown,
): payload is AutoPdfRegenerationJobPayload {
  if (!isRecord(payload)) return false;
  return (
    isBoundedString(payload.tenantId) &&
    isBoundedString(payload.jobId) &&
    typeof payload.requestedAt === "string" &&
    (payload.requestedBy === "system" || payload.requestedBy === "user") &&
    (payload.reason === "design_resume_updated" ||
      payload.reason === "tailoring_updated" ||
      payload.reason === "settings_changed" ||
      payload.reason === "manual_refresh")
  );
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function isBoundedString(value: unknown): value is string {
  return (
    typeof value === "string" && value.trim().length > 0 && value.length <= 200
  );
}

export function isKnownAutoPdfRegenerationPayload(
  payload: unknown,
): payload is JobQueuePayloadByName["auto_pdf_regeneration"] {
  if (isAutoPdfRegenerationJobPayload(payload)) return true;
  if (!isRecord(payload) || !isBoundedString(payload.tenantId)) return false;
  if (payload.taskType === "settings_auto_pdf_root") {
    return (
      Array.isArray(payload.updatedSettingKeys) &&
      payload.updatedSettingKeys.every(isBoundedString) &&
      typeof payload.requestedAt === "string" &&
      (payload.requestedBy === "system" || payload.requestedBy === "user") &&
      isBoundedString(payload.transactionId) &&
      (payload.requestId === null || isBoundedString(payload.requestId))
    );
  }
  return (
    payload.taskType === "design_resume_auto_pdf_root" &&
    isBoundedString(payload.documentId) &&
    typeof payload.revision === "number" &&
    Number.isSafeInteger(payload.revision) &&
    payload.revision > 0 &&
    typeof payload.requestedAt === "string" &&
    (payload.requestedBy === "system" || payload.requestedBy === "user")
  );
}

export interface EnqueueJobOptions {
  dedupeKey?: string;
  /** Distinguishes idempotency domains when a queue carries multiple task kinds. */
  taskType?: string;
  delayMs?: number;
  priority?: number;
}

export interface EnqueueJobResult {
  id: string;
  queue: JobQueueName;
  acceptedAt: string;
  deduplicated: boolean;
  dedupeKey?: string;
}

/** The only correlation fields that may cross the durable queue boundary. */
export interface QueueRequestContext {
  requestId?: string;
  pipelineRunId?: string;
  jobId?: string;
}

export interface QueueJobRecord<K extends JobQueueName = JobQueueName> {
  id: string;
  queue: K;
  payload: JobQueuePayloadByName[K];
  acceptedAt: string;
  options?: EnqueueJobOptions;
  requestContext?: QueueRequestContext;
  /** Present for durable queue claims and required to settle that exact lease. */
  leaseOwner?: string;
}

export interface ReserveNextOptions {
  /** Synchronously prevents a reservation immediately before it is claimed. */
  shouldClaim?: () => boolean;
}

export interface JobQueue {
  enqueue<K extends JobQueueName>(
    queue: K,
    payload: JobQueuePayloadByName[K],
    options?: EnqueueJobOptions,
  ): Promise<EnqueueJobResult>;

  reserveNext<K extends JobQueueName>(
    queue: K,
    options?: ReserveNextOptions,
  ): Promise<QueueJobRecord<K> | null>;

  acknowledge(jobId: string): Promise<void>;

  reject(jobId: string): Promise<void>;
}
