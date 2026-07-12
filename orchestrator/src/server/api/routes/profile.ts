import { toAppError } from "@infra/errors";
import { fail, ok } from "@infra/http";
import { isDemoMode, sendDemoBlocked } from "@server/config/demo";
import { DEMO_PROJECT_CATALOG } from "@server/config/demo-defaults";
import {
  deleteCareerProfileOverlay,
  getCareerProfileOverlay,
  updateCareerProfileOverlay,
} from "@server/repositories/career-profile-overlays";
import { getDesignResumeStatus } from "@server/services/design-resume";
import { clearProfileCache, getProfile } from "@server/services/profile";
import { extractProjectsFromProfile } from "@server/services/resumeProjects";
import {
  clearRxResumeResumeCache,
  getResume,
  RxResumeAuthConfigError,
} from "@server/services/rxresume";
import { getConfiguredRxResumeBaseResumeId } from "@server/services/rxresume/baseResumeId";
import { type Request, type Response, Router } from "express";
import { z } from "zod";

export const profileRouter = Router();

const boundedTextSchema = z.string().trim().min(1).max(120);
const boundedTextListSchema = z.array(boundedTextSchema).max(20);

const preferencesSchema = z
  .object({
    roles: boundedTextListSchema.optional(),
    locations: boundedTextListSchema.optional(),
    workModes: z
      .array(z.enum(["remote", "hybrid", "onsite"]))
      .max(3)
      .optional(),
    employmentTypes: z
      .array(z.enum(["permanent", "contract", "temporary", "internship"]))
      .max(4)
      .optional(),
  })
  .strict();

const targetsSchema = z
  .object({
    companies: boundedTextListSchema.optional(),
    industries: boundedTextListSchema.optional(),
    keywords: boundedTextListSchema.optional(),
  })
  .strict();

const constraintsSchema = z
  .object({
    minimumSalary: z.number().int().min(0).max(1_000_000).optional(),
    requiresVisaSponsorship: z.boolean().optional(),
    excludedCompanies: boundedTextListSchema.optional(),
  })
  .strict();

const provenanceSchema = z
  .object({
    source: z.enum(["manual", "imported"]).optional(),
    note: z.string().trim().max(500).optional(),
  })
  .strict();

export const careerProfileOverlayPatchSchema = z
  .object({
    expectedUpdatedAt: z.string().datetime().nullable(),
    preferences: preferencesSchema.optional(),
    targets: targetsSchema.optional(),
    constraints: constraintsSchema.optional(),
    provenance: provenanceSchema.optional(),
  })
  .strict()
  .superRefine((value, ctx) => {
    if (
      value.preferences === undefined &&
      value.targets === undefined &&
      value.constraints === undefined &&
      value.provenance === undefined
    ) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: "Provide at least one career profile overlay section.",
      });
    }
  });

const careerProfileOverlayDeleteSchema = z
  .object({ expectedUpdatedAt: z.string().datetime() })
  .strict();

/**
 * GET /api/profile/projects - Get all projects available in the base resume
 */
profileRouter.get("/projects", async (_req: Request, res: Response) => {
  try {
    if (isDemoMode()) {
      ok(res, DEMO_PROJECT_CATALOG);
      return;
    }
    const profile = await getProfile();
    const { catalog } = extractProjectsFromProfile(profile);
    ok(res, catalog);
  } catch (error) {
    fail(res, toAppError(error));
  }
});

/**
 * GET /api/profile - Get the full base resume profile
 */
profileRouter.get("/", async (_req: Request, res: Response) => {
  try {
    const profile = await getProfile();
    ok(res, profile);
  } catch (error) {
    fail(res, toAppError(error));
  }
});

profileRouter.get("/overlay", async (_req: Request, res: Response) => {
  try {
    ok(res, await getCareerProfileOverlay());
  } catch (error) {
    fail(res, toAppError(error));
  }
});

profileRouter.patch("/overlay", async (req: Request, res: Response) => {
  try {
    if (isDemoMode()) {
      return sendDemoBlocked(
        res,
        "Saving career preferences is disabled in the public demo.",
        { route: "PATCH /api/profile/overlay" },
      );
    }
    const input = careerProfileOverlayPatchSchema.parse(req.body);
    ok(res, await updateCareerProfileOverlay(input));
  } catch (error) {
    fail(res, toAppError(error));
  }
});

profileRouter.delete("/overlay", async (req: Request, res: Response) => {
  try {
    if (isDemoMode()) {
      return sendDemoBlocked(
        res,
        "Resetting career preferences is disabled in the public demo.",
        { route: "DELETE /api/profile/overlay" },
      );
    }
    const { expectedUpdatedAt } = careerProfileOverlayDeleteSchema.parse(
      req.body,
    );
    await deleteCareerProfileOverlay(expectedUpdatedAt);
    ok(res, { reset: true });
  } catch (error) {
    fail(res, toAppError(error));
  }
});

/**
 * GET /api/profile/status - Check if base resume is configured and accessible
 */
profileRouter.get("/status", async (_req: Request, res: Response) => {
  try {
    const localStatus = await getDesignResumeStatus();
    if (localStatus.exists) {
      ok(res, { exists: true, error: null });
      return;
    }

    const { resumeId: rxresumeBaseResumeId } =
      await getConfiguredRxResumeBaseResumeId();

    if (!rxresumeBaseResumeId) {
      ok(res, {
        exists: false,
        error:
          "No base resume selected. Please select a resume from your Reactive Resume account in Settings.",
      });
      return;
    }

    // Verify the resume is accessible
    try {
      const resume = await getResume(rxresumeBaseResumeId);
      if (!resume.data || typeof resume.data !== "object") {
        ok(res, {
          exists: false,
          error: "Selected resume is empty or invalid.",
        });
        return;
      }

      ok(res, { exists: true, error: null });
    } catch (error) {
      if (error instanceof RxResumeAuthConfigError) {
        ok(res, { exists: false, error: error.message });
        return;
      }
      throw error;
    }
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unknown error";
    ok(res, { exists: false, error: message });
  }
});

/**
 * POST /api/profile/refresh - Clear profile cache and refetch from Reactive Resume
 */
profileRouter.post("/refresh", async (_req: Request, res: Response) => {
  try {
    clearProfileCache();
    clearRxResumeResumeCache();
    const profile = await getProfile(true);
    ok(res, profile);
  } catch (error) {
    fail(res, toAppError(error));
  }
});
