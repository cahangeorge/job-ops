/**
 * Batch Processing API Routes
 */

import { badRequest } from "@infra/errors";
import { ok } from "@infra/http";
import {
  batchGenerateCoverLetters,
  batchScoreJobs,
} from "@server/services/batch";
import type { Request, Response } from "express";
import { Router } from "express";

export const batchRouter = Router();

batchRouter.post("/score", async (req: Request, res: Response) => {
  const { jobIds, profile } = req.body;
  if (!Array.isArray(jobIds) || jobIds.length === 0) {
    throw badRequest("jobIds must be a non-empty array");
  }
  const results = await batchScoreJobs(jobIds, profile ?? {});
  ok(res, { results });
});

batchRouter.post("/cover-letters", async (req: Request, res: Response) => {
  const { inputs } = req.body;
  if (!Array.isArray(inputs) || inputs.length === 0) {
    throw badRequest("inputs must be a non-empty array");
  }
  const results = await batchGenerateCoverLetters(inputs);
  ok(res, { results });
});
