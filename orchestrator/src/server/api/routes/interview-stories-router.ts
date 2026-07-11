/**
 * Interview Stories API routes (consolidated)
 */

import { badRequest, notFound } from "@infra/errors";
import { ok } from "@infra/http";
import * as storiesRepo from "@server/repositories/interview-stories";
import type { Request, Response } from "express";
import { Router } from "express";

export const interviewStoriesRouter = Router();
interviewStoriesRouter.get("/", async (_req: Request, res: Response) => {
  const tagIds = parseTagIds(_req.query.tagId);
  const stories = await storiesRepo.getAllInterviewStories({ tagIds });
  ok(res, { stories });
});

interviewStoriesRouter.get("/tags", async (_req: Request, res: Response) => {
  const tags = await storiesRepo.getStoryTags();
  ok(res, { tags });
});

interviewStoriesRouter.post("/tags", async (req: Request, res: Response) => {
  const name = requiredString(req.body?.name, "Tag name", 64);
  const tag = await storiesRepo.createStoryTag(name);
  ok(res, tag);
});

interviewStoriesRouter.delete(
  "/tags/:tagId",
  async (req: Request, res: Response) => {
    const deleted = await storiesRepo.deleteStoryTag(
      requiredId(req.params.tagId, "Tag ID"),
    );
    if (!deleted) throw notFound("Story tag not found");
    ok(res, { deleted: true });
  },
);

interviewStoriesRouter.patch(
  "/tags/:tagId",
  async (req: Request, res: Response) => {
    const tag = await storiesRepo.updateStoryTag(
      requiredId(req.params.tagId, "Tag ID"),
      requiredString(req.body?.name, "Tag name", 64),
    );
    if (!tag) throw notFound("Story tag not found");
    ok(res, tag);
  },
);

interviewStoriesRouter.post(
  "/:id/tags/:tagId",
  async (req: Request, res: Response) => {
    await storiesRepo.assignStoryTag(
      requiredId(req.params.id, "Story ID"),
      requiredId(req.params.tagId, "Tag ID"),
    );
    ok(res, { assigned: true });
  },
);

interviewStoriesRouter.delete(
  "/:id/tags/:tagId",
  async (req: Request, res: Response) => {
    const removed = await storiesRepo.unassignStoryTag(
      requiredId(req.params.id, "Story ID"),
      requiredId(req.params.tagId, "Tag ID"),
    );
    if (!removed) throw notFound("Story tag assignment not found");
    ok(res, { removed: true });
  },
);

interviewStoriesRouter.post(
  "/:id/usage-events",
  async (req: Request, res: Response) => {
    const usageKind = req.body?.usageKind;
    if (
      usageKind !== "draft" &&
      usageKind !== "submitted_application" &&
      usageKind !== "interview_prep"
    ) {
      throw badRequest(
        "Usage kind must be draft, submitted_application, or interview_prep",
      );
    }
    const provenance = req.body?.provenance;
    if (
      !provenance ||
      typeof provenance !== "object" ||
      Array.isArray(provenance)
    ) {
      throw badRequest("Usage provenance must be an object");
    }
    const provenanceJson = JSON.stringify(provenance);
    if (provenanceJson.length > 20_000)
      throw badRequest("Usage provenance is too large");
    const event = await storiesRepo.assignStoryUsage({
      storyId: requiredId(req.params.id, "Story ID"),
      jobId: requiredId(req.body?.jobId, "Job ID"),
      usageKind,
      provenance: provenanceJson,
    });
    ok(res, event);
  },
);

interviewStoriesRouter.get("/:id", async (req: Request, res: Response) => {
  const story = await storiesRepo.getInterviewStoryById(req.params.id);
  if (!story) throw notFound("Interview story not found");
  ok(res, story);
});

interviewStoriesRouter.post("/", async (req: Request, res: Response) => {
  const {
    title,
    situation,
    task,
    action,
    result,
    reflection,
    skills,
    tags,
    isMasterStory,
  } = req.body;
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

function requiredString(
  value: unknown,
  label: string,
  maxLength: number,
): string {
  if (typeof value !== "string") throw badRequest(`${label} is required`);
  const normalized = value.trim();
  if (!normalized) throw badRequest(`${label} is required`);
  if (normalized.length > maxLength) throw badRequest(`${label} is too long`);
  return normalized;
}

function requiredId(value: unknown, label: string): string {
  return requiredString(value, label, 128);
}

function parseTagIds(value: unknown): string[] {
  if (value === undefined) return [];
  if (typeof value !== "string")
    throw badRequest("Tag filter must be a comma-separated string");
  const tagIds = [
    ...new Set(
      value
        .split(",")
        .map((id) => id.trim())
        .filter(Boolean),
    ),
  ];
  if (tagIds.length > 20 || tagIds.some((id) => id.length > 128))
    throw badRequest("Tag filter is invalid");
  return tagIds;
}
