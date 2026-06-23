import { badRequest } from "@infra/errors";
import { ok } from "@infra/http";
import {
  generateInterviewPrep,
  type InterviewPrepInput,
} from "@server/services/interview-prep";
import type { Request, Response } from "express";
import { Router } from "express";

export const interviewPrepRouter = Router();

interviewPrepRouter.post("/generate", async (req: Request, res: Response) => {
  const { jobTitle, employer } = req.body;
  if (!jobTitle || !employer) {
    throw badRequest("jobTitle and employer are required");
  }

  const result = await generateInterviewPrep(req.body as InterviewPrepInput);
  ok(res, result);
});
