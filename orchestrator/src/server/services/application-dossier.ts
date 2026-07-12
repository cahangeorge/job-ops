import { createHash, randomUUID } from "node:crypto";
import { conflict, notFound, unauthorized } from "@infra/errors";
import { logger } from "@infra/logger";
import { db, schema } from "@server/db";
import { getRequestContext } from "@server/infra/request-context";
import * as dossierRepo from "@server/repositories/application-dossiers";
import * as storiesRepo from "@server/repositories/interview-stories";
import * as jobsRepo from "@server/repositories/jobs";
import { getCurrentDesignResume } from "@server/services/design-resume";
import { APPLICATION_SNAPSHOT_MAX_CHARS } from "@shared/types/application-domain";
import { and, eq, sql } from "drizzle-orm";

const { applicationDossiers, applicationDraftRevisions, jobPostingSnapshots } =
  schema;

const MAX_MANUAL_DRAFT_CHARS = 100_000;

export type CreateManualDraftInput = {
  content: string;
  storyIds: string[];
};

function sha256(value: string): string {
  return createHash("sha256").update(value).digest("hex");
}

function normalizeWhitespace(value: string | null | undefined): string {
  return (value ?? "").replace(/\s+/g, " ").trim();
}

function bounded(value: string, max: number, field: string): string {
  if (value.length > max) throw conflict(`${field} exceeds its storage limit.`);
  return value;
}

function canonicalJson(value: unknown): string {
  if (Array.isArray(value)) return `[${value.map(canonicalJson).join(",")}]`;
  if (value && typeof value === "object") {
    const record = value as Record<string, unknown>;
    return `{${Object.keys(record)
      .sort()
      .map((key) => `${JSON.stringify(key)}:${canonicalJson(record[key])}`)
      .join(",")}}`;
  }
  return JSON.stringify(value);
}

function resolvePostingSnapshotSource(job: {
  id: string;
  jobUrl: string | null;
}) {
  const externalUrl = normalizeWhitespace(job.jobUrl);
  if (externalUrl) {
    return {
      sourceUrl: externalUrl,
      metadata: { kind: "external_job_url", uri: externalUrl },
    };
  }

  const sourceUrl = `local-job://job/${encodeURIComponent(job.id)}`;
  return {
    sourceUrl,
    metadata: { kind: "local_canonical_job_identity", uri: sourceUrl },
  };
}

function jobPostingText(job: Awaited<ReturnType<typeof jobsRepo.getJobById>>) {
  if (!job) throw notFound("Job not found");
  return [
    ["title", job.title],
    ["employer", job.employer],
    ["location", job.location],
    ["url", job.jobUrl],
    ["description", job.jobDescription],
    ["employmentType", job.jobType],
    ["function", job.jobFunction],
    ["salary", job.salary],
    ["deadline", job.deadline],
  ]
    .map(([label, value]) => `${label}: ${normalizeWhitespace(value)}`)
    .join("\n");
}

function requireContext(): {
  tenantId: string;
  userId: string;
  requestId: string;
} {
  const context = getRequestContext();
  const { tenantId, userId, requestId } = context ?? {};
  if (!tenantId || !userId || !requestId) {
    throw unauthorized("Authentication is required for application dossiers.");
  }
  return { tenantId, userId, requestId };
}

async function requireJob(jobId: string) {
  const job = await jobsRepo.getJobById(jobId);
  if (!job) throw notFound("Job not found");
  return job;
}

/**
 * The initial lifecycle is deliberately narrow: a dossier starts in `draft`
 * and a human-authored revision moves it to the existing `pending_approval`
 * state. Submitted artifacts and submission-stage guards are not touched here.
 */
