import { toAppError } from "@server/infra/errors";
import { fail } from "@server/infra/http";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { interviewStoriesRouter } from "./interview-stories-router";

const {
  createInterviewStoryMock,
  createStoryTagMock,
  deleteInterviewStoryMock,
  deleteStoryTagMock,
  getAllInterviewStoriesMock,
  getInterviewStoryByIdMock,
  getStoryTagsMock,
  assignStoryTagMock,
  unassignStoryTagMock,
  updateStoryTagMock,
  assignStoryUsageMock,
  updateInterviewStoryMock,
} = vi.hoisted(() => ({
  createInterviewStoryMock: vi.fn(),
  createStoryTagMock: vi.fn(),
  deleteInterviewStoryMock: vi.fn(),
  deleteStoryTagMock: vi.fn(),
  getAllInterviewStoriesMock: vi.fn(),
  getInterviewStoryByIdMock: vi.fn(),
  getStoryTagsMock: vi.fn(),
  assignStoryTagMock: vi.fn(),
  unassignStoryTagMock: vi.fn(),
  updateStoryTagMock: vi.fn(),
  assignStoryUsageMock: vi.fn(),
  updateInterviewStoryMock: vi.fn(),
}));

vi.mock("@server/repositories/interview-stories", () => ({
  createInterviewStory: createInterviewStoryMock,
  createStoryTag: createStoryTagMock,
  deleteInterviewStory: deleteInterviewStoryMock,
  deleteStoryTag: deleteStoryTagMock,
  getAllInterviewStories: getAllInterviewStoriesMock,
  getInterviewStoryById: getInterviewStoryByIdMock,
  getStoryTags: getStoryTagsMock,
  assignStoryTag: assignStoryTagMock,
  unassignStoryTag: unassignStoryTagMock,
  updateStoryTag: updateStoryTagMock,
  assignStoryUsage: assignStoryUsageMock,
  updateInterviewStory: updateInterviewStoryMock,
}));

type MockResponse = {
  body: unknown;
  headers: Record<string, string>;
  statusCode: number;
  getHeader: (name: string) => string | undefined;
  json: (payload: unknown) => MockResponse;
  setHeader: (name: string, value: string) => MockResponse;
  status: (code: number) => MockResponse;
};

function createMockResponse(): MockResponse {
  return {
    body: null,
    headers: {},
    statusCode: 200,
    getHeader(name: string) {
      return this.headers[name.toLowerCase()];
    },
    setHeader(name: string, value: string) {
      this.headers[name.toLowerCase()] = value;
      return this;
    },
    status(code: number) {
      this.statusCode = code;
      return this;
    },
    json(payload: unknown) {
      this.body = payload;
      return this;
    },
  };
}

async function invokeRoute(args: {
  method: "get" | "post" | "patch" | "delete";
  path: string;
  body?: unknown;
  params?: Record<string, string>;
  query?: Record<string, string>;
}) {
  const layer = (interviewStoriesRouter.stack as Array<any>).find(
    (entry: any) =>
      "route" in entry &&
      entry.route?.path === args.path &&
      entry.route.methods?.[args.method] === true,
  );

  if (!layer?.route?.stack[0]?.handle) {
    throw new Error(
      `Route not found for ${args.method.toUpperCase()} ${args.path}`,
    );
  }

  const req = {
    body: args.body ?? {},
    params: args.params ?? {},
    query: args.query ?? {},
  };
  const res = createMockResponse();

  try {
    await layer.route.stack[0].handle(req as never, res as never, vi.fn());
  } catch (error) {
    fail(res as never, toAppError(error));
  }

  return res;
}

const story = {
  id: "story-1",
  tenantId: "tenant_default",
  title: "Scale incident",
  situation: "Traffic spiked during launch.",
  task: "Keep the platform online.",
  action: "Added queue backpressure and scaled workers.",
  result: "Error rate dropped below 1%.",
  reflection: "Prepared runbooks earlier next time.",
  skills: "systems,incident-response",
  tags: "reliability,leadership",
  isMasterStory: true,
  createdAt: "2026-01-01T00:00:00.000Z",
  updatedAt: "2026-01-01T00:00:00.000Z",
};

