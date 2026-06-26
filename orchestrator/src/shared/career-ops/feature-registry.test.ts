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
      "offer-evaluation",
      "liveness-checker",
    ]);
  });

  it("lists only non-implemented source features for the coverage UI", () => {
    const missing = getCareerOpsMissingFeatures();

    expect(missing.length).toBeGreaterThan(0);
    expect(missing.every((feature) => feature.status !== "implemented")).toBe(
      true,
    );
    expect(missing.map((feature) => feature.id)).toEqual(
      expect.arrayContaining([
        "pipeline-tracker",
        "cv-generation",
        "story-bank",
        "profile-onboarding",
      ]),
    );
    expect(missing.map((feature) => feature.id)).not.toEqual(
      expect.arrayContaining([
        "liveness-checker",
        "follow-up-cadence",
        "pattern-analysis",
        "offer-evaluation",
        "batch-processing",
        "portal-scanner",
      ]),
    );
  });

  it("does not keep missingReason or nextStep on implemented features", () => {
    const implemented = CAREER_OPS_FEATURES.filter(
      (feature) => feature.status === "implemented",
    );

    expect(implemented).not.toEqual(
      expect.arrayContaining([
        expect.objectContaining({ missingReason: expect.any(String) }),
      ]),
    );
    expect(implemented).not.toEqual(
      expect.arrayContaining([
        expect.objectContaining({ nextStep: expect.any(String) }),
      ]),
    );
  });

  it("marks ported CareerOps surfaces with their current status and location", () => {
    expect(CAREER_OPS_FEATURES).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          id: "portal-scanner",
          status: "implemented",
          description: expect.stringContaining(
            "import selected results as JobOps jobs",
          ),
        }),
        expect.objectContaining({
          id: "story-bank",
          status: "partial",
          surface: "standalone-page",
          jobOpsPath: "orchestrator/src/client/pages/StoryBankPage.tsx",
        }),
        expect.objectContaining({
          id: "interview-prep",
          status: "implemented",
          surface: "job-detail-panel",
          jobOpsPath:
            "orchestrator/src/client/pages/job-page/InterviewPrepPanel.tsx",
        }),
        expect.objectContaining({
          id: "follow-up-cadence",
          status: "implemented",
          surface: "tracking-workflow",
          jobOpsPath: "orchestrator/src/server/services/follow-up-cadence.ts",
        }),
        expect.objectContaining({
          id: "pattern-analysis",
          status: "implemented",
          surface: "standalone-page",
          jobOpsPath: "orchestrator/src/client/pages/PatternAnalysisPage.tsx",
        }),
        expect.objectContaining({
          id: "batch-processing",
          status: "implemented",
          surface: "job-list-action",
          jobOpsPath:
            "orchestrator/src/client/pages/orchestrator/FloatingJobActionsBar.tsx",
        }),
        expect.objectContaining({
          id: "offer-evaluation",
          status: "implemented",
          surface: "job-page-action",
          jobOpsPath: "orchestrator/src/server/api/routes/offer-evaluation.ts",
        }),
      ]),
    );
  });
});
