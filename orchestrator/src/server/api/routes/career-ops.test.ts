import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { toAppError } from "@server/infra/errors";
import { fail } from "@server/infra/http";

const {
  analyzeAtsKeywordsMock,
  generateCoverLetterMock,
  generateNegotiationScriptsMock,
  scanCompanyPortalMock,
} = vi.hoisted(() => ({
  analyzeAtsKeywordsMock: vi.fn(),
  generateCoverLetterMock: vi.fn(),
  generateNegotiationScriptsMock: vi.fn(),
  scanCompanyPortalMock: vi.fn(),
}));

vi.mock("@server/services/ats-keywords", () => ({
  analyzeAtsKeywords: analyzeAtsKeywordsMock,
}));

vi.mock("@server/services/cover-letter", () => ({
  generateCoverLetter: generateCoverLetterMock,
}));

vi.mock("@server/services/negotiation", () => ({
  generateNegotiationScripts: generateNegotiationScriptsMock,
}));

vi.mock("@server/services/portal-scanner", () => ({
  scanCompanyPortal: scanCompanyPortalMock,
}));

import { atsRouter } from "./ats";
import { careerOpsRouter } from "./career-ops";
import { coverLetterRouter } from "./cover-letter";
import { negotiationRouter } from "./negotiation";
import { portalScannerRouter } from "./portal-scanner";

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
  router: typeof atsRouter;
  method: "get" | "post" | "patch" | "delete";
  path: string;
  body?: unknown;
  params?: Record<string, string>;
}) {
  const layer = (args.router.stack as Array<any>).find(
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

describe("Career Ops API routes", () => {
  beforeEach(() => {
    vi.clearAllMocks();

    analyzeAtsKeywordsMock.mockResolvedValue({
      requiredKeywords: ["k8s"],
      preferredKeywords: ["typescript"],
      missingKeywords: [],
      keywordDensity: [{ keyword: "k8s", count: 2 }],
      optimizedSummary: "Optimized summary.",
    });
    generateCoverLetterMock.mockResolvedValue({
      coverLetter: "Dear Hiring Manager",
      researchNotes: "Strong mission fit",
      keywordsMirrored: ["reliability"],
      tone: "formal",
      angle: "company_mission",
    });
    generateNegotiationScriptsMock.mockResolvedValue({
      openingScript: "Thanks for the offer.",
      counterOfferScript: "I would like to discuss compensation.",
      geographicDiscountPushback: "Scope should drive compensation.",
      benefitsNegotiation: "Let's discuss equity.",
      competingOfferLeverage: "I am balancing another offer.",
      timeline: "I can decide by Friday.",
    });
    scanCompanyPortalMock.mockResolvedValue({
      total: 3,
      filtered: 1,
      errors: [],
      jobs: [
        {
          id: "job-1",
          title: "Platform Engineer",
          employer: "Acme Corp",
          location: "Remote",
          department: "Infrastructure",
          url: "https://example.com/jobs/1",
          portal: "greenhouse",
          postedAt: "2026-01-02T12:00:00.000Z",
          description: "Build platform systems",
          employmentType: "Full-time",
          experienceLevel: "Senior",
          isRemote: true,
        },
      ],
    });
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("runs ATS analysis and returns the service result", async () => {
    const healthRes = await invokeRoute({
      router: careerOpsRouter,
      method: "get",
      path: "/health",
    });

    expect(healthRes.statusCode).toBe(200);
    expect((healthRes.body as { data: { available: boolean } }).data.available).toBe(true);

    const res = await invokeRoute({
      router: atsRouter,
      method: "post",
      path: "/analyze",
      body: {
        jobDescription: "Need kubernetes experience",
        resumeText: "Built k8s systems",
      },
    });

    expect(res.statusCode).toBe(200);
    expect(analyzeAtsKeywordsMock).toHaveBeenCalledWith({
      jobDescription: "Need kubernetes experience",
      resumeText: "Built k8s systems",
    });
    expect((res.body as { ok: boolean }).ok).toBe(true);
    expect((res.body as { data: { optimizedSummary: string } }).data.optimizedSummary).toBe(
      "Optimized summary.",
    );
  });

  it("validates ATS input", async () => {
    const res = await invokeRoute({
      router: atsRouter,
      method: "post",
      path: "/analyze",
      body: {
        jobDescription: "Need kubernetes experience",
      },
    });

    expect(res.statusCode).toBe(400);
    expect((res.body as { ok: boolean }).ok).toBe(false);
    expect((res.body as { error: { code: string } }).error.code).toBe(
      "INVALID_REQUEST",
    );
    expect((res.body as { error: { message: string } }).error.message).toBe(
      "jobDescription and resumeText are required",
    );
  });

  it("generates cover letters and negotiation scripts", async () => {
    const coverRes = await invokeRoute({
      router: coverLetterRouter,
      method: "post",
      path: "/generate",
      body: {
        jobTitle: "Senior Backend Engineer",
        employer: "Acme Corp",
        jobDescription: "Build reliable systems.",
        resumeSummary: "10 years in distributed systems.",
        tone: "formal",
        angle: "company_mission",
      },
    });

    expect(coverRes.statusCode).toBe(200);
    expect(generateCoverLetterMock).toHaveBeenCalledWith({
      jobTitle: "Senior Backend Engineer",
      employer: "Acme Corp",
      jobDescription: "Build reliable systems.",
      resumeSummary: "10 years in distributed systems.",
      companyResearch: undefined,
      tone: "formal",
      angle: "company_mission",
    });

    const negotiationRes = await invokeRoute({
      router: negotiationRouter,
      method: "post",
      path: "/generate",
      body: {
        jobTitle: "Staff Engineer",
        employer: "Acme Corp",
        location: "Berlin",
        offerSalary: "195000",
      },
    });

    expect(negotiationRes.statusCode).toBe(200);
    expect(generateNegotiationScriptsMock).toHaveBeenCalledWith({
      jobTitle: "Staff Engineer",
      employer: "Acme Corp",
      location: "Berlin",
      offerSalary: "195000",
    });
    expect(
      (negotiationRes.body as { data: { timeline: string } }).data.timeline,
    ).toBe("I can decide by Friday.");
  });

  it("validates supported portal values and delegates valid scans", async () => {
    const badRes = await invokeRoute({
      router: portalScannerRouter,
      method: "post",
      path: "/scan",
      body: {
        orgSlug: "acme",
        portal: "workday",
      },
    });

    expect(badRes.statusCode).toBe(400);
    expect((badRes.body as { error: { message: string } }).error.message).toBe(
      "portal must be one of: greenhouse, ashby, lever",
    );

    const goodRes = await invokeRoute({
      router: portalScannerRouter,
      method: "post",
      path: "/scan",
      body: {
        orgSlug: "acme",
        portal: "greenhouse",
        keywords: ["platform", "reliability"],
        departments: ["infrastructure"],
        excludeInternships: true,
      },
    });

    expect(goodRes.statusCode).toBe(200);
    expect(scanCompanyPortalMock).toHaveBeenCalledWith({
      orgSlug: "acme",
      portal: "greenhouse",
      keywords: ["platform", "reliability"],
      departments: ["infrastructure"],
      excludeInternships: true,
    });
    expect((goodRes.body as { data: { jobs: Array<{ title: string }> } }).data.jobs[0]?.title).toBe(
      "Platform Engineer",
    );
  });
});
