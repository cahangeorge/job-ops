import { notFound } from "@infra/errors";
import { asyncRoute, ok } from "@infra/http";
import { getJobById, updateJobLivenessResult } from "@server/repositories/jobs";
import { checkPostingLiveness } from "@server/services/liveness";
import { Router } from "express";

export const livenessRouter = Router();

livenessRouter.post(
  "/jobs/:id/check",
  asyncRoute(async (req, res) => {
    const job = await getJobById(req.params.id);
    if (!job) {
      throw notFound("Job not found");
    }

    const targetUrl = job.applicationLink?.trim() || job.jobUrl?.trim();
    const result = targetUrl
      ? await checkPostingLiveness(targetUrl)
      : {
          status: "uncertain" as const,
          checkedAt: Date.now(),
          reason: "No job URL available",
        };

    await updateJobLivenessResult(job.id, result);
    ok(res, result);
  }),
);
