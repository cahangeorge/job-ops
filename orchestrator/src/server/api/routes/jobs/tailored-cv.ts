import { asyncRoute, ok } from "@infra/http";
import { parseV5ResumeData } from "@server/services/rxresume/schema/v5";
import {
  applyTailoredCvCandidate,
  designResumeV5Template,
} from "@server/services/tailored-cv";
import type { DesignResumeJson, TailoredCvCandidate } from "@shared/types";
import { type Request, type Response, Router } from "express";
import { z } from "zod";

export const jobsTailoredCvRouter = Router();

const templateSchema = z
  .object({
    id: z.literal(designResumeV5Template.id),
    version: z.literal(designResumeV5Template.version),
    variables: z.tuple([
      z.literal("basics.headline"),
      z.literal("summary.content"),
      z.literal("sections.skills.items"),
      z.literal("sections.projects.items"),
    ]),
  })
  .strict();

export const tailoredCvPreviewRequestSchema = z
  .object({
    storyIds: z.array(z.string().uuid()).max(20),
    template: templateSchema,
  })
  .strict();

const tailoredCvCandidateSchema = z
  .object({
    resumeJson: z.record(z.string(), z.unknown()),
    selectedProjectIds: z.array(z.string()),
    provenance: z
      .object({
        version: z.literal("v1"),
        jobId: z.string().min(1),
        jobUpdatedAt: z.string().min(1),
        jobDescriptionHash: z.string().regex(/^[a-f0-9]{64}$/),
        designResumeDocumentId: z.string().min(1),
        designResumeRevision: z.number().int().min(1),
        template: templateSchema,
        selectedStoryIds: z.array(z.string().uuid()).max(20),
        selectedStoryProofPoints: z
          .array(
            z
              .object({
                id: z.string().uuid(),
                excerpt: z.string().min(1).max(360),
                hash: z.string().regex(/^[a-f0-9]{64}$/),
              })
              .strict(),
          )
          .max(20),
        inputHash: z.string().regex(/^[a-f0-9]{64}$/),
      })
      .strict(),
  })
  .strict();

function parseTailoredCvCandidate(value: unknown): TailoredCvCandidate {
  const parsed = tailoredCvCandidateSchema.parse(value);

  return {
    ...parsed,
    resumeJson: parseV5ResumeData(parsed.resumeJson) as DesignResumeJson,
  };
}

jobsTailoredCvRouter.post(
  "/:id/tailored-cv-candidate/apply",
  asyncRoute(async (req: Request, res: Response) => {
    const candidate = parseTailoredCvCandidate(req.body);
    ok(
      res,
      await applyTailoredCvCandidate({
        jobId: req.params.id,
        candidate,
      }),
    );
  }),
);
