import type { Job } from "@shared/types";
import { beforeEach, describe, expect, it, vi } from "vitest";

const { createJobMock, getJobByUrlMock } = vi.hoisted(() => ({
  createJobMock: vi.fn(),
  getJobByUrlMock: vi.fn(),
}));

vi.mock("@server/repositories/jobs", () => ({
  createJob: createJobMock,
  getJobByUrl: getJobByUrlMock,
}));

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

async function invokeRoute(body: unknown) {
  const layer = (portalScannerRouter.stack as Array<any>).find(
    (entry: any) =>
      "route" in entry &&
      entry.route?.path === "/import" &&
      entry.route.methods?.post === true,
  );

  if (!layer?.route?.stack[0]?.handle) {
    throw new Error("Route not found for POST /import");
  }

  const req = { body: body ?? {} };
  const res = createMockResponse();
  await layer.route.stack[0].handle(req as never, res as never, vi.fn());
  return res;
}

function createJobRecord(overrides: Partial<Job>): Job {
  return {
    id: overrides.id ?? "job-1",
    source: overrides.source ?? "career-ops:greenhouse",
    sourceJobId: overrides.sourceJobId ?? null,
    jobUrlDirect: overrides.jobUrlDirect ?? null,
    datePosted: overrides.datePosted ?? null,
    title: overrides.title ?? "Platform Engineer",
    employer: overrides.employer ?? "Acme Labs",
    employerUrl: overrides.employerUrl ?? null,
    jobUrl: overrides.jobUrl ?? "https://boards.greenhouse.io/acme/jobs/1",
    applicationLink: overrides.applicationLink ?? null,
    disciplines: overrides.disciplines ?? null,
    deadline: overrides.deadline ?? null,
    salary: overrides.salary ?? null,
    location: overrides.location ?? null,
    locationEvidence: overrides.locationEvidence ?? null,
    degreeRequired: overrides.degreeRequired ?? null,
    starting: overrides.starting ?? null,
    jobDescription: overrides.jobDescription ?? null,
    status: overrides.status ?? "discovered",
    outcome: overrides.outcome ?? null,
    closedAt: overrides.closedAt ?? null,
    suitabilityScore: overrides.suitabilityScore ?? null,
    suitabilityReason: overrides.suitabilityReason ?? null,
    jobBrief: overrides.jobBrief ?? null,
    tailoredSummary: overrides.tailoredSummary ?? null,
    tailoredHeadline: overrides.tailoredHeadline ?? null,
    tailoredSkills: overrides.tailoredSkills ?? null,
    selectedProjectIds: overrides.selectedProjectIds ?? null,
    pdfPath: overrides.pdfPath ?? null,
    pdfSource: overrides.pdfSource ?? null,
    pdfRegenerating: overrides.pdfRegenerating ?? false,
    pdfFreshness: overrides.pdfFreshness ?? "missing",
    pdfFingerprint: overrides.pdfFingerprint ?? null,
    pdfGeneratedAt: overrides.pdfGeneratedAt ?? null,
    tracerLinksEnabled: overrides.tracerLinksEnabled ?? false,
    sponsorMatchScore: overrides.sponsorMatchScore ?? null,
    sponsorMatchNames: overrides.sponsorMatchNames ?? null,
    postingLivenessStatus: overrides.postingLivenessStatus ?? "unknown",
    postingLivenessCheckedAt: overrides.postingLivenessCheckedAt ?? null,
    postingLivenessReason: overrides.postingLivenessReason ?? null,
    evaluationRoleSummary: overrides.evaluationRoleSummary ?? null,
    evaluationCvMatchScore: overrides.evaluationCvMatchScore ?? null,
    evaluationCvMatchReason: overrides.evaluationCvMatchReason ?? null,
    evaluationLevelStrategy: overrides.evaluationLevelStrategy ?? null,
    evaluationCompResearch: overrides.evaluationCompResearch ?? null,
    evaluationPersonalization: overrides.evaluationPersonalization ?? null,
    evaluationInterviewPrep: overrides.evaluationInterviewPrep ?? null,
    evaluationLegitimacyScore: overrides.evaluationLegitimacyScore ?? null,
    evaluationLegitimacyReason: overrides.evaluationLegitimacyReason ?? null,
    evaluationOverallGrade: overrides.evaluationOverallGrade ?? null,
    archetype: overrides.archetype ?? null,
    isGhostJob: overrides.isGhostJob ?? null,
    jobType: overrides.jobType ?? null,
    salarySource: overrides.salarySource ?? null,
    salaryInterval: overrides.salaryInterval ?? null,
    salaryMinAmount: overrides.salaryMinAmount ?? null,
    salaryMaxAmount: overrides.salaryMaxAmount ?? null,
    salaryCurrency: overrides.salaryCurrency ?? null,
    isRemote: overrides.isRemote ?? null,
    jobLevel: overrides.jobLevel ?? null,
    jobFunction: overrides.jobFunction ?? null,
    listingType: overrides.listingType ?? null,
    emails: overrides.emails ?? null,
    companyIndustry: overrides.companyIndustry ?? null,
    companyLogo: overrides.companyLogo ?? null,
    companyUrlDirect: overrides.companyUrlDirect ?? null,
    companyAddresses: overrides.companyAddresses ?? null,
    companyNumEmployees: overrides.companyNumEmployees ?? null,
    companyRevenue: overrides.companyRevenue ?? null,
    companyDescription: overrides.companyDescription ?? null,
    skills: overrides.skills ?? null,
    experienceRange: overrides.experienceRange ?? null,
    companyRating: overrides.companyRating ?? null,
    companyReviewsCount: overrides.companyReviewsCount ?? null,
    vacancyCount: overrides.vacancyCount ?? null,
    workFromHomeType: overrides.workFromHomeType ?? null,
    discoveredAt: overrides.discoveredAt ?? "2026-01-02T12:00:00.000Z",
    processedAt: overrides.processedAt ?? null,
    readyAt: overrides.readyAt ?? null,
    appliedAt: overrides.appliedAt ?? null,
    createdAt: overrides.createdAt ?? "2026-01-02T12:00:00.000Z",
    updatedAt: overrides.updatedAt ?? "2026-01-02T12:00:00.000Z",
  };
}

