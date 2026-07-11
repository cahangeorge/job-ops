import { ok } from "@infra/http";
import { logger } from "@infra/logger";
import { getJobListItems } from "@server/repositories/jobs";
import { analyzePatternAnalysis } from "@server/services/pattern-analysis";
import { getProfile } from "@server/services/profile";
import { Router } from "express";

export const patternAnalysisRouter = Router();

patternAnalysisRouter.get("/", async (_req, res) => {
  const jobs = await getJobListItems();
  let profile = null;
  try {
    profile = await getProfile();
  } catch (error) {
    logger.warn("Pattern analysis running without profile context", {
      route: "GET /api/pattern-analysis",
      error,
    });
  }
  const report = analyzePatternAnalysis(jobs, profile);
  ok(res, report);
});
