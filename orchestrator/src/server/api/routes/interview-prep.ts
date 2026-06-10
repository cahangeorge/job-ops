/**
 * Interview Prep API routes.
 */

import { notFound } from "@infra/errors";
import { asyncRoute, fail, ok } from "@infra/http";
import {
  generatePrepPack,
  getPrepPack,
  listPrepPacksForJob,
  listPrepPacksForUser,
} from "@server/services/interview-prep";
import { type Request, type Response, Router } from "express";
import { z } from "zod";

export const interviewPrepRouter = Router();

const createPrepPackBody = z.object({
  jobId: z.string().trim().min(1).max(255),
  audience: z
    .enum(["recruiter", "hiring-manager", "peer", "general"])
    .default("general"),
});

/**
 * POST /interview-prep
 * Generate a new interview preparation pack.
 */
interviewPrepRouter.post(
  "/",
  asyncRoute(async (req: Request, res: Response) => {
    const parsed = createPrepPackBody.safeParse(req.body);
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

    const userId = (req as unknown as { userId?: string }).userId ?? "";
    const packId = await generatePrepPack({
      jobId: parsed.data.jobId,
      userId,
      audience: parsed.data.audience,
    });

    ok(
      res,
      {
        prepPackId: packId,
        status: "processing",
      },
      202,
    );
  }),
);

/**
 * GET /interview-prep
 * List prep packs for the current user.
 */
interviewPrepRouter.get(
  "/",
  asyncRoute(async (req: Request, res: Response) => {
    const userId = (req as unknown as { userId?: string }).userId ?? "";
    const prepPacks = await listPrepPacksForUser(userId);
    ok(res, prepPacks);
  }),
);

/**
 * GET /interview-prep/job/:jobId
 * List all prep packs for a specific job.
 */
interviewPrepRouter.get(
  "/job/:jobId",
  asyncRoute(async (req: Request, res: Response) => {
    const prepPacks = await listPrepPacksForJob(req.params.jobId);
    ok(res, prepPacks);
  }),
);

/**
 * GET /interview-prep/:prepPackId
 * Get a single prep pack by ID.
 */
interviewPrepRouter.get(
  "/:prepPackId",
  asyncRoute(async (req: Request, res: Response) => {
    const prepPack = await getPrepPack(req.params.prepPackId);
    if (!prepPack) {
      fail(res, notFound("Prep pack not found"));
      return;
    }
    ok(res, prepPack);
  }),
);