describe("Interview stories API routes", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    getAllInterviewStoriesMock.mockResolvedValue([story]);
    getInterviewStoryByIdMock.mockResolvedValue(story);
    createInterviewStoryMock.mockResolvedValue(story);
    updateInterviewStoryMock.mockResolvedValue({
      ...story,
      title: "Scale incident v2",
    });
    deleteInterviewStoryMock.mockResolvedValue(true);
    getStoryTagsMock.mockResolvedValue([{ id: "tag-1", name: "leadership" }]);
    createStoryTagMock.mockResolvedValue({ id: "tag-2", name: "delivery" });
    deleteStoryTagMock.mockResolvedValue(true);
    assignStoryTagMock.mockResolvedValue(undefined);
    unassignStoryTagMock.mockResolvedValue(true);
    updateStoryTagMock.mockResolvedValue({
      id: "tag-1",
      name: "leadership-principles",
    });
    assignStoryUsageMock.mockResolvedValue({ id: "usage-1" });
  });

  it("lists interview stories", async () => {
    const res = await invokeRoute({ method: "get", path: "/" });

    expect(res.statusCode).toBe(200);
    expect(res.body).toMatchObject({
      ok: true,
      data: { stories: [expect.objectContaining({ id: "story-1" })] },
    });
  });

  it("manages normalized tags, filters stories, and records usage", async () => {
    const filtered = await invokeRoute({
      method: "get",
      path: "/",
      query: { tagId: "tag-1,tag-2" },
    });
    expect(getAllInterviewStoriesMock).toHaveBeenCalledWith({
      tagIds: ["tag-1", "tag-2"],
    });
    expect(filtered.statusCode).toBe(200);

    const tags = await invokeRoute({ method: "get", path: "/tags" });
    expect(tags.body).toMatchObject({
      ok: true,
      data: { tags: [{ name: "leadership" }] },
    });

    const created = await invokeRoute({
      method: "post",
      path: "/tags",
      body: { name: " Delivery " },
    });
    expect(createStoryTagMock).toHaveBeenCalledWith("Delivery");
    expect(created.body).toMatchObject({
      ok: true,
      data: { name: "delivery" },
    });

    const renamed = await invokeRoute({
      method: "patch",
      path: "/tags/:tagId",
      params: { tagId: "tag-1" },
      body: { name: "Leadership principles" },
    });
    expect(updateStoryTagMock).toHaveBeenCalledWith(
      "tag-1",
      "Leadership principles",
    );
    expect(renamed.body).toMatchObject({
      ok: true,
      data: { name: "leadership-principles" },
    });

    const assignment = await invokeRoute({
      method: "post",
      path: "/:id/tags/:tagId",
      params: { id: "story-1", tagId: "tag-1" },
    });
    expect(assignStoryTagMock).toHaveBeenCalledWith("story-1", "tag-1");
    expect(assignment.body).toMatchObject({
      ok: true,
      data: { assigned: true },
    });

    const usage = await invokeRoute({
      method: "post",
      path: "/:id/usage-events",
      params: { id: "story-1" },
      body: {
        jobId: "job-1",
        usageKind: "draft",
        provenance: { source: "editor" },
      },
    });
    expect(assignStoryUsageMock).toHaveBeenCalledWith({
      storyId: "story-1",
      jobId: "job-1",
      usageKind: "draft",
      provenance: '{"source":"editor"}',
    });
    expect(usage.body).toMatchObject({ ok: true, data: { id: "usage-1" } });
  });

  it("creates STAR interview stories", async () => {
    const res = await invokeRoute({
      method: "post",
      path: "/",
      body: {
        title: story.title,
        situation: story.situation,
        task: story.task,
        action: story.action,
        result: story.result,
        reflection: story.reflection,
        skills: story.skills,
        tags: story.tags,
        isMasterStory: true,
      },
    });

    expect(res.statusCode).toBe(200);
    expect(createInterviewStoryMock).toHaveBeenCalledWith(
      expect.objectContaining({ title: story.title, isMasterStory: true }),
    );
    expect(res.body).toMatchObject({ ok: true, data: { id: "story-1" } });
  });

  it("rejects stories missing required STAR fields", async () => {
    const res = await invokeRoute({
      method: "post",
      path: "/",
      body: { title: "Incomplete" },
    });

    expect(res.statusCode).toBe(400);
    expect(res.body).toMatchObject({ ok: false });
  });

  it("fetches, updates, and deletes stories by id", async () => {
    const getRes = await invokeRoute({
      method: "get",
      path: "/:id",
      params: { id: "story-1" },
    });
    expect(getRes.body).toMatchObject({ ok: true, data: { id: "story-1" } });

    const patchRes = await invokeRoute({
      method: "patch",
      path: "/:id",
      params: { id: "story-1" },
      body: { title: "Scale incident v2" },
    });
    expect(updateInterviewStoryMock).toHaveBeenCalledWith("story-1", {
      title: "Scale incident v2",
    });
    expect(patchRes.body).toMatchObject({
      ok: true,
      data: { title: "Scale incident v2" },
    });

    const deleteRes = await invokeRoute({
      method: "delete",
      path: "/:id",
      params: { id: "story-1" },
    });
    expect(deleteInterviewStoryMock).toHaveBeenCalledWith("story-1");
    expect(deleteRes.body).toMatchObject({ ok: true, data: { deleted: true } });
  });

  it("returns 404 for missing stories", async () => {
    getInterviewStoryByIdMock.mockResolvedValueOnce(null);
    updateInterviewStoryMock.mockResolvedValueOnce(null);
    deleteInterviewStoryMock.mockResolvedValueOnce(false);

    const getRes = await invokeRoute({
      method: "get",
      path: "/:id",
      params: { id: "missing" },
    });
    expect(getRes.statusCode).toBe(404);

    const patchRes = await invokeRoute({
      method: "patch",
      path: "/:id",
      params: { id: "missing" },
      body: { title: "Nope" },
    });
    expect(patchRes.statusCode).toBe(404);

    const deleteRes = await invokeRoute({
      method: "delete",
      path: "/:id",
      params: { id: "missing" },
    });
    expect(deleteRes.statusCode).toBe(404);
  });
});
