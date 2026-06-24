import { describe, expect, it } from "vitest";
import { getFollowUpCadence } from "./follow-up-cadence";

describe("getFollowUpCadence", () => {
  it("marks applied jobs older than 7 days as overdue", () => {
    const result = getFollowUpCadence(
      {
        status: "applied",
        appliedAt: Date.UTC(2026, 5, 1),
        lastFollowUpAt: null,
        followUpCount: 0,
      },
      Date.UTC(2026, 5, 10),
    );

    expect(result.urgency).toBe("overdue");
    expect(result.daysSinceApplication).toBe(9);
    expect(result.nextFollowUpAt).toBeNull();
  });

  it("marks in-progress interview stages as urgent after one day", () => {
    const result = getFollowUpCadence(
      {
        status: "in_progress",
        stage: "technical_interview",
        appliedAt: Date.UTC(2026, 5, 1),
        lastActivityAt: Date.UTC(2026, 5, 8),
        lastFollowUpAt: null,
        followUpCount: 0,
      },
      Date.UTC(2026, 5, 10),
    );

    expect(result.urgency).toBe("urgent");
    expect(result.followUpReason).toContain("technical interview");
  });

  it("marks jobs with two follow-up drafts as cold", () => {
    const result = getFollowUpCadence(
      {
        status: "applied",
        appliedAt: Date.UTC(2026, 5, 1),
        lastFollowUpAt: Date.UTC(2026, 5, 8),
        followUpCount: 2,
      },
      Date.UTC(2026, 5, 10),
    );

    expect(result.urgency).toBe("cold");
    expect(result.nextFollowUpAt).toBeNull();
  });

  it("returns waiting when the follow-up window has not been reached", () => {
    const result = getFollowUpCadence(
      {
        status: "applied",
        appliedAt: Date.UTC(2026, 5, 1),
        lastFollowUpAt: Date.UTC(2026, 5, 5),
        followUpCount: 1,
      },
      Date.UTC(2026, 5, 10),
    );

    expect(result.urgency).toBe("waiting");
    expect(result.nextFollowUpAt).toBe(Date.UTC(2026, 5, 12));
  });
});
