import { describe, expect, it } from "vitest";

import { analyzePatternAnalysis } from "./pattern-analysis";

function makeJob(overrides: {
  id: string;
  source: string;
  title?: string;
  employer?: string;
  jobDescription?: string | null;
  skills?: string | null;
  status:
    | "discovered"
    | "processing"
    | "ready"
    | "applied"
    | "in_progress"
    | "skipped"
    | "expired";
  outcome?:
    | "offer_accepted"
    | "offer_declined"
    | "rejected"
    | "withdrawn"
    | "no_response"
    | "ghosted"
    | null;
  suitabilityScore?: number | null;
}) {
  return {
    id: overrides.id,
    source: overrides.source,
    title: overrides.title ?? `Role ${overrides.id}`,
    employer: overrides.employer ?? "Acme",
    jobDescription: overrides.jobDescription ?? null,
    skills: overrides.skills ?? null,
    status: overrides.status,
    outcome: overrides.outcome ?? null,
    suitabilityScore: overrides.suitabilityScore ?? null,
  };
}

describe("analyzePatternAnalysis", () => {
  it("returns insufficient_data when fewer than 5 jobs progressed", () => {
    const report = analyzePatternAnalysis([
      makeJob({ id: "1", source: "source-a", status: "applied" }),
      makeJob({ id: "2", source: "source-a", status: "in_progress" }),
      makeJob({ id: "3", source: "source-b", status: "applied" }),
      makeJob({ id: "4", source: "source-b", status: "ready" }),
      makeJob({ id: "5", source: "source-b", status: "discovered" }),
    ]);

    expect(report.status).toBe("insufficient_data");
    expect(report.metadata).toEqual({ total: 5, progressed: 3 });
    expect(report.scoreThreshold.recommendedMinimum).toBeNull();
    expect(report.scoreThreshold.reason).toContain("5 progressed applications");
    expect(report.recommendations[0]).toMatchObject({
      impact: "low",
      action: "Collect more application outcomes",
    });
  });

  it("computes conversion by source and recommends a score floor", () => {
    const report = analyzePatternAnalysis([
      makeJob({
        id: "1",
        source: "source-a",
        status: "applied",
        outcome: "offer_accepted",
        suitabilityScore: 60,
      }),
      makeJob({
        id: "2",
        source: "source-a",
        status: "in_progress",
        outcome: "offer_declined",
        suitabilityScore: 70,
      }),
      makeJob({
        id: "3",
        source: "source-a",
        status: "applied",
        outcome: "rejected",
        suitabilityScore: 50,
      }),
      makeJob({
        id: "4",
        source: "source-b",
        status: "applied",
        outcome: "rejected",
        suitabilityScore: 55,
      }),
      makeJob({
        id: "5",
        source: "source-b",
        status: "in_progress",
        outcome: "offer_accepted",
        suitabilityScore: 80,
      }),
      makeJob({
        id: "6",
        source: "source-b",
        status: "applied",
        outcome: "rejected",
        suitabilityScore: 65,
      }),
      makeJob({ id: "7", source: "source-b", status: "ready" }),
      makeJob({ id: "8", source: "source-a", status: "discovered" }),
    ]);

    expect(report.status).toBe("ok");
    expect(report.metadata).toEqual({ total: 8, progressed: 6 });
    expect(report.funnel).toEqual([
      { stage: "All applications", count: 8 },
      { stage: "Progressed applications", count: 6 },
      { stage: "Positive outcomes", count: 3 },
      { stage: "Accepted offers", count: 2 },
    ]);
    expect(report.sourceBreakdown).toEqual([
      {
        source: "source-a",
        total: 3,
        positive: 2,
        conversionRate: 66.7,
      },
      {
        source: "source-b",
        total: 3,
        positive: 1,
        conversionRate: 33.3,
      },
    ]);
    expect(report.scoreThreshold.recommendedMinimum).toBe(70);
    expect(report.scoreThreshold.reason).toContain(
      "median positive suitability score",
    );
    expect(report.recommendations).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          impact: "medium",
          action: "Raise the minimum suitability score floor to 70",
        }),
      ]),
    );
  });

  it("analyzes demand against resume sections and recommends missing learning resources", () => {
    const report = analyzePatternAnalysis(
      [
        makeJob({
          id: "frontend-platform",
          source: "manual",
          title: "Frontend Platform Engineer",
          employer: "DesignCo",
          status: "ready",
          jobDescription:
            "Build React and TypeScript UI systems with accessibility, testing, and Kubernetes deployment awareness.",
          skills: JSON.stringify([
            "React",
            "TypeScript",
            "Kubernetes",
            "Accessibility",
          ]),
        }),
        makeJob({
          id: "cloud-tools",
          source: "manual",
          title: "Cloud Tools Engineer",
          employer: "InfraCo",
          status: "ready",
          jobDescription:
            "Own Docker, Kubernetes, AWS, CI/CD, and observability for internal developer tools.",
          skills: "Docker, Kubernetes, AWS, CI/CD, Observability",
        }),
      ],
      {
        basics: {
          summary:
            "Frontend engineer focused on React and TypeScript product work.",
        },
        sections: {
          skills: {
            items: [
              {
                id: "react",
                name: "React",
                description: "UI systems",
                level: 5,
                keywords: ["TypeScript"],
                visible: true,
              },
            ],
          },
          projects: {
            items: [
              {
                id: "design-system",
                name: "Design System",
                description: "React component library",
                date: "2025",
                summary: "Built reusable React components.",
                visible: true,
              },
            ],
          },
        },
      },
    );

    expect(report.profileStatus).toBe("available");
    expect(report.cvSectionDemand).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          section: "skills",
          demandedTerms: expect.arrayContaining([
            expect.objectContaining({ term: "kubernetes", demandCount: 2 }),
            expect.objectContaining({ term: "aws", demandCount: 1 }),
          ]),
          missingTerms: expect.arrayContaining(["kubernetes", "aws"]),
        }),
        expect.objectContaining({
          section: "projects",
          missingTerms: expect.arrayContaining(["kubernetes"]),
        }),
      ]),
    );
    expect(report.topKnowledgeGaps[0]).toMatchObject({
      term: "kubernetes",
      demandCount: 2,
      recommendedResources: expect.arrayContaining([
        expect.objectContaining({
          title: expect.stringMatching(/kubernetes/i),
          url: expect.stringContaining("github.com"),
        }),
      ]),
      projectIdeas: expect.arrayContaining([expect.stringMatching(/deploy/i)]),
    });
  });

  it("builds per-job knowledge gap recommendations", () => {
    const report = analyzePatternAnalysis(
      [
        makeJob({
          id: "ml-platform",
          source: "manual",
          title: "ML Platform Engineer",
          employer: "ModelCo",
          status: "ready",
          jobDescription:
            "Use Python, Docker, Kubernetes, and observability to ship machine learning services.",
        }),
      ],
      {
        sections: {
          skills: {
            items: [
              {
                id: "python",
                name: "Python",
                description: "Automation",
                level: 4,
                keywords: [],
                visible: true,
              },
            ],
          },
        },
      },
    );

    expect(report.jobKnowledgeGaps).toEqual([
      expect.objectContaining({
        jobId: "ml-platform",
        title: "ML Platform Engineer",
        employer: "ModelCo",
        missingTerms: [
          "docker",
          "kubernetes",
          "observability",
          "machine learning",
        ],
        recommendedResources: expect.arrayContaining([
          expect.objectContaining({
            url: expect.stringContaining("github.com"),
          }),
        ]),
        projectIdeas: expect.arrayContaining([
          expect.stringMatching(/ML|machine learning|service/i),
        ]),
      }),
    ]);
  });
});
