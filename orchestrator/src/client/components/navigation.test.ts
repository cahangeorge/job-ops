import { describe, expect, it } from "vitest";
import { isNavActive, NAV_LINKS } from "./navigation";

describe("navigation", () => {
  it("includes CareerOps and Story Bank pages in the main navigation", () => {
    expect(NAV_LINKS).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          to: "/career-ops",
          label: "CareerOps Coverage",
        }),
        expect.objectContaining({
          to: "/story-bank",
          label: "Story Bank",
        }),
      ]),
    );
  });

  it("marks CareerOps coverage and Story Bank paths as active", () => {
    const careerOpsLink = NAV_LINKS.find((item) => item.to === "/career-ops");
    const storyBankLink = NAV_LINKS.find((item) => item.to === "/story-bank");

    expect(careerOpsLink).toBeDefined();
    expect(
      isNavActive(
        "/career-ops",
        careerOpsLink?.to ?? "",
        careerOpsLink?.activePaths,
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
