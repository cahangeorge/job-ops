import { asyncRoute, ok } from "@infra/http";
import { listOutcomeLearningRecords } from "@server/repositories/competency-evidence";
import { aggregateOutcomeLearning } from "@server/services/outcome-learning";
import { getActiveTenantId } from "@server/tenancy/context";
import { Router } from "express";

export const outcomeLearningRouter = Router();

outcomeLearningRouter.get(
  "/",
  asyncRoute(async (_req, res) => {
    const tenantId = getActiveTenantId();
    const records = await listOutcomeLearningRecords();
    ok(res, aggregateOutcomeLearning({ tenantId, records }));
  }),
);
