/**
 * A-G Job Evaluation API routes.
 */

import { badRequest, notFound } from "@infra/errors";
import { asyncRoute, fail, ok } from "@infra/http";
import * as evaluationsRepo from "@server/repositories/job-evaluations";
import * as jobRepo from "@server/repositories/jobs";
import { runBlock, runEvaluation } from "@server/services/evaluation";
import { type Request, type Response, Router } from "express";
import { z } from "zod";

type BlockName = "A" | "B" | "C" | "D" | "E" | "F" | "G";

export const evaluationsRouter = Router();

const createEvaluationBody = z.object({
  blocks: z
    .array(z.enum(["A", "B", "C", "D", "E", "F", "G"]))
    .min(1)
    .max(7)
    .optional(),
  profileId: z.string().trim().min(1).max(255).optional(),
});

const BLOCK_VALUES = ["A", "B", "C", "D", "E", "F", "G"] as const;

/**
 * POST /:jobId/evaluations
 * Initiate a full A-G evaluation (or subset of blocks).
 */
evaluationsRouter.post(
  "/",
  asyncRoute(async (req: Request, res: Response) => {
    const parsed = createEvaluationBody.safeParse(req.body);
    if (!parsed.success) {
      fail(res, badRequest("Invalid request body", parsed.error.flatten()));
      return;
    }

    const jobId = req.params.id;
    if (!jobId) {
      fail(res, badRequest("Job ID is required"));
      return;
    }

    const evaluationId = await runEvaluation({
      jobId,
      blocks: (parsed.data.blocks ?? [...BLOCK_VALUES]) as BlockName[],
      userId: (req as unknown as { userId?: string }).userId,
    });

    ok(
      res,
      {
        evaluationId,
        status: "processing",
        blocksRequested: parsed.data.blocks ?? BLOCK_VALUES,
      },
      202,
    );
  }),
);

/**
 * GET /:jobId/evaluations/latest
 * Shortcut to the latest evaluation for a job.
 */
evaluationsRouter.get(
  "/latest",
  asyncRoute(async (req: Request, res: Response) => {
    const jobId = req.params.id;
    if (!jobId) {
      fail(res, badRequest("Job ID is required"));
      return;
    }

    const evaluation = await evaluationsRepo.getLatestEvaluationForJob(jobId);
    if (!evaluation) {
      fail(res, notFound("No evaluation found for this job"));
      return;
    }

    ok(res, evaluation);
  }),
);

/**
 * GET /:jobId/evaluations/:evaluationId
 * Retrieve evaluation results with blocks.
 */
evaluationsRouter.get(
  "/:evaluationId",
  asyncRoute(async (req: Request, res: Response) => {
    const evaluation = await evaluationsRepo.getEvaluation(
      req.params.evaluationId,
    );
    if (!evaluation) {
      fail(res, notFound("Evaluation not found"));
      return;
    }

    const blocks = await evaluationsRepo.listBlocksForEvaluation(
      req.params.evaluationId,
    );

    ok(res, { ...evaluation, blocks });
  }),
);

/**
 * POST /:jobId/evaluations/:evaluationId/blocks/:block
 * Run a single evaluation block on-demand.
 */
evaluationsRouter.post(
  "/:evaluationId/blocks/:block",
  asyncRoute(async (req: Request, res: Response) => {
    const block = req.params.block?.toUpperCase();
    if (!BLOCK_VALUES.includes(block as (typeof BLOCK_VALUES)[number])) {
      fail(
        res,
        badRequest(`Invalid block. Must be one of: ${BLOCK_VALUES.join(", ")}`),
      );
      return;
    }

    const evaluation = await evaluationsRepo.getEvaluation(
      req.params.evaluationId,
    );
    if (!evaluation) {
      fail(res, notFound("Evaluation not found"));
      return;
    }

    // Fetch job data needed for block execution
    const job = await jobRepo.getJobById(evaluation.jobId);
    if (!job) {
      fail(res, notFound("Job not found for this evaluation"));
      return;
    }

    const result = await runBlock({
      evaluationId: req.params.evaluationId,
      block: block as BlockName,
      job: job as unknown as Record<string, unknown>,
      profile: {},
    });

    ok(res, result);
  }),
);
