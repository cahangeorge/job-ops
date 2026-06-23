import { describe, expect, it } from "vitest";
import {
  CAREER_OPS_FEATURES,
  getCareerOpsImplementedActionIds,
  getCareerOpsMissingFeatures,
} from "./feature-registry";

describe("CareerOps feature registry", () => {
  it("has unique feature ids", () => {
    const ids = CAREER_OPS_FEATURES.map((feature) => feature.id);

    expect(new Set(ids).size).toBe(ids.length);
  });

  it("exposes current implemented quick action ids", () => {
    expect(getCareerOpsImplementedActionIds()).toEqual([
      "ats",
      "cover-letter",
      "negotiation",
      "portal-scanner",
    ]);
  });

  it("lists missing or planned source features for the coverage UI", () => {
    const missing = getCareerOpsMissingFeatures();

    expect(missing.length).toBeGreaterThan(0);
    expect(missing.every((feature) => feature.status !== "implemented")).toBe(
      true,
    );
    expect(missing.map((feature) => feature.id)).toEqual(
      expect.arrayContaining([
        "interview-prep",
        "liveness-checker",
        "follow-up-cadence",
      ]),
    );
  });

  it("marks backend-only CareerOps ports as partial api-only features", () => {
    expect(CAREER_OPS_FEATURES).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          id: "story-bank",
          status: "partial",
          surface: "standalone-page",
          jobOpsPath: "orchestrator/src/client/pages/StoryBankPage.tsx",
        }),
        expect.objectContaining({
          id: "batch-processing",
          status: "partial",
          surface: "api-only",
          jobOpsPath: "orchestrator/src/server/api/routes/batch.ts",
        }),
      ]),
    );
  });
});