describe("portal scanner import route", () => {
  beforeEach(() => {
    vi.clearAllMocks();

    const existingJob = createJobRecord({
      id: "existing-job-1",
      jobUrl: "https://boards.greenhouse.io/acme/jobs/99",
      sourceJobId: "https://boards.greenhouse.io/acme/jobs/99",
    });
    const createdJobs = new Map<string, Job>();
    const existingJobs = new Map<string, Job>([
      [existingJob.jobUrl, existingJob],
    ]);

    getJobByUrlMock.mockImplementation(async (jobUrl: string) => {
      return createdJobs.get(jobUrl) ?? existingJobs.get(jobUrl) ?? null;
    });

    let nextId = 1;
    createJobMock.mockImplementation(async (input: Record<string, unknown>) => {
      const job = createJobRecord({
        id: `job-${nextId++}`,
        source: String(input.source ?? "career-ops:greenhouse"),
        sourceJobId: (input.sourceJobId as string | undefined) ?? null,
        title: String(input.title ?? ""),
        employer: String(input.employer ?? ""),
        jobUrl: String(input.jobUrl ?? ""),
        location: (input.location as string | undefined) ?? null,
        jobDescription: (input.jobDescription as string | undefined) ?? null,
      });
      createdJobs.set(job.jobUrl, job);
      return job;
    });
  });

  it("imports selected scan jobs and skips duplicates", async () => {
    const res = await invokeRoute({
      jobs: [
        {
          title: "Platform Engineer",
          employer: "Acme Labs",
          location: "Remote",
          url: "https://boards.greenhouse.io/acme/jobs/1",
          description: "Build platforms",
          portal: "greenhouse",
        },
        {
          title: "Site Reliability Engineer",
          employer: "Acme Labs",
          location: null,
          url: "https://boards.greenhouse.io/acme/jobs/99",
          description: null,
          portal: "greenhouse",
        },
        {
          title: "Platform Engineer",
          employer: "Acme Labs",
          location: "Remote",
          url: "https://boards.greenhouse.io/acme/jobs/1",
          description: "Build platforms",
          portal: "greenhouse",
        },
      ],
    });

    expect(res.statusCode).toBe(200);
    expect(res.body).toMatchObject({
      ok: true,
      data: {
        importedCount: 1,
        skippedDuplicatesCount: 2,
        jobIds: ["job-1"],
      },
    });
    expect(createJobMock).toHaveBeenCalledTimes(1);
    expect(createJobMock).toHaveBeenCalledWith(
      expect.objectContaining({
        source: "career-ops:greenhouse",
        sourceJobId: "https://boards.greenhouse.io/acme/jobs/1",
        title: "Platform Engineer",
        employer: "Acme Labs",
        jobUrl: "https://boards.greenhouse.io/acme/jobs/1",
        location: "Remote",
        jobDescription: "Build platforms",
      }),
    );
  });

  it("rejects malformed import payloads", async () => {
    const res = await invokeRoute({
      jobs: [
        {
          title: "Missing portal",
          employer: "Acme Labs",
          location: null,
          url: "https://boards.greenhouse.io/acme/jobs/2",
          description: null,
        },
      ],
    });

    expect(res.statusCode).toBe(400);
    expect(res.body).toMatchObject({
      ok: false,
      error: {
        code: "INVALID_REQUEST",
      },
    });
  });
});
