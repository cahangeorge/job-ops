import {
  badRequest,
  conflict,
  forbidden,
  notFound,
  serviceUnavailable,
} from "@infra/errors";
import { asyncRoute, fail, ok } from "@infra/http";
import { logger } from "@infra/logger";
import {
  getRequestId,
  getTenantId,
  getUserId,
  isSystemAdmin,
} from "@infra/request-context";
import { getJobQueue } from "@server/infra/job-queue-registry";
import { SqliteJobQueue } from "@server/infra/job-queue-sqlite";
import { wakeAutoPdfRegenerationWorker } from "@server/services/auto-pdf-regeneration";
import { type Request, type Response, Router } from "express";
import { z } from "zod";

export const workflowQueueRouter = Router();

const healthQuerySchema = z.object({
  deadLetterLimit: z.coerce.number().int().min(1).max(50).optional(),
});
const replayParamsSchema = z.object({
  taskId: z.string().trim().min(1).max(200),
});
const replayBodySchema = z.object({}).strict();

function requireTenant(res: Response): string | null {
  const tenantId = getTenantId();
  if (tenantId) return tenantId;
  fail(res, forbidden("Authenticated tenant context is required"));
  return null;
}

function requireSystemAdmin(res: Response): boolean {
  if (isSystemAdmin()) return true;
  fail(res, forbidden("System admin access is required"));
  return false;
}

function getSqliteQueue(): SqliteJobQueue {
  const queue = getJobQueue();
  if (!(queue instanceof SqliteJobQueue)) {
    throw serviceUnavailable("Durable workflow queue is unavailable");
  }
  return queue;
}

workflowQueueRouter.get(
  "/",
  asyncRoute(async (req: Request, res: Response) => {
    const tenantId = requireTenant(res);
    if (!tenantId) return;
    const parsed = healthQuerySchema.safeParse(req.query);
    if (!parsed.success) {
      fail(
        res,
        badRequest("Invalid queue health query", parsed.error.flatten()),
      );
      return;
    }
    ok(res, await getSqliteQueue().getHealthSummary(tenantId, parsed.data));
  }),
);

workflowQueueRouter.post(
  "/dead-letters/:taskId/replay",
  asyncRoute(async (req: Request, res: Response) => {
    const tenantId = requireTenant(res);
    if (!tenantId || !requireSystemAdmin(res)) return;
    const params = replayParamsSchema.safeParse(req.params);
    const body = replayBodySchema.safeParse(req.body ?? {});
    if (!params.success || !body.success) {
      fail(res, badRequest("Invalid replay request"));
      return;
    }
    const result = await getSqliteQueue().replayDeadLetter({
      tenantId,
      taskId: params.data.taskId,
      operatorId: getUserId(),
      requestId: getRequestId(),
    });
    if (!result.replayed) {
      if (result.reason === "not_found") {
        fail(res, notFound("Dead letter not found"));
        return;
      }
      if (result.reason === "invalid_payload") {
        fail(
          res,
          serviceUnavailable("Dead letter payload cannot be replayed safely"),
        );
        return;
      }
      fail(res, conflict("Dead letter has already been replayed"));
      return;
    }
    await wakeAutoPdfRegenerationWorker();
    logger.info("Workflow dead letter replayed", {
      route: "POST /api/workflow-queue/dead-letters/:taskId/replay",
      requestId: getRequestId(),
      tenantId,
      taskId: params.data.taskId,
      replayTaskId: result.replayTaskId,
    });
    ok(res, { replayTaskId: result.replayTaskId });
  }),
);