export class ApplicationDossierService {
  async startOrGet(jobId: string) {
    const { tenantId, requestId } = requireContext();
    const job = await requireJob(jobId);
    const normalizedText = bounded(
      jobPostingText(job),
      APPLICATION_SNAPSHOT_MAX_CHARS.postingText,
      "Job posting snapshot",
    );
    const contentHash = sha256(normalizedText);
    const now = new Date().toISOString();
    const postingSource = resolvePostingSnapshotSource(job);
    const retrievalMetadata = canonicalJson({
      fields: [
        "title",
        "employer",
        "location",
        "url",
        "description",
        "employmentType",
        "function",
        "salary",
        "deadline",
      ],
      source: "canonical_job_fields",
      sourceUrl: postingSource.metadata,
      version: 2,
    });

    const result = db.transaction((tx) => {
      let dossier = tx
        .select()
        .from(applicationDossiers)
        .where(
          and(
            eq(applicationDossiers.tenantId, tenantId),
            eq(applicationDossiers.jobId, jobId),
          ),
        )
        .get();
      if (!dossier) {
        const id = randomUUID();
        tx.insert(applicationDossiers)
          .values({ id, tenantId, jobId, lifecycleState: "draft" })
          .run();
        dossier = tx
          .select()
          .from(applicationDossiers)
          .where(
            and(
              eq(applicationDossiers.tenantId, tenantId),
              eq(applicationDossiers.id, id),
            ),
          )
          .get();
      }
      let postingSnapshot = tx
        .select()
        .from(jobPostingSnapshots)
        .where(
          and(
            eq(jobPostingSnapshots.tenantId, tenantId),
            eq(jobPostingSnapshots.jobId, jobId),
            eq(jobPostingSnapshots.contentHash, contentHash),
          ),
        )
        .get();
      if (!postingSnapshot) {
        const id = randomUUID();
        tx.insert(jobPostingSnapshots)
          .values({
            id,
            tenantId,
            jobId,
            normalizedText,
            contentHash,
            sourceUrl: postingSource.sourceUrl,
            retrievedAt: now,
            retrievalMetadata,
          })
          .run();
        postingSnapshot = tx
          .select()
          .from(jobPostingSnapshots)
          .where(
            and(
              eq(jobPostingSnapshots.tenantId, tenantId),
              eq(jobPostingSnapshots.id, id),
            ),
          )
          .get();
      }
      if (!dossier || !postingSnapshot)
        throw new Error("Failed to start dossier");
      return { dossier, postingSnapshot };
    });
    logger.info("Application dossier started or retrieved", {
      requestId,
      jobId,
      dossierId: result.dossier.id,
      postingSnapshotId: result.postingSnapshot.id,
    });
    return result;
  }

