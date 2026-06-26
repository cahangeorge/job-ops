/**
 * Company Portal Scanner API Routes
 */

import { badRequest, toAppError } from "@infra/errors";
import { fail, ok } from "@infra/http";
import {
  importPortalScanJobs,
  scanCompanyPortal,
} from "@server/services/portal-scanner";
import { type Request, type Response, Router } from "express";
import { z } from "zod";

export const portalScannerRouter = Router();

const portalScanJobSchema = z.object({
  id: z.string().trim().max(500).optional(),
  sourceJobId: z.string().trim().max(500).optional(),
  title: z.string().trim().min(1).max(500),
  employer: z.string().trim().min(1).max(500),
  location: z.string().trim().max(200).nullable().optional(),
  department: z.string().trim().max(200).nullable().optional(),
  url: z.string().trim().url().max(2000),
  portal: z.enum(["greenhouse", "ashby", "lever"]),
  description: z.string().trim().max(40000).nullable().optional(),
  postedAt: z.string().trim().max(100).nullable().optional(),
  employmentType: z.string().trim().max(200).nullable().optional(),
  experienceLevel: z.string().trim().max(200).nullable().optional(),
  isRemote: z.boolean().optional(),
});

const portalScanImportSchema = z.object({
  jobs: z.array(portalScanJobSchema).min(1),
});

portalScannerRouter.post("/scan", async (req: Request, res: Response) => {
  try {
    const { orgSlug, portal, keywords, departments, excludeInternships } =
      req.body;
    if (!orgSlug || !portal) {
      throw badRequest("orgSlug and portal are required");
    }
    if (!["greenhouse", "ashby", "lever"].includes(portal)) {
      throw badRequest("portal must be one of: greenhouse, ashby, lever");
    }
    const result = await scanCompanyPortal({
      orgSlug,
      portal,
      keywords,
      departments,
      excludeInternships,
    });
    ok(res, result);
  } catch (error) {
    if (error instanceof z.ZodError) {
      return fail(res, badRequest(error.message, error.flatten()));
    }
    return fail(res, toAppError(error));
  }
});

portalScannerRouter.post("/import", async (req: Request, res: Response) => {
  try {
    const input = portalScanImportSchema.parse(req.body ?? {});
    const result = await importPortalScanJobs({ jobs: input.jobs });
    ok(res, result);
  } catch (error) {
    if (error instanceof z.ZodError) {
      return fail(res, badRequest(error.message, error.flatten()));
    }
    return fail(res, toAppError(error));
  }
});
