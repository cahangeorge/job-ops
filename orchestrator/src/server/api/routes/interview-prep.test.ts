import { toAppError } from "@server/infra/errors";
import { fail } from "@server/infra/http";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { interviewPrepRouter } from "./interview-prep";

const { generateInterviewPrepMock } = vi.hoisted(() => ({
  generateInterviewPrepMock: vi.fn(),
}));

vi.mock("@server/services/interview-prep", () => ({
  generateInterviewPrep: generateInterviewPrepMock,
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

async function invokeGenerate(body: unknown) {
  const layer = (interviewPrepRouter.stack as Array<any>).find(
    (entry: any) =>
      "route" in entry &&
      entry.route?.path === "/generate" &&
      entry.route.methods?.post === true,
  );

  if (!layer?.route?.stack[0]?.handle) {
    throw new Error("Route not found for POST /generate");
  }

  const req = { body };
  const res = createMockResponse();

  try {
    await layer.route.stack[0].handle(req as never, res as never, vi.fn());
  } catch (error) {
    fail(res as never, toAppError(error));
  }

  return res;
}

describe("Interview Prep API routes", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    generateInterviewPrepMock.mockResolvedValue({
      prepGuidance: "Focus on reliability leadership.",
      targetQuestions: ["Tell me about an incident."],
      answerOutlines: [
        {
          question: "Tell me about an incident.",
          outline: "Use Scale incident.",
          storyIds: ["story-1"],
        },
      ],
      recommendedStoryIds: ["story-1"],
      interviewerQuestions: ["How is reliability measured?"],
    });
  });

  it("generates interview prep for a job and Story Bank payload", async () => {
    const body = {
      jobTitle: "Senior Platform Engineer",
      employer: "Acme Labs",
      jobDescription: "Own incidents.",
      stories: [{ id: "story-1", title: "Scale incident" }],
    };

    const res = await invokeGenerate(body);

    expect(generateInterviewPrepMock).toHaveBeenCalledWith(body);
    expect(res.body).toMatchObject({
      ok: true,
      data: {
        prepGuidance: "Focus on reliability leadership.",
        recommendedStoryIds: ["story-1"],
      },
    });
  });

  it("rejects payloads missing required job identity fields", async () => {
    const res = await invokeGenerate({ employer: "Acme Labs" });

    expect(res.statusCode).toBe(400);
    expect(generateInterviewPrepMock).not.toHaveBeenCalled();
  });
});
