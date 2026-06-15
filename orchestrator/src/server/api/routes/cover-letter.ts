/**
 * Cover Letter API Routes
 */

import { Router } from "express";
import { badRequest } from "@infra/errors";
import { ok } from "@infra/http";
import { generateCoverLetter, type CoverLetterInput } from "../../services/cover-letter";
import type { Request, Response } from "express";

export const coverLetterRouter = Router();

coverLetterRouter.post("/generate", async (req: Request, res: Response) => {
  const { jobTitle, employer, jobDescription, resumeSummary, companyResearch, tone, angle } = req.body;
  if (!jobTitle || !employer || !jobDescription || !resumeSummary) {
    throw badRequest("jobTitle, employer, jobDescription, and resumeSummary are required");
  }
  const result = await generateCoverLetter({
    jobTitle,
    employer,
    jobDescription,
    resumeSummary,
    companyResearch,
    tone,
    angle,
  } as CoverLetterInput);
  ok(res, result);
});
