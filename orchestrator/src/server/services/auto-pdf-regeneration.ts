import { logger } from "@infra/logger";
import { runWithRequestContext } from "@infra/request-context";
import type {
  AutoPdfRegenerationJobPayload,
  AutoPdfRegenerationReason,
  DesignResumeAutoPdfRootJobPayload,
  JobQueuePayloadByName,
  SettingsAutoPdfRootJobPayload,
} from "@server/infra/job-queue";
import { isAutoPdfRegenerationJobPayload } from "@server/infra/job-queue";
import { getJobQueue } from "@server/infra/job-queue-registry";
import { SqliteJobQueue } from "@server/infra/job-queue-sqlite";
import * as jobsRepo from "@server/repositories/jobs";
import type { SettingKey } from "@server/repositories/settings";
import { getActiveTenantId } from "@server/tenancy/context";
import type { Job } from "@shared/types";
import { generateFinalPdf } from "../pipeline";
import {
  getJobPdfFreshness,
  resolvePdfFingerprintContext,
} from "./pdf-fingerprint";

const AUTO_PDF_REGEN_BATCH_LIMIT = 25;
const AUTO_PDF_REGEN_RETRY_DELAY_MS = 5000;

const SETTINGS_INVALIDATION_KEYS = new Set<SettingKey>([
  "pdfRenderer",
  "typstTheme",
  "rxresumeBaseResumeId",
  "rxresumeUrl",
  "rxresumeApiKey",
]);

function onlyInvalidatesTypstTheme(
  updatedSettingKeys: ReadonlyArray<SettingKey>,
): boolean {
  let foundTypstTheme = false;
  for (const key of updatedSettingKeys) {
    if (!SETTINGS_INVALIDATION_KEYS.has(key)) continue;
    if (key !== "typstTheme") return false;
    foundTypstTheme = true;
  }
  return foundTypstTheme;
}

let workerPromise: Promise<void> | null = null;
let workerRequested = false;
let workerTimer: ReturnType<typeof setTimeout> | null = null;
let workerTimerDueAt = 0;

function isSettingsAutoPdfRoot(
  payload: JobQueuePayloadByName["auto_pdf_regeneration"],
): payload is SettingsAutoPdfRootJobPayload {
  return "taskType" in payload && payload.taskType === "settings_auto_pdf_root";
}

function isDesignResumeAutoPdfRoot(
  payload: JobQueuePayloadByName["auto_pdf_regeneration"],
): payload is DesignResumeAutoPdfRootJobPayload {
  return (
    "taskType" in payload && payload.taskType === "design_resume_auto_pdf_root"
  );
}

function scheduleWorker(): void {
  workerRequested = true;
  if (workerPromise) return;
  workerPromise = runWorker().finally(() => {
    workerPromise = null;
    void scheduleEarliestDurableWork();
    if (workerRequested) {
      scheduleWorker();
    }
  });
}

async function scheduleEarliestDurableWork(): Promise<void> {
  const queue = getJobQueue();
  if (!(queue instanceof SqliteJobQueue)) return;

  const dueAt = await queue.getEarliestDueAt();
  if (!dueAt) return;
  const now = queue.getCurrentTime();
  const dueAtMs = dueAt.getTime();
  const delayMs = dueAtMs - now.getTime();
  if (delayMs <= 0) {
    scheduleWorker();
    return;
  }
  if (workerTimer && workerTimerDueAt <= dueAtMs) return;
  if (workerTimer) clearTimeout(workerTimer);
  workerTimerDueAt = dueAtMs;
  workerTimer = setTimeout(() => {
    workerTimer = null;
    workerTimerDueAt = 0;
    scheduleWorker();
  }, delayMs);
}

async function runWorker(): Promise<void> {
  while (workerRequested) {
    workerRequested = false;
    await drainQueue();
  }
}

