/**
 * Writing Style Calibration API routes.
 */

import { notFound } from "@infra/errors";
import { asyncRoute, fail, ok } from "@infra/http";
import {
  calibrateFromSamples,
  deleteCalibratedProfile,
  getCalibratedProfile,
} from "@server/services/writing-style";
import { type Request, type Response, Router } from "express";
import { z } from "zod";

export const writingStyleRouter = Router();

const calibrateBody = z.object({
  samples: z.array(z.string().trim().min(10)).min(1).max(20),
});

/**
 * POST /writing-style/calibrate
 * Calibrate writing style profile from writing samples.
 */
writingStyleRouter.post(
  "/calibrate",
  asyncRoute(async (req: Request, res: Response) => {
    const parsed = calibrateBody.safeParse(req.body);
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

    const profile = await calibrateFromSamples({
      samples: parsed.data.samples,
      userId: (req as unknown as { userId?: string }).userId,
    });

    ok(res, profile, 201);
  }),
);

/**
 * GET /writing-style
 * Get the current writing style profile.
 */
writingStyleRouter.get(
  "/",
  asyncRoute(async (req: Request, res: Response) => {
    const userId = (req as unknown as { userId?: string }).userId;
    const profile = await getCalibratedProfile({ userId });
    if (!profile) {
      fail(res, notFound("No writing style profile found"));
      return;
    }
    ok(res, profile);
  }),
);

/**
 * DELETE /writing-style
 * Delete the writing style profile.
 */
writingStyleRouter.delete(
  "/",
  asyncRoute(async (req: Request, res: Response) => {
    const userId = (req as unknown as { userId?: string }).userId;
    await deleteCalibratedProfile({ userId });
    ok(res, { deleted: true });
  }),
);
