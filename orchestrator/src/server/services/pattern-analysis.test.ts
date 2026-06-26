import { describe, expect, it } from "vitest";

import { analyzePatternAnalysis } from "./pattern-analysis";

function makeJob(overrides: {
  id: string;
  source: string;
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
      { stage: "Accepted offers", count: 1 },
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
});
