/**
 * ATS Keyword Analysis API Routes
 */

import { Router } from "express";
import { badRequest } from "@infra/errors";
import { ok } from "@infra/http";
import { analyzeAtsKeywords } from "../../services/ats-keywords";
import type { Request, Response } from "express";

export const atsRouter = Router();

atsRouter.post("/analyze", async (req: Request, res: Response) => {
  const { jobDescription, resumeText } = req.body;
  if (!jobDescription || !resumeText) {
    throw badRequest("jobDescription and resumeText are required");
  }
  const result = await analyzeAtsKeywords({ jobDescription, resumeText });
  ok(res, result);
});
