import { badRequest, notFound, toAppError } from "@infra/errors";
import { fail, ok } from "@infra/http";
import * as jobsRepo from "@server/repositories/jobs";
import {
  buildOfferEvaluationNote,
  evaluateOffer,
} from "@server/services/offer-evaluation";
import { Router } from "express";
import { z } from "zod";

export const offerEvaluationRouter = Router();

const offerEvaluationSchema = z.object({
  offeredSalary: z.string().trim().max(200).optional(),
  benefits: z.string().trim().max(2000).optional(),
  deadline: z.string().trim().max(200).optional(),
  competingOffers: z.string().trim().max(2000).optional(),
  dealBreakers: z.array(z.string().trim().max(500)).optional(),
});

offerEvaluationRouter.post("/jobs/:id", async (req, res) => {
  try {
    const input = offerEvaluationSchema.parse(req.body ?? {});
    const job = await jobsRepo.getJobById(req.params.id);
    if (!job) {
      return fail(res, notFound("Job not found"));
    }

    const evaluationInput = {
      jobTitle: job.title,
      employer: job.employer,
      salaryTarget: job.salary,
      offeredSalary: input.offeredSalary,
      benefits: input.benefits,
      deadline: input.deadline,
      competingOffers: input.competingOffers,
      dealBreakers: input.dealBreakers,
    };
    const evaluation = evaluateOffer(evaluationInput);
    const noteDraft = buildOfferEvaluationNote(evaluationInput, evaluation);
    const note = await jobsRepo.createJobNote({
      jobId: job.id,
      title: noteDraft.title,
      content: noteDraft.content,
    });

    ok(res, { evaluation, note });
  } catch (error) {
    if (error instanceof z.ZodError) {
      return fail(res, badRequest(error.message, error.flatten()));
    }
    return fail(res, toAppError(error));
  }
});
