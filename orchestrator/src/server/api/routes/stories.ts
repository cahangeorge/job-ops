/**
 * Story Bank API routes.
 */

import { notFound } from "@infra/errors";
import { asyncRoute, fail, ok } from "@infra/http";
import {
  createStory,
  deleteStory,
  getStory,
  listStories,
  searchStories,
  updateStory,
} from "@server/services/story-bank";
import { type Request, type Response, Router } from "express";
import { z } from "zod";

export const storiesRouter = Router();

const createStoryBody = z.object({
  title: z.string().trim().min(1).max(500),
  situation: z.string().trim().min(1),
  task: z.string().trim().min(1),
  action: z.string().trim().min(1),
  result: z.string().trim().min(1),
  reflection: z.string().trim().optional(),
  tags: z.array(z.string().trim().min(1)).optional(),
  skills: z.array(z.string().trim().min(1)).optional(),
});

const updateStoryBody = z.object({
  title: z.string().trim().min(1).max(500).optional(),
  situation: z.string().trim().min(1).optional(),
  task: z.string().trim().min(1).optional(),
  action: z.string().trim().min(1).optional(),
  result: z.string().trim().min(1).optional(),
  reflection: z.string().trim().optional(),
  tags: z.array(z.string().trim().min(1)).optional(),
  skills: z.array(z.string().trim().min(1)).optional(),
});

/**
 * GET /stories
 * List all stories, optionally filtered by userId.
 */
storiesRouter.get(
  "/",
  asyncRoute(async (req: Request, res: Response) => {
    const userId = (req as unknown as { userId?: string }).userId ?? "";
    const stories = await listStories(userId);
    ok(res, stories);
  }),
);

/**
 * GET /stories/search
 * Search stories by query string, tags, or skills.
 */
storiesRouter.get(
  "/search",
  asyncRoute(async (req: Request, res: Response) => {
    const query = (req.query.q as string) ?? "";
    const tags = req.query.tags
      ? String(req.query.tags)
          .split(",")
          .map((t) => t.trim())
          .filter(Boolean)
      : undefined;
    const skills = req.query.skills
      ? String(req.query.skills)
          .split(",")
          .map((s) => s.trim())
          .filter(Boolean)
      : undefined;

    const userId = (req as unknown as { userId?: string }).userId ?? "";
    const stories = await searchStories({ userId, query, tags, skills });
    ok(res, stories);
  }),
);

/**
 * POST /stories
 * Create a new STAR+R story.
 */
storiesRouter.post(
  "/",
  asyncRoute(async (req: Request, res: Response) => {
    const parsed = createStoryBody.safeParse(req.body);
    if (!parsed.success) {
      fail(
        res,
        new (await import("@infra/errors")).AppError({
          status: 400,
          code: "INVALID_REQUEST",
          message: "Invalid request body",
          details: parsed.error.flatten(),
        }),
      );
      return;
    }

    const userId = (req as unknown as { userId?: string }).userId ?? "";
    const story = await createStory({
      ...parsed.data,
      content: [
        `Situation: ${parsed.data.situation}`,
        `Task: ${parsed.data.task}`,
        `Action: ${parsed.data.action}`,
        `Result: ${parsed.data.result}`,
        parsed.data.reflection ? `Reflection: ${parsed.data.reflection}` : "",
      ]
        .filter(Boolean)
        .join("\n\n"),
      userId,
    });

    ok(res, story, 201);
  }),
);

/**
 * GET /stories/:storyId
 * Get a single story by ID.
 */
storiesRouter.get(
  "/:storyId",
  asyncRoute(async (req: Request, res: Response) => {
    const story = await getStory(req.params.storyId);
    if (!story) {
      fail(res, notFound("Story not found"));
      return;
    }
    ok(res, story);
  }),
);

/**
 * PUT /stories/:storyId
 * Update an existing story.
 */
storiesRouter.put(
  "/:storyId",
  asyncRoute(async (req: Request, res: Response) => {
    const parsed = updateStoryBody.safeParse(req.body);
    if (!parsed.success) {
      fail(
        res,
        new (await import("@infra/errors")).AppError({
          status: 400,
          code: "INVALID_REQUEST",
          message: "Invalid request body",
          details: parsed.error.flatten(),
        }),
      );
      return;
    }

    const existing = await getStory(req.params.storyId);
    if (!existing) {
      fail(res, notFound("Story not found"));
      return;
    }

    const updated = await updateStory(req.params.storyId, parsed.data);

    ok(res, updated);
  }),
);

/**
 * DELETE /stories/:storyId
 * Delete a story.
 */
storiesRouter.delete(
  "/:storyId",
  asyncRoute(async (req: Request, res: Response) => {
    const existing = await getStory(req.params.storyId);
    if (!existing) {
      fail(res, notFound("Story not found"));
      return;
    }

    await deleteStory(req.params.storyId);
    ok(res, { deleted: true });
  }),
);
