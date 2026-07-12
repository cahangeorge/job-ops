import { createHash } from "node:crypto";
import { badRequest, conflict, notFound } from "@infra/errors";
import * as storiesRepo from "@server/repositories/interview-stories";
import * as jobsRepo from "@server/repositories/jobs";
import {
  requireCurrentDesignResume,
  updateCurrentDesignResume,
} from "@server/services/design-resume";
import { createTailoredCvCandidate } from "@server/services/tailored-cv-candidate";
import type {
  InterviewStory,
  TailoredCvCandidate,
  TailoredCvStoryProofPoint,
  TailoredCvTemplateContract,
} from "@shared/types";

export const designResumeV5Template: TailoredCvTemplateContract = {
  id: "design-resume-v5",
  version: "5",
  variables: [
    "basics.headline",
    "summary.content",
    "sections.skills.items",
    "sections.projects.items",
  ],
};

export interface TailoredCvPreviewRequest {
  storyIds: string[];
  template: TailoredCvTemplateContract;
}

function sha256(value: string): string {
  return createHash("sha256").update(value).digest("hex");
}

function conciseStoryExcerpt(story: InterviewStory): string {
  return [story.title, story.action, story.result]
    .filter(Boolean)
    .join(" — ")
    .slice(0, 360);
}

function proofPointForStory(story: InterviewStory): TailoredCvStoryProofPoint {
  const source = JSON.stringify({
    id: story.id,
    title: story.title,
    situation: story.situation,
    task: story.task,
    action: story.action,
    result: story.result,
    reflection: story.reflection,
    skills: story.skills,
    updatedAt: story.updatedAt,
  });
  return {
    id: story.id,
    excerpt: conciseStoryExcerpt(story),
    hash: sha256(source),
  };
}

async function resolveStoryProofPoints(storyIds: string[]) {
  const uniqueStoryIds = Array.from(new Set(storyIds)).sort();
  const stories = await Promise.all(
    uniqueStoryIds.map((id) => storiesRepo.getInterviewStoryById(id)),
  );
  if (stories.some((story) => !story)) {
    throw badRequest(
      "One or more selected Story Bank proof points are unknown.",
    );
  }
  return stories.map((story) => proofPointForStory(story as InterviewStory));
}

async function requireTailoredCvJob(jobId: string) {
  const job = await jobsRepo.getJobById(jobId);
  if (!job) throw notFound("Job not found");
  return job;
}

export async function previewTailoredCvCandidate(
  jobId: string,
  request: TailoredCvPreviewRequest,
): Promise<TailoredCvCandidate> {
  const job = await requireTailoredCvJob(jobId);
  const [designResume, selectedStoryProofPoints] = await Promise.all([
    requireCurrentDesignResume(),
    resolveStoryProofPoints(request.storyIds),
  ]);
  return createTailoredCvCandidate({
    job,
    designResume,
    template: request.template,
    selectedStoryProofPoints,
  });
}

export async function applyTailoredCvCandidate(args: {
  jobId: string;
  candidate: TailoredCvCandidate;
}) {
  if (args.candidate.provenance.jobId !== args.jobId) {
    throw badRequest("Tailored CV candidate does not belong to this job.");
  }

  const expected = await previewTailoredCvCandidate(args.jobId, {
    storyIds: args.candidate.provenance.selectedStoryIds,
    template: args.candidate.provenance.template,
  });
  const provenance = args.candidate.provenance;
  if (
    provenance.designResumeDocumentId !==
      expected.provenance.designResumeDocumentId ||
    provenance.designResumeRevision !==
      expected.provenance.designResumeRevision ||
    provenance.inputHash !== expected.provenance.inputHash
  ) {
    throw conflict(
      "Tailored CV candidate is no longer valid. Preview it again before applying.",
    );
  }

  return updateCurrentDesignResume({
    baseRevision: provenance.designResumeRevision,
    document: expected.resumeJson,
    expectedJob: {
      id: provenance.jobId,
      updatedAt: provenance.jobUpdatedAt,
    },
  });
}
