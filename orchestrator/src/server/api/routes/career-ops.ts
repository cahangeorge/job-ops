import { ok } from "@infra/http";
import type { Request, Response } from "express";
import { Router } from "express";

export const careerOpsRouter = Router();

careerOpsRouter.get("/health", (_req: Request, res: Response) => {
  ok(res, {
    available: true,
    actions: ["ats", "cover-letter", "negotiation", "portal-scanner"],
  });
});
