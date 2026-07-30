import { createHash, randomUUID } from "node:crypto";
import { copyFile, mkdir, readFile, rm } from "node:fs/promises";
import { join, relative, resolve } from "node:path";
import {
  badRequest,
  conflict,
  notFound,
  unauthorized,
  unprocessableEntity,
} from "@infra/errors";
import { logger } from "@infra/logger";
import { getDataDir } from "@server/config/dataDir";
import { db, schema } from "@server/db";
import { getRequestContext } from "@server/infra/request-context";
import * as submissionsRepo from "@server/repositories/application-submissions";
import { getTenantPdfDir } from "@server/services/pdf-storage";
import { and, eq } from "drizzle-orm";
import pdfParse from "pdf-parse";

const {
  applicationApprovals,
  jobs,
  stageEvents,
  submittedApplicationArtifacts,
} = schema;

export async function inspectSubmissionPdf(
  bytes: Buffer,
  expectedSha256: string,
) {
  const sha256 = createHash("sha256").update(bytes).digest("hex");
  if (sha256 !== expectedSha256)
    throw conflict("Working PDF changed before submission.");
  let text: string;
  try {
    text = (await pdfParse(bytes)).text;
  } catch {
    throw unprocessableEntity("Working PDF text layer could not be verified.");
  }
  if (!text.trim())
    throw unprocessableEntity(
      "Working PDF must contain a readable text layer.",
    );
  return { sha256, byteSize: bytes.byteLength, qaResult: "passed" as const };
}

function artifactPath(tenantId: string, id: string) {
  return join(getDataDir(), "submitted-applications", tenantId, `${id}.pdf`);
}

function artifactStoragePath(path: string) {
  return relative(getDataDir(), path)
    .replaceAll("\\", "/")
    .replace(/^/, "data/");
}

function resolveTenantWorkingPdfPath(
  tenantId: string,
  pdfPath: string,
): string {
  const root = resolve(getTenantPdfDir(tenantId));
  const workingPath = resolve(pdfPath);
  if (!workingPath.startsWith(`${root}/`)) {
    throw unprocessableEntity(
      "Working PDF must be stored in the active tenant's PDF workspace.",
    );
  }
  return workingPath;
}

/** The sole production gateway from a working PDF to an applied job. */
export class HumanApplicationSubmissionService {
  async submit(input: {
    jobId: string;
    draftRevisionId: string;
    policyVersion: string;
    confirmed: boolean;
    expectedWorkingPdfSha256: string;
  }) {
    const context = getRequestContext();
    if (!context?.tenantId || !context.userId)
      throw unauthorized(
        "Authentication is required to submit an application.",
      );
    const { tenantId, userId } = context;
    if (!input.confirmed || !input.policyVersion.trim())
      throw badRequest(
        "Submission requires an explicit confirmation and policy version.",
      );
    const job = await (await import("@server/repositories/jobs")).getJobById(
      input.jobId,
    );
    if (!job) throw notFound("Job not found");
    if (job.status === "applied" || job.status === "in_progress")
      throw conflict("Application has already been submitted.");
    if (!job.pdfPath)
      throw unprocessableEntity("A working PDF is required before submission.");
    const revision = await submissionsRepo.getDraftRevisionForJob(
      input.jobId,
      input.draftRevisionId,
    );
    if (!revision) throw notFound("Draft revision not found");
    const dossier = await submissionsRepo.getDossierForJob(input.jobId);
    if (!dossier || revision.dossierId !== dossier.id)
      throw notFound("Application dossier not found");
    const workingPath = resolveTenantWorkingPdfPath(tenantId, job.pdfPath);
    let bytes: Buffer;
    try {
      bytes = await readFile(workingPath);
    } catch {
      throw unprocessableEntity("Working PDF is unavailable.");
    }
    const qa = await inspectSubmissionPdf(
      bytes,
      input.expectedWorkingPdfSha256,
    );
    const artifactId = randomUUID();
    const destination = artifactPath(tenantId, artifactId);
    try {
      await mkdir(resolve(destination, ".."), { recursive: true });
      await copyFile(workingPath, destination);
      const copied = await readFile(destination);
      if (createHash("sha256").update(copied).digest("hex") !== qa.sha256)
        throw conflict(
          "Submitted PDF copy did not match the verified working PDF.",
        );
      const result = db.transaction((tx) => {
        const current = tx
          .select()
          .from(jobs)
          .where(and(eq(jobs.tenantId, tenantId), eq(jobs.id, input.jobId)))
          .get();
        if (
          !current ||
          current.status === "applied" ||
          current.status === "in_progress"
        )
          throw conflict("Application has already been submitted.");
        tx.insert(submittedApplicationArtifacts)
          .values({
            id: artifactId,
            tenantId,
            dossierId: dossier.id,
            jobId: input.jobId,
            draftRevisionId: revision.id,
            storagePath: artifactStoragePath(destination),
            sha256: qa.sha256,
            byteSize: qa.byteSize,
            mediaType: "application/pdf",
            qaResult: "passed",
          })
          .run();
        tx.insert(applicationApprovals)
          .values({
            id: randomUUID(),
            tenantId,
            dossierId: dossier.id,
            jobId: input.jobId,
            decision: "approved",
            approvedByUserId: userId,
            policyVersion: input.policyVersion.trim(),
            requestId: context.requestId,
            draftRevisionId: revision.id,
            submittedArtifactId: artifactId,
          })
          .run();
        const now = new Date();
        tx.insert(stageEvents)
          .values({
            id: randomUUID(),
            tenantId,
            applicationId: input.jobId,
            title: "Applied",
            toStage: "applied",
            occurredAt: Math.floor(now.getTime() / 1000),
            metadata: {
              actor: "user",
              eventLabel: "Applied",
              reasonCode: "human_application_submission",
            },
          })
          .run();
        tx.update(jobs)
          .set({
            status: "applied",
            appliedAt: now.toISOString(),
            updatedAt: now.toISOString(),
          })
          .where(and(eq(jobs.tenantId, tenantId), eq(jobs.id, input.jobId)))
          .run();
        return { artifactId };
      });
      logger.info("Human application submitted", {
        requestId: context.requestId,
        jobId: input.jobId,
        artifactId: result.artifactId,
      });
      return result;
    } catch (error) {
      await rm(destination, { force: true }).catch(() => undefined);
      throw error;
    }
  }
}

export function resolveSubmittedArtifactStoragePath(
  storagePath: string,
): string {
  const prefix = "data/";
  if (!storagePath.startsWith(prefix) || storagePath.includes("..")) {
    throw notFound("Submitted artifact not found");
  }
  const path = resolve(getDataDir(), storagePath.slice(prefix.length));
  const root = resolve(getDataDir(), "submitted-applications");
  if (!path.startsWith(`${root}/`))
    throw notFound("Submitted artifact not found");
  return path;
}
