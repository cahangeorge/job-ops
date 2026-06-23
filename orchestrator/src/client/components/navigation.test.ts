import { describe, expect, it } from "vitest";
import { isNavActive, NAV_LINKS } from "./navigation";

describe("navigation", () => {
  it("includes CareerOps coverage in the main navigation", () => {
    expect(NAV_LINKS).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          to: "/career-ops",
          label: "CareerOps Coverage",
        }),
      ]),
    );
  });

  it("marks CareerOps coverage paths as active", () => {
    const link = NAV_LINKS.find((item) => item.to === "/career-ops");

    expect(link).toBeDefined();
    expect(isNavActive("/career-ops", link?.to ?? "", link?.activePaths)).toBe(
      true,
    );
  });
});
