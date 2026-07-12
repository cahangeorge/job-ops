import { describe, expect, it } from "vitest";
import {
  createTailoredCvPreviewRequest,
  MAX_TAILORED_CV_PROOF_POINTS,
  toggleTailoredCvProofPoint,
} from "./TailoringWorkspace";

describe("TailoringWorkspace proof-point preview request", () => {
  it("passes the selected Story Bank IDs with the explicit Design Resume v5 contract", () => {
    expect(
      createTailoredCvPreviewRequest([
        "b7d7b174-4e0f-4174-9d30-31d85d66f5b9",
        "a7d7b174-4e0f-4174-9d30-31d85d66f5b9",
      ]),
    ).toEqual({
      storyIds: [
        "a7d7b174-4e0f-4174-9d30-31d85d66f5b9",
        "b7d7b174-4e0f-4174-9d30-31d85d66f5b9",
      ],
      template: {
        id: "design-resume-v5",
        version: "5",
        variables: [
          "basics.headline",
          "summary.content",
          "sections.skills.items",
          "sections.projects.items",
        ],
      },
    });
  });

  it("keeps the picker within the API proof-point limit while allowing removal", () => {
    const selected = Array.from(
      { length: MAX_TAILORED_CV_PROOF_POINTS },
      (_, index) => `story-${index}`,
    );

    expect(toggleTailoredCvProofPoint(selected, "story-over-limit")).toEqual(
      selected,
    );
    expect(toggleTailoredCvProofPoint(selected, "story-0")).toEqual(
      selected.slice(1),
    );
  });
});
