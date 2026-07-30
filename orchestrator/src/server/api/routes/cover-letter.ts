/**
 * Cover Letter API Routes
 */

import { badRequest } from "@infra/errors";
import { ok } from "@infra/http";
import {
  type CoverLetterInput,
  generateCoverLetter,
} from "@server/services/cover-letter";
import type { Request, Response } from "express";
import { Router } from "express";

export const coverLetterRouter = Router();

coverLetterRouter.post("/generate", async (req: Request, res: Response) => {
  const {
    jobTitle,
    employer,
    jobDescription,
    resumeSummary,
    companyResearch,
    tone,
    angle,
  } = req.body;
  if (!jobTitle || !employer || !jobDescription || !resumeSummary) {
    throw badRequest(
      "jobTitle, employer, jobDescription, and resumeSummary are required",
    );
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
