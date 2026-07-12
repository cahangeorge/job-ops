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
  payload: JobQueuePayloadByName["auto_pdf_regeneration"],
): payload is AutoPdfRegenerationJobPayload {
  return "jobId" in payload && "reason" in payload;
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

export interface JobQueue {
  enqueue<K extends JobQueueName>(
    queue: K,
    payload: JobQueuePayloadByName[K],
    options?: EnqueueJobOptions,
  ): Promise<EnqueueJobResult>;

  reserveNext<K extends JobQueueName>(
    queue: K,
  ): Promise<QueueJobRecord<K> | null>;

  acknowledge(jobId: string): Promise<void>;

  reject(jobId: string): Promise<void>;
}
