import { badRequest, conflict, notFound } from "@infra/errors";
import * as jobsRepo from "@server/repositories/jobs";
import {
  requireCurrentDesignResume,
  updateCurrentDesignResume,
} from "@server/services/design-resume";
import { createTailoredCvCandidate } from "@server/services/tailored-cv-candidate";
import type { TailoredCvCandidate } from "@shared/types";

async function requireTailoredCvJob(jobId: string) {
  const job = await jobsRepo.getJobById(jobId);
  if (!job) throw notFound("Job not found");
  return job;
}

export async function previewTailoredCvCandidate(
  jobId: string,
): Promise<TailoredCvCandidate> {
  const job = await requireTailoredCvJob(jobId);
  const designResume = await requireCurrentDesignResume();
  return createTailoredCvCandidate({ job, designResume });
}

export async function applyTailoredCvCandidate(args: {
  jobId: string;
  candidate: TailoredCvCandidate;
}) {
  if (args.candidate.provenance.jobId !== args.jobId) {
    throw badRequest("Tailored CV candidate does not belong to this job.");
  }

  const expected = await previewTailoredCvCandidate(args.jobId);
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
