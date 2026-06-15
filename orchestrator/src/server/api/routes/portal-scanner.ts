/**
 * Company Portal Scanner API Routes
 */

import { Router } from "express";
import { badRequest } from "@infra/errors";
import { ok } from "@infra/http";
import { scanCompanyPortal } from "../../services/portal-scanner";
import type { Request, Response } from "express";

export const portalScannerRouter = Router();

portalScannerRouter.post("/scan", async (req: Request, res: Response) => {
  const { orgSlug, portal, keywords, departments, excludeInternships } = req.body;
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
});
