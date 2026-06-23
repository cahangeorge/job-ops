/**
 * Interview Stories API routes (consolidated)
 */

import { Router } from "express";
import * as storiesRepo from "../../repositories/interview-stories";
import { badRequest, notFound } from "@infra/errors";
import { ok } from "@infra/http";
import type { Request, Response } from "express";

export const interviewStoriesRouter = Router();
interviewStoriesRouter.get("/", async (_req: Request, res: Response) => {
  const stories = await storiesRepo.getAllInterviewStories();
  ok(res, { stories });
});

interviewStoriesRouter.get("/:id", async (req: Request, res: Response) => {
  const story = await storiesRepo.getInterviewStoryById(req.params.id);
  if (!story) throw notFound("Interview story not found");
  ok(res, story);
});

interviewStoriesRouter.post("/", async (req: Request, res: Response) => {
  const { title, situation, task, action, result, reflection, skills, tags, isMasterStory } = req.body;
  if (!title || !situation || !task || !action || !result) {
    throw badRequest("Title, situation, task, action, and result are required");
  }
  const story = await storiesRepo.createInterviewStory({
    title,
    situation,
    task,
    action,
    result,
    reflection,
    skills,
    tags,
    isMasterStory: isMasterStory ?? false,
  });
  ok(res, story);
});

interviewStoriesRouter.patch("/:id", async (req: Request, res: Response) => {
  const story = await storiesRepo.updateInterviewStory(req.params.id, req.body);
  if (!story) throw notFound("Interview story not found");
  ok(res, story);
});

interviewStoriesRouter.delete("/:id", async (req: Request, res: Response) => {
  const deleted = await storiesRepo.deleteInterviewStory(req.params.id);
  if (!deleted) throw notFound("Interview story not found");
  ok(res, { deleted: true });
});
