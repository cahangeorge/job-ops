import { badRequest } from "@infra/errors";
import { asyncRoute, fail, ok } from "@infra/http";
import { logger } from "@infra/logger";
import {
  type CareerPipelineSort,
  getCareerPipelineProjection,
} from "@server/repositories/career-pipeline";
import type { Request, Response } from "express";
import { Router } from "express";
import { z } from "zod";
import {
  CAREER_OPS_FEATURES,
  getCareerOpsImplementedActionIds,
} from "@/shared/career-ops/feature-registry";

export const careerOpsRouter = Router();

const pipelineQuerySchema = z.object({
  stage: z
    .union([
      z.enum([
        "recruiter_screen",
        "assessment",
        "hiring_manager_screen",
        "technical_interview",
        "onsite",
        "offer",
        "closed",
      ]),
      z.array(
        z.enum([
          "recruiter_screen",
          "assessment",
          "hiring_manager_screen",
          "technical_interview",
          "onsite",
          "offer",
          "closed",
        ]),
      ),
    ])
    .optional()
    .transform((value) =>
      value ? (Array.isArray(value) ? value : [value]) : undefined,
    ),
  sort: z.enum(["updated", "title", "company"]).optional(),
});

careerOpsRouter.get(
  "/pipeline",
  asyncRoute(async (req: Request, res: Response) => {
    const parsed = pipelineQuerySchema.safeParse(req.query);
    if (!parsed.success) {
      fail(res, badRequest(parsed.error.message, parsed.error.flatten()));
      return;
    }

    const projection = await getCareerPipelineProjection({
      stages: parsed.data.stage,
      sort: parsed.data.sort as CareerPipelineSort | undefined,
    });
    logger.info("Career pipeline projection fetched", {
      route: "GET /api/career-ops/pipeline",
      stages: parsed.data.stage ?? null,
      sort: parsed.data.sort ?? "updated",
      columnCount: projection.columns.length,
      cardCount: projection.columns.reduce(
        (total, column) => total + column.cards.length,
        0,
      ),
    });
    ok(res, projection);
  }),
);

careerOpsRouter.get("/health", (_req: Request, res: Response) => {
  ok(res, {
    available: true,
    actions: getCareerOpsImplementedActionIds(),
    features: CAREER_OPS_FEATURES,
  });
});