async function drainQueue(): Promise<void> {
  const queue = getJobQueue();

  try {
    while (true) {
      const queuedJob = await queue.reserveNext("auto_pdf_regeneration");
      if (!queuedJob) return;
      const leaseOwner = queuedJob.leaseOwner;

      try {
        const outcome = await runWithRequestContext(
          {
            ...queuedJob.requestContext,
            tenantId: queuedJob.payload.tenantId,
          },
          async () => {
            if (isSettingsAutoPdfRoot(queuedJob.payload)) {
              return {
                taskType: "settings_auto_pdf_root",
                result: await processSettingsAutoPdfRoot(queuedJob.payload),
              } as const;
            }
            if (isDesignResumeAutoPdfRoot(queuedJob.payload)) {
              return {
                taskType: "design_resume_auto_pdf_root",
                result: await processDesignResumeAutoPdfRoot(queuedJob.payload),
              } as const;
            }
            if (isAutoPdfRegenerationJobPayload(queuedJob.payload)) {
              return {
                taskType: "auto_pdf_regeneration",
                payload: queuedJob.payload,
                result: await processQueuedAutoPdfRegeneration(
                  queuedJob.payload,
                ),
              } as const;
            }
            throw new Error("Unsupported auto PDF regeneration payload");
          },
        );
        if (queue instanceof SqliteJobQueue) {
          if (!leaseOwner) {
            throw new Error("Durable queue claim is missing its lease token");
          }
          await queue.complete(queuedJob.id, {
            tenantId: queuedJob.payload.tenantId,
            leaseOwner,
          });
        } else {
          await queue.acknowledge(queuedJob.id);
        }
        if (outcome.taskType !== "auto_pdf_regeneration") continue;
        if (outcome.result === "retry_later") {
          await enqueueAutoPdfRegenerationPayload(outcome.payload, {
            delayMs: AUTO_PDF_REGEN_RETRY_DELAY_MS,
          });
          continue;
        }
        if (shouldTopUpReadyPdfRegeneration(outcome.payload.reason)) {
          await runWithRequestContext(
            {
              tenantId: outcome.payload.tenantId,
              jobId: outcome.payload.jobId,
            },
            async () => {
              await enqueueAutoPdfRegenerationForReadyJobs({
                reason: outcome.payload.reason,
                requestedBy: outcome.payload.requestedBy,
              });
            },
          );
        }
      } catch (error) {
        logger.warn("Auto PDF regeneration job failed", {
          queue: "auto_pdf_regeneration",
          tenantId: queuedJob.payload.tenantId,
          jobId: "jobId" in queuedJob.payload ? queuedJob.payload.jobId : null,
          reason:
            "reason" in queuedJob.payload ? queuedJob.payload.reason : null,
          error,
        });
        if (queue instanceof SqliteJobQueue) {
          if (leaseOwner) {
            await queue.fail(queuedJob.id, {
              tenantId: queuedJob.payload.tenantId,
              leaseOwner,
              message:
                error instanceof Error
                  ? error.message
                  : "Auto PDF regeneration failed",
              retryable: true,
            });
          }
        } else {
          await queue.reject(queuedJob.id);
        }
      }
    }
  } finally {
    await scheduleEarliestDurableWork();
  }
}

function shouldTopUpReadyPdfRegeneration(
  reason: AutoPdfRegenerationReason,
): boolean {
  return reason === "design_resume_updated" || reason === "settings_changed";
}

async function getStaleReadyGeneratedPdfJobs(limit: number): Promise<Job[]> {
  const fingerprintContext = await resolvePdfFingerprintContext();
  const staleJobs: Job[] = [];
  let offset = 0;

  while (staleJobs.length < limit) {
    const page = await jobsRepo.getReadyJobsWithGeneratedPdfs(limit, offset);
    if (page.length === 0) break;

    for (const job of page) {
      if (getJobPdfFreshness(job, fingerprintContext) === "stale") {
        staleJobs.push(job);
        if (staleJobs.length >= limit) break;
      }
    }

    offset += page.length;
    if (page.length < limit) break;
  }

  return staleJobs;
}

async function processQueuedAutoPdfRegeneration(
  input: AutoPdfRegenerationJobPayload,
): Promise<"processed" | "retry_later"> {
  return runWithRequestContext(
    {
      tenantId: input.tenantId,
      jobId: input.jobId,
    },
    async () => {
      const job = await jobsRepo.getJobById(input.jobId);
      if (!job) {
        logger.info(
          "Skipping auto PDF regeneration because job was not found",
          {
            tenantId: input.tenantId,
            jobId: input.jobId,
            reason: input.reason,
          },
        );
        return "processed";
      }

      if (job.status !== "ready") {
        return "processed";
      }

      if (job.pdfSource !== "generated") {
        return "processed";
      }

      if (job.pdfRegenerating) {
        return "retry_later";
      }

      const fingerprintContext = await resolvePdfFingerprintContext();
      if (getJobPdfFreshness(job, fingerprintContext) !== "stale") {
        return "processed";
      }

      const result = await generateFinalPdf(job.id, {
        analyticsOrigin: "auto_pdf_regeneration",
      });

      if (!result.success) {
        throw new Error(result.error ?? "Auto PDF regeneration failed.");
      }

      return "processed";
    },
  );
}

/** Fan-out happens only after the committed durable settings root task is claimed. */
async function processSettingsAutoPdfRoot(
  input: SettingsAutoPdfRootJobPayload,
): Promise<"processed"> {
  return runWithRequestContext(
    { tenantId: input.tenantId, requestId: input.requestId ?? undefined },
    async () => {
      await enqueueAutoPdfRegenerationForReadyJobs({
        reason: "settings_changed",
        requestedBy: input.requestedBy,
      });
      return "processed" as const;
    },
  );
}

/** Fan-out happens only after the committed Design Resume revision root is claimed. */
async function processDesignResumeAutoPdfRoot(
  input: DesignResumeAutoPdfRootJobPayload,
): Promise<"processed"> {
  return runWithRequestContext({ tenantId: input.tenantId }, async () => {
    await enqueueAutoPdfRegenerationForReadyJobs({
      reason: "design_resume_updated",
      requestedBy: input.requestedBy,
    });
    return "processed" as const;
  });
}