  async createManualDraftRevision(
    jobId: string,
    input: CreateManualDraftInput,
  ) {
    const { tenantId, userId, requestId } = requireContext();
    if (input.content.length > MAX_MANUAL_DRAFT_CHARS) {
      throw conflict("Draft content exceeds 100000 characters.");
    }
    const content = input.content.trim();
    if (!content) throw conflict("Draft content is required.");
    const { dossier, postingSnapshot } = await this.startOrGet(jobId);
    if (
      dossier.lifecycleState !== "draft" &&
      dossier.lifecycleState !== "pending_approval"
    ) {
      throw conflict("Draft revisions cannot be added after dossier approval.");
    }
    const resume = await getCurrentDesignResume();
    if (!resume) throw notFound("Resume Studio has not been imported yet.");
    const storyIds = [...new Set(input.storyIds)];
    const stories = await Promise.all(
      storyIds.map(async (id) => {
        const story = await storiesRepo.getInterviewStoryById(id);
        if (!story) throw notFound("Story Bank entry not found");
        return story;
      }),
    );
    const jobSnapshot = bounded(
      canonicalJson({
        postingSnapshotId: postingSnapshot.id,
        contentHash: postingSnapshot.contentHash,
        normalizedText: postingSnapshot.normalizedText,
      }),
      APPLICATION_SNAPSHOT_MAX_CHARS.job,
      "Job snapshot",
    );
    const resumeJson = canonicalJson(resume.resumeJson);
    const resumeSnapshot = bounded(
      canonicalJson({
        documentId: resume.id,
        revision: resume.revision,
        content: resumeJson,
      }),
      APPLICATION_SNAPSHOT_MAX_CHARS.resume,
      "Resume snapshot",
    );
    const storyEvidence = stories.map((story) => {
      const excerpt = bounded(
        normalizeWhitespace(
          [story.title, story.situation, story.task, story.action, story.result]
            .filter(Boolean)
            .join(" — "),
        ),
        10_000,
        "Story excerpt",
      );
      return { id: story.id, excerpt, hash: sha256(excerpt) };
    });
    const storySnapshot = bounded(
      canonicalJson({ stories: storyEvidence }),
      APPLICATION_SNAPSHOT_MAX_CHARS.story,
      "Story snapshot",
    );
    const contentSnapshot = bounded(
      canonicalJson({ body: content }),
      APPLICATION_SNAPSHOT_MAX_CHARS.content,
      "Draft content",
    );
    const provenance = bounded(
      canonicalJson({
        actorUserId: userId,
        kind: "manual_human_draft",
        requestId,
        resume: {
          id: resume.id,
          revision: resume.revision,
          hash: sha256(resumeJson),
        },
        stories: storyEvidence,
        jobPosting: {
          id: postingSnapshot.id,
          hash: postingSnapshot.contentHash,
        },
        version: 1,
      }),
      APPLICATION_SNAPSHOT_MAX_CHARS.provenance,
      "Draft provenance",
    );
    const contentHash = sha256(contentSnapshot);
    const revision = db.transaction((tx) => {
      const currentDossier = tx
        .select()
        .from(applicationDossiers)
        .where(
          and(
            eq(applicationDossiers.tenantId, tenantId),
            eq(applicationDossiers.id, dossier.id),
            eq(applicationDossiers.jobId, jobId),
          ),
        )
        .get();
      if (!currentDossier) throw notFound("Application dossier not found");
      if (
        currentDossier.lifecycleState !== "draft" &&
        currentDossier.lifecycleState !== "pending_approval"
      ) {
        throw conflict(
          "Draft revisions cannot be added after dossier approval.",
        );
      }
      const latest = tx
        .select({
          value: sql<number>`coalesce(max(${applicationDraftRevisions.revisionNumber}), 0)`,
        })
        .from(applicationDraftRevisions)
        .where(
          and(
            eq(applicationDraftRevisions.tenantId, tenantId),
            eq(applicationDraftRevisions.dossierId, dossier.id),
          ),
        )
        .get();
      const revisionNumber = (latest?.value ?? 0) + 1;
      const id = randomUUID();
      tx.insert(applicationDraftRevisions)
        .values({
          id,
          tenantId,
          dossierId: dossier.id,
          jobId,
          revisionNumber,
          jobSnapshot,
          resumeSnapshot,
          storySnapshot,
          contentSnapshot,
          provenance,
          contentHash,
        })
        .run();
      if (currentDossier.lifecycleState === "draft") {
        tx.update(applicationDossiers)
          .set({
            lifecycleState: "pending_approval",
            updatedAt: new Date().toISOString(),
          })
          .where(
            and(
              eq(applicationDossiers.tenantId, tenantId),
              eq(applicationDossiers.id, dossier.id),
            ),
          )
          .run();
      }
      const created = tx
        .select()
        .from(applicationDraftRevisions)
        .where(
          and(
            eq(applicationDraftRevisions.tenantId, tenantId),
            eq(applicationDraftRevisions.id, id),
          ),
        )
        .get();
      if (!created) throw new Error("Failed to create draft revision");
      return created;
    });
    const updatedDossier = await dossierRepo.getApplicationDossierForJob(jobId);
    if (!updatedDossier) throw notFound("Application dossier not found");
    logger.info("Manual application draft revision created", {
      requestId,
      jobId,
      dossierId: dossier.id,
      revisionId: revision.id,
      revisionNumber: revision.revisionNumber,
    });
    return { dossier: updatedDossier, revision, postingSnapshot };
  }
}
