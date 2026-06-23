import { describe, expect, it, vi, beforeEach } from "vitest";
import { toAppError } from "@server/infra/errors";
import { fail } from "@server/infra/http";
import { interviewStoriesRouter } from "./interview-stories-router";

const {
  createInterviewStoryMock,
  deleteInterviewStoryMock,
  getAllInterviewStoriesMock,
  getInterviewStoryByIdMock,
  updateInterviewStoryMock,
} = vi.hoisted(() => ({
  createInterviewStoryMock: vi.fn(),
  deleteInterviewStoryMock: vi.fn(),
  getAllInterviewStoriesMock: vi.fn(),
  getInterviewStoryByIdMock: vi.fn(),
  updateInterviewStoryMock: vi.fn(),
}));

vi.mock("@server/repositories/interview-stories", () => ({
  createInterviewStory: createInterviewStoryMock,
  deleteInterviewStory: deleteInterviewStoryMock,
  getAllInterviewStories: getAllInterviewStoriesMock,
  getInterviewStoryById: getInterviewStoryByIdMock,
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
}) {
  const layer = (interviewStoriesRouter.stack as Array<any>).find(
    (entry: any) =>
      "route" in entry &&
      entry.route?.path === args.path &&
      entry.route.methods?.[args.method] === true,
  );

  if (!layer?.route?.stack[0]?.handle) {
    throw new Error(`Route not found for ${args.method.toUpperCase()} ${args.path}`);
  }

  const req = {
    body: args.body ?? {},
    params: args.params ?? {},
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
    updateInterviewStoryMock.mockResolvedValue({ ...story, title: "Scale incident v2" });
    deleteInterviewStoryMock.mockResolvedValue(true);
  });

  it("lists interview stories", async () => {
    const res = await invokeRoute({ method: "get", path: "/" });

    expect(res.statusCode).toBe(200);
    expect(res.body).toMatchObject({
      ok: true,
      data: { stories: [expect.objectContaining({ id: "story-1" })] },
    });
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