async function enqueueAutoPdfRegenerationPayload(
  payload: {
    tenantId: string;
    jobId: string;
    reason: AutoPdfRegenerationReason;
    requestedAt: string;
    requestedBy: "system" | "user";
  },
  options?: { delayMs?: number },
): Promise<void> {
  const queue = getJobQueue();
  const enqueueOptions = {
    dedupeKey: `${payload.tenantId}:${payload.jobId}`,
    delayMs: options?.delayMs,
  };
  if (queue instanceof SqliteJobQueue) {
    await queue.enqueueOutbox("auto_pdf_regeneration", payload, enqueueOptions);
    await queue.dispatchOutbox();
    await scheduleEarliestDurableWork();
  } else {
    await queue.enqueue("auto_pdf_regeneration", payload, enqueueOptions);
  }
  if (!options?.delayMs) scheduleWorker();
}

export async function enqueueAutoPdfRegenerationForJob(input: {
  jobId: string;
  reason: AutoPdfRegenerationReason;
  requestedBy: "system" | "user";
}): Promise<void> {
  const tenantId = getActiveTenantId();
  await enqueueAutoPdfRegenerationPayload({
    tenantId,
    jobId: input.jobId,
    reason: input.reason,
    requestedAt: new Date().toISOString(),
    requestedBy: input.requestedBy,
  });
}

/** Dispatches records only after their source transaction has committed. */
export async function dispatchCommittedAutoPdfOutbox(): Promise<void> {
  const queue = getJobQueue();
  if (!(queue instanceof SqliteJobQueue)) return;
  await queue.dispatchOutbox();
  await scheduleEarliestDurableWork();
  scheduleWorker();
}

export async function enqueueAutoPdfRegenerationForReadyJobs(input: {
  reason: AutoPdfRegenerationReason;
  requestedBy: "system" | "user";
  limit?: number;
}): Promise<number> {
  const limit = Math.max(1, input.limit ?? AUTO_PDF_REGEN_BATCH_LIMIT);
  const jobs = await getStaleReadyGeneratedPdfJobs(limit);

  await Promise.all(
    jobs.map((job) =>
      enqueueAutoPdfRegenerationForJob({
        jobId: job.id,
        reason: input.reason,
        requestedBy: input.requestedBy,
      }),
    ),
  );

  return jobs.length;
}

export async function enqueueAutoPdfRegenerationForSettingsChanges(input: {
  updatedSettingKeys: ReadonlyArray<SettingKey>;
  requestedBy: "system" | "user";
}): Promise<number> {
  if (!(await shouldEnqueueAutoPdfRegenerationForSettingsChanges(input))) {
    return 0;
  }

  return enqueueAutoPdfRegenerationForReadyJobs({
    reason: "settings_changed",
    requestedBy: input.requestedBy,
  });
}

export async function shouldEnqueueAutoPdfRegenerationForSettingsChanges(input: {
  updatedSettingKeys: ReadonlyArray<SettingKey>;
}): Promise<boolean> {
  if (
    !input.updatedSettingKeys.some((key) => SETTINGS_INVALIDATION_KEYS.has(key))
  ) {
    return false;
  }
  if (!onlyInvalidatesTypstTheme(input.updatedSettingKeys)) return true;
  const fingerprintContext = await resolvePdfFingerprintContext();
  return fingerprintContext.pdfRenderer === "typst";
}

export function shouldEnqueueTailoringAutoPdfRegeneration(
  previousJob: Job,
  nextJob: Job,
): boolean {
  if (nextJob.status !== "ready") return false;
  if (nextJob.pdfSource !== "generated") return false;

  return (
    previousJob.tailoredSummary !== nextJob.tailoredSummary ||
    previousJob.tailoredHeadline !== nextJob.tailoredHeadline ||
    previousJob.tailoredSkills !== nextJob.tailoredSkills ||
    previousJob.selectedProjectIds !== nextJob.selectedProjectIds ||
    previousJob.jobDescription !== nextJob.jobDescription ||
    previousJob.tracerLinksEnabled !== nextJob.tracerLinksEnabled ||
    previousJob.employer !== nextJob.employer
  );
}

export async function initializeAutoPdfRegenerationWorker(): Promise<void> {
  const queue = getJobQueue();
  if (queue instanceof SqliteJobQueue) {
    const [{ sqlite }, { reconcileDesignResumeAutoPdfRoots }] =
      await Promise.all([import("@server/db"), import("./auto-pdf-producers")]);
    await queue.recoverExpiredLeases();
    reconcileDesignResumeAutoPdfRoots({ database: sqlite, queue });
    await queue.dispatchOutbox();
    await scheduleEarliestDurableWork();
  }
  scheduleWorker();
}
