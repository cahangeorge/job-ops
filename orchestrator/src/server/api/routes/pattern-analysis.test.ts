import { fail } from "@server/infra/http";
import { beforeEach, describe, expect, it, vi } from "vitest";

const analyzePatternAnalysisMock = vi.hoisted(() => vi.fn());
const getJobListItemsMock = vi.hoisted(() => vi.fn());
const getProfileMock = vi.hoisted(() => vi.fn());

vi.mock("@server/services/pattern-analysis", () => ({
  analyzePatternAnalysis: analyzePatternAnalysisMock,
}));

vi.mock("@server/repositories/jobs", () => ({
  getJobListItems: getJobListItemsMock,
}));

vi.mock("@server/services/profile", () => ({
  getProfile: getProfileMock,
}));

import { patternAnalysisRouter } from "./pattern-analysis";

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

async function invokeGet(path: string) {
  const layer = (patternAnalysisRouter.stack as Array<any>).find(
    (entry: any) =>
      "route" in entry &&
      entry.route?.path === path &&
      entry.route.methods?.get === true,
  );

  if (!layer?.route?.stack[0]?.handle) {
    throw new Error(`Route not found for GET ${path}`);
  }

  const req = { body: {}, params: {}, query: {} };
  const res = createMockResponse();

  try {
    await layer.route.stack[0].handle(req as never, res as never, vi.fn());
  } catch (error) {
    fail(res as never, error as never);
  }

  return res;
}

describe("pattern analysis API routes", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("returns the service output from the pattern analysis route", async () => {
    const profile = { basics: { summary: "React developer" } };
    getProfileMock.mockResolvedValue(profile);
    getJobListItemsMock.mockResolvedValue([
      {
        id: "job-1",
        source: "source-a",
        status: "applied",
        outcome: "offer_accepted",
        suitabilityScore: 80,
      },
    ]);
    analyzePatternAnalysisMock.mockReturnValue({
      status: "ok",
      profileStatus: "available",
      metadata: { total: 1, progressed: 1 },
      funnel: [{ stage: "All applications", count: 1 }],
      sourceBreakdown: [
        { source: "source-a", total: 1, positive: 1, conversionRate: 100 },
      ],
      scoreThreshold: {
        recommendedMinimum: 80,
        reason: "Median positive suitability score: 80",
      },
      recommendations: [
        {
          impact: "medium",
          action: "Raise the minimum suitability score floor to 80",
          reason: "Positive outcomes cluster at or above 80.",
        },
      ],
      cvSectionDemand: [],
      topKnowledgeGaps: [],
      jobKnowledgeGaps: [],
    });

    const res = await invokeGet("/");

    expect(res.statusCode).toBe(200);
    expect(getJobListItemsMock).toHaveBeenCalledOnce();
    expect(getProfileMock).toHaveBeenCalledOnce();
    expect(analyzePatternAnalysisMock).toHaveBeenCalledWith(
      [
        expect.objectContaining({
          id: "job-1",
          source: "source-a",
          status: "applied",
        }),
      ],
      profile,
    );
    expect(res.body).toMatchObject({
      ok: true,
      data: {
        status: "ok",
        profileStatus: "available",
        metadata: { total: 1, progressed: 1 },
      },
    });
  });
});
