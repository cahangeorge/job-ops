import { describe, expect, it } from "vitest";
import { isNavActive, NAV_LINKS } from "./navigation";

describe("navigation", () => {
  it("includes CareerOps, outcome learning, and Story Bank pages in the main navigation", () => {
    expect(NAV_LINKS).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          to: "/career-ops",
          label: "CareerOps Coverage",
        }),
        expect.objectContaining({
          to: "/outcome-learning",
          label: "Outcome Learning",
        }),
        expect.objectContaining({
          to: "/story-bank",
          label: "Story Bank",
        }),
      ]),
    );
  });

  it("marks CareerOps coverage, outcome learning, and Story Bank paths as active", () => {
    const careerOpsLink = NAV_LINKS.find((item) => item.to === "/career-ops");
    const outcomeLearningLink = NAV_LINKS.find(
      (item) => item.to === "/outcome-learning",
    );
    const storyBankLink = NAV_LINKS.find((item) => item.to === "/story-bank");

    expect(careerOpsLink).toBeDefined();
    expect(
      isNavActive(
        "/career-ops",
        careerOpsLink?.to ?? "",
        careerOpsLink?.activePaths,
      ),
    ).toBe(true);
    expect(outcomeLearningLink).toBeDefined();
    expect(
      isNavActive(
        "/outcome-learning",
        outcomeLearningLink?.to ?? "",
        outcomeLearningLink?.activePaths,
      ),
    ).toBe(true);
    expect(storyBankLink).toBeDefined();
    expect(
      isNavActive(
        "/story-bank",
        storyBankLink?.to ?? "",
        storyBankLink?.activePaths,
      ),
    ).toBe(true);
  });
});
