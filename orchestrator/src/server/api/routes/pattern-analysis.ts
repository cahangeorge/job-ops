import { ok } from "@infra/http";
import { getJobListItems } from "@server/repositories/jobs";
import { analyzePatternAnalysis } from "@server/services/pattern-analysis";
import { Router } from "express";

export const patternAnalysisRouter = Router();

patternAnalysisRouter.get("/", async (_req, res) => {
  const jobs = await getJobListItems();
  const report = analyzePatternAnalysis(jobs);
  ok(res, report);
});
