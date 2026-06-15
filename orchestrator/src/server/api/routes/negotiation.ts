/**
 * Negotiation API Routes
 */

import { Router } from "express";
import { badRequest } from "@infra/errors";
import { ok } from "@infra/http";
import { generateNegotiationScripts, type NegotiationInput } from "../../services/negotiation";
import type { Request, Response } from "express";

export const negotiationRouter = Router();

negotiationRouter.post("/generate", async (req: Request, res: Response) => {
  const { jobTitle, employer, location } = req.body;
  if (!jobTitle || !employer || !location) {
    throw badRequest("jobTitle, employer, and location are required");
  }
  const result = await generateNegotiationScripts(req.body as NegotiationInput);
  ok(res, result);
});
