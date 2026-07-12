import { describe, expect, it } from "vitest";
import { aggregateOutcomeLearning } from "./outcome-learning";

describe("aggregateOutcomeLearning", () => {
  it("returns stable descriptive competency aggregates for positive and negative outcomes", () => {
    const report = aggregateOutcomeLearning({
      tenantId: "tenant-a",
      smallSampleThreshold: 2,
      records: [
        {
          tenantId: "tenant-a",
          competencyId: "comp-communication",
          competencyName: "Communication",
          sourceType: "stage_event",
          sourceId: "event-1",
          sourceVersion: "1",
          sourceRevision: "",
          extractionMethod: "manual",
          confidence: 0.9,
          evidenceHash: "a".repeat(64),
          stage: "interview",
          outcome: "offer_accepted",
        },
        {
          tenantId: "tenant-a",
          competencyId: "comp-communication",
          competencyName: "Communication",
          sourceType: "stage_event",
          sourceId: "event-2",
          sourceVersion: "1",
          sourceRevision: "",
          extractionMethod: "manual",
          confidence: 0.8,
          evidenceHash: "b".repeat(64),
          stage: "interview",
          outcome: "rejected",
        },
        {
          tenantId: "tenant-other",
          competencyId: "comp-communication",
          competencyName: "Communication",
          sourceType: "stage_event",
          sourceId: "event-3",
          sourceVersion: "1",
          sourceRevision: "",
          extractionMethod: "manual",
          confidence: 0.9,
          evidenceHash: "c".repeat(64),
          stage: "interview",
          outcome: "offer_accepted",
        },
      ],
    });

    expect(report).toMatchObject({
      smallSampleThreshold: 2,
      competencies: [
        {
          competencyId: "comp-communication",
          competencyName: "Communication",
          sampleSize: 2,
          observations: [
            {
              stage: "interview",
              outcome: "offer_accepted",
              numerator: 1,
              denominator: 2,
              sampleSize: 2,
              observation: "descriptive",
            },
            {
              stage: "interview",
              outcome: "rejected",
              numerator: 1,
              denominator: 2,
              sampleSize: 2,
              observation: "descriptive",
            },
          ],
        },
      ],
    });
  });

  it("labels observations below the explicit small sample threshold as insufficient", () => {
    const report = aggregateOutcomeLearning({
      tenantId: "tenant-a",
      smallSampleThreshold: 3,
      records: [
        {
          tenantId: "tenant-a",
          competencyId: "comp-1",
          competencyName: "Systems thinking",
          sourceType: "stage_event",
          sourceId: "event-1",
          sourceVersion: "",
          sourceRevision: "",
          extractionMethod: "manual",
          confidence: 1,
          evidenceHash: "a".repeat(64),
          stage: "screen",
          outcome: "rejected",
        },
      ],
    });

    expect(report.competencies[0]?.observations[0]).toMatchObject({
      numerator: 1,
      denominator: 1,
      sampleSize: 1,
      observation: "insufficient_sample",
    });
  });
});
