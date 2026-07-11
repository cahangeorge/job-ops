import { asyncRoute, ok } from "@infra/http";
import { applyTailoredCvCandidate } from "@server/services/tailored-cv";
import type { TailoredCvCandidate } from "@shared/types";
import { type Request, type Response, Router } from "express";
import { z } from "zod";

export const jobsTailoredCvRouter = Router();

const tailoredCvCandidateSchema = z.object({
  resumeJson: z.record(z.string(), z.unknown()),
  selectedProjectIds: z.array(z.string()),
  provenance: z.object({
    version: z.literal("v1"),
    jobId: z.string().min(1),
    jobUpdatedAt: z.string().min(1),
    jobDescriptionHash: z.string().regex(/^[a-f0-9]{64}$/),
    designResumeDocumentId: z.string().min(1),
    designResumeRevision: z.number().int().min(1),
    inputHash: z.string().regex(/^[a-f0-9]{64}$/),
  }),
});

jobsTailoredCvRouter.post(
  "/:id/tailored-cv-candidate/apply",
  asyncRoute(async (req: Request, res: Response) => {
    const candidate = tailoredCvCandidateSchema.parse(req.body);
    ok(
      res,
      await applyTailoredCvCandidate({
        jobId: req.params.id,
        candidate: candidate as TailoredCvCandidate,
      }),
    );
  }),
);
