/**
 * Posting Legitimacy API routes.
 */

import { notFound } from "@infra/errors";
import { asyncRoute, fail, ok } from "@infra/http";
import {
  analyzeLegitimacy,
  getLatestScore,
  getLatestSignal,
  listScoresForJobs,
} from "@server/services/legitimacy";
import { type Request, type Response, Router } from "express";
import { z } from "zod";

export const legitimacyRouter = Router();

const analyzeBody = z.object({
  jobId: z.string().trim().min(1).max(255),
  jobUrl: z.string().url().optional(),
  company: z.string().trim().max(500).optional(),
  description: z.string().trim().max(50000).optional(),
  postedAt: z.string().trim().optional(),
});

const scoresBatchBody = z.object({
  jobIds: z.array(z.string().trim().min(1).max(255)).min(1).max(100),
});

/**
 * POST /legitimacy/analyze
 * Analyze posting legitimacy for a job.
 */
legitimacyRouter.post(
  "/analyze",
  asyncRoute(async (req: Request, res: Response) => {
    const parsed = analyzeBody.safeParse(req.body);
    if (!parsed.success) {
      fail(
        res,
        new (await import("@infra/errors")).AppError({
          status: 400,
          code: "INVALID_REQUEST",
          message: "Invalid request body",
          details: parsed.error.flatten(),
        }),
      );
      return;
    }

    const result = await analyzeLegitimacy({
      jobId: parsed.data.jobId,
      job: {
        jobUrl: parsed.data.jobUrl,
        company: parsed.data.company,
        description: parsed.data.description,
        postedAt: parsed.data.postedAt,
      },
    });
    ok(res, result);
  }),
);

/**
 * POST /legitimacy/scores-batch
 * Get legitimacy scores for multiple jobs.
 */
legitimacyRouter.post(
  "/scores-batch",
  asyncRoute(async (req: Request, res: Response) => {
    const parsed = scoresBatchBody.safeParse(req.body);
    if (!parsed.success) {
      fail(
        res,
        new (await import("@infra/errors")).AppError({
          status: 400,
          code: "INVALID_REQUEST",
          message: "Invalid request body",
          details: parsed.error.flatten(),
        }),
      );
      return;
    }

    const scores = await listScoresForJobs({ jobIds: parsed.data.jobIds });
    ok(res, scores);
  }),
);

/**
 * GET /legitimacy/score/:jobId
 * Get latest legitimacy score for a job.
 */
legitimacyRouter.get(
  "/score/:jobId",
  asyncRoute(async (req: Request, res: Response) => {
    const score = await getLatestScore({ jobId: req.params.jobId });
    if (!score) {
      fail(res, notFound("No legitimacy score found for this job"));
      return;
    }
    ok(res, score);
  }),
);

/**
 * GET /legitimacy/signal/:jobId
 * Get latest legitimacy signal for a job.
 */
legitimacyRouter.get(
  "/signal/:jobId",
  asyncRoute(async (req: Request, res: Response) => {
    const signal = await getLatestSignal({ jobId: req.params.jobId });
    if (!signal) {
      fail(res, notFound("No legitimacy signal found for this job"));
      return;
    }
    ok(res, signal);
  }),
);
