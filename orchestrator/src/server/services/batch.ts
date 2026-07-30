/**
 * Batch Processing Service (from Career Ops)
 * Evaluate multiple jobs or generate multiple outputs in parallel.
 */

import * as jobsRepo from "../repositories/jobs";
import { type CoverLetterInput, generateCoverLetter } from "./cover-letter";
import { scoreJobSuitability } from "./scorer";

export interface BatchScoreResult {
  jobId: string;
  title: string;
  employer: string;
  score: number | null;
  reason: string | null;
  error?: string;
}

export interface BatchCoverLetterResult {
  jobId: string;
  coverLetter: string;
  keywordsMirrored: string[];
  error?: string;
}

/**
 * Batch-score multiple jobs in parallel
 */
export async function batchScoreJobs(
  jobIds: string[],
  profile: Record<string, unknown>,
): Promise<BatchScoreResult[]> {
  const results = await Promise.all(
    jobIds.map(async (jobId) => {
      try {
        const job = await jobsRepo.getJobById(jobId);
        if (!job) {
          return {
            jobId,
            title: "",
            employer: "",
            score: null,
            reason: null,
            error: "Job not found",
          };
        }
        const result = await scoreJobSuitability(job, profile);
        return {
          jobId,
          title: job.title,
          employer: job.employer,
          score: result.score,
          reason: result.reason,
        };
      } catch (err) {
        return {
          jobId,
          title: "",
          employer: "",
          score: null,
          reason: null,
          error: err instanceof Error ? err.message : String(err),
        };
      }
    }),
  );
  return results;
}

/**
 * Batch-generate cover letters for multiple jobs in parallel
 */
export async function batchGenerateCoverLetters(
  inputs: Array<{ jobId: string } & CoverLetterInput>,
): Promise<BatchCoverLetterResult[]> {
  const results = await Promise.all(
    inputs.map(async (input) => {
      try {
        const result = await generateCoverLetter(input);
        return {
          jobId: input.jobId,
          coverLetter: result.coverLetter,
          keywordsMirrored: result.keywordsMirrored,
        };
      } catch (err) {
        return {
          jobId: input.jobId,
          coverLetter: "",
          keywordsMirrored: [],
          error: err instanceof Error ? err.message : String(err),
        };
      }
    }),
  );
  return results;
}
