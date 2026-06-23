import { describe, expect, it, vi, beforeEach } from "vitest";
import { toAppError } from "@server/infra/errors";
import { fail } from "@server/infra/http";
import { batchRouter } from "./batch";

const { batchGenerateCoverLettersMock, batchScoreJobsMock } = vi.hoisted(() => ({
  batchGenerateCoverLettersMock: vi.fn(),
  batchScoreJobsMock: vi.fn(),
}));

vi.mock("@server/services/batch", () => ({
  batchGenerateCoverLetters: batchGenerateCoverLettersMock,
  batchScoreJobs: batchScoreJobsMock,
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
  method: "post";
  path: string;
  body?: unknown;
}) {
  const layer = (batchRouter.stack as Array<any>).find(
    (entry: any) =>
      "route" in entry &&
      entry.route?.path === args.path &&
      entry.route.methods?.[args.method] === true,
  );

  if (!layer?.route?.stack[0]?.handle) {
    throw new Error(`Route not found for ${args.method.toUpperCase()} ${args.path}`);
  }

  const req = { body: args.body ?? {} };
  const res = createMockResponse();

  try {
    await layer.route.stack[0].handle(req as never, res as never, vi.fn());
  } catch (error) {
    fail(res as never, toAppError(error));
  }

  return res;
}

describe("Batch API routes", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    batchScoreJobsMock.mockResolvedValue([
      { jobId: "job-1", title: "Role", employer: "Acme", score: 91, reason: "Strong fit" },
    ]);
    batchGenerateCoverLettersMock.mockResolvedValue([
      { jobId: "job-1", coverLetter: "Dear Hiring Manager", keywordsMirrored: ["reliability"] },
    ]);
  });

  it("scores multiple jobs", async () => {
    const res = await invokeRoute({
      method: "post",
      path: "/score",
      body: { jobIds: ["job-1"], profile: { headline: "Staff engineer" } },
    });

    expect(batchScoreJobsMock).toHaveBeenCalledWith(["job-1"], {
      headline: "Staff engineer",
    });
    expect(res.body).toMatchObject({
      ok: true,
      data: { results: [expect.objectContaining({ jobId: "job-1", score: 91 })] },
    });
  });

  it("generates multiple cover letters", async () => {
    const inputs = [
      {
        jobId: "job-1",
        jobTitle: "Platform Engineer",
        employer: "Acme",
        jobDescription: "Build reliable systems",
        resumeSummary: "Staff engineer",
      },
    ];
    const res = await invokeRoute({
      method: "post",
      path: "/cover-letters",
      body: { inputs },
    });

    expect(batchGenerateCoverLettersMock).toHaveBeenCalledWith(inputs);
    expect(res.body).toMatchObject({
      ok: true,
      data: { results: [expect.objectContaining({ jobId: "job-1" })] },
    });
  });

  it("rejects invalid batch payloads", async () => {
    const scoreRes = await invokeRoute({ method: "post", path: "/score", body: { jobIds: [] } });
    expect(scoreRes.statusCode).toBe(400);

    const coverLetterRes = await invokeRoute({
      method: "post",
      path: "/cover-letters",
      body: { inputs: [] },
    });
    expect(coverLetterRes.statusCode).toBe(400);
  });
});
