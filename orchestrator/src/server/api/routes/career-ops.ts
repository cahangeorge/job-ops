import { ok } from "@infra/http";
import {
  CAREER_OPS_FEATURES,
  getCareerOpsImplementedActionIds,
} from "@/shared/career-ops/feature-registry";
import type { Request, Response } from "express";
import { Router } from "express";

export const careerOpsRouter = Router();

careerOpsRouter.get("/health", (_req: Request, res: Response) => {
  ok(res, {
    available: true,
    actions: getCareerOpsImplementedActionIds(),
    features: CAREER_OPS_FEATURES,
  });
});
