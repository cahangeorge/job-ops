import { badRequest, notFound } from "@infra/errors";
import { fail, ok, okWithMeta } from "@infra/http";
import { trackServerProductEvent } from "@infra/product-analytics";
import { isDemoMode } from "@server/config/demo";
import { resolveRequestOrigin } from "@server/infra/request-origin";
import * as jobsRepo from "@server/repositories/jobs";
import { simulateApplyJob } from "@server/services/demo-simulator";
import { HumanApplicationSubmissionService } from "@server/services/human-application-submission";
import * as visaSponsors from "@server/services/visa-sponsors/index";
import { type Request, type Response, Router } from "express";
import {
  humanSubmissionSchema,
  hydrateJobPdfFreshness,
  requireJob,
  toJobsRouteError,
} from "./shared";

export const jobsApplicationRouter = Router();

jobsApplicationRouter.post(
  "/:id/check-sponsor",
  async (req: Request, res: Response) => {
    try {
      const job = await requireJob(req.params.id);

      if (!job.employer) {
        return fail(res, badRequest("Job has no employer name"));
      }

      const sponsorResults = await visaSponsors.searchSponsors(job.employer, {
        limit: 10,
        minScore: 50,
      });

      const { sponsorMatchScore, sponsorMatchNames } =
        visaSponsors.calculateSponsorMatchSummary(sponsorResults);

      const updatedJob = await jobsRepo.updateJob(job.id, {
        sponsorMatchScore: sponsorMatchScore,
        sponsorMatchNames: sponsorMatchNames ?? undefined,
      });

      if (!updatedJob) {
        return fail(res, notFound("Job not found"));
      }

      if (sponsorMatchScore >= 50 && sponsorResults.length > 0) {
        void trackServerProductEvent(
          "sponsor_match_found",
          {
            match_score: sponsorMatchScore,
            match_count: sponsorResults.length,
          },
          {
            requestOrigin: resolveRequestOrigin(req),
            urlPath: "/visa-sponsors",
          },
        );
      }

      ok(res, {
        ...(await hydrateJobPdfFreshness(updatedJob)),
        matchResults: sponsorResults.slice(0, 5).map((r) => ({
          name: r.sponsor.organisationName,
          score: r.score,
        })),
      });
    } catch (error) {
      fail(res, toJobsRouteError(error));
    }
  },
);

jobsApplicationRouter.post(
  "/:id/apply",
  async (req: Request, res: Response) => {
    try {
      if (isDemoMode()) {
        const updatedJob = await simulateApplyJob(req.params.id);
        return okWithMeta(res, await hydrateJobPdfFreshness(updatedJob), {
          simulated: true,
        });
      }

      return fail(
        res,
        badRequest(
          "Direct apply is disabled. Use the human submission endpoint.",
        ),
      );
    } catch (error) {
      fail(res, toJobsRouteError(error));
    }
  },
);

jobsApplicationRouter.post(
  "/:id/submit",
  async (req: Request, res: Response) => {
    try {
      const input = humanSubmissionSchema.parse(req.body);
      const result = await new HumanApplicationSubmissionService().submit({
        jobId: req.params.id,
        ...input,
      });
      const job = await requireJob(req.params.id);
      ok(res, {
        ...(await hydrateJobPdfFreshness(job)),
        submittedArtifactId: result.artifactId,
      });
    } catch (error) {
      fail(res, toJobsRouteError(error));
    }
  },
);
