import { describe, expect, it } from "vitest";
import { evaluateOffer } from "./offer-evaluation";

describe("offer evaluation service", () => {
  it("accepts a strong offer that exceeds the target", () => {
    const result = evaluateOffer({
      jobTitle: "Backend Engineer",
      employer: "Acme Labs",
      salaryTarget: "$140,000",
      offeredSalary: "$152,000",
      benefits: "remote, equity, bonus",
      dealBreakers: [],
    });

    expect(result.recommendation).toBe("accept");
    expect(result.score).toBeGreaterThanOrEqual(85);
    expect(result.risks.length).toBeGreaterThan(0);
    expect(result.tradeoffs.length).toBeGreaterThan(0);
    expect(result.negotiationAngle).toMatch(/accept|celebrate/i);
  });

  it("recommends negotiating when the offer is close but not quite there", () => {
    const result = evaluateOffer({
      jobTitle: "Frontend Engineer",
      employer: "Northwind",
      salaryTarget: "$150,000",
      offeredSalary: "$138,000",
      benefits: "hybrid schedule, equity",
      competingOffers: "One other offer around $145,000",
      dealBreakers: ["must stay remote"],
    });

    expect(result.recommendation).toBe("negotiate");
    expect(result.score).toBeGreaterThanOrEqual(60);
    expect(result.score).toBeLessThan(85);
    expect(result.risks.join(" ")).toMatch(/remote|competing/i);
    expect(result.tradeoffs.join(" ")).toMatch(/equity|hybrid|cash/i);
    expect(result.negotiationAngle).toMatch(/negotiate|ask/i);
  });

  it("rejects an offer that is far below target and has hard tradeoffs", () => {
    const result = evaluateOffer({
      jobTitle: "Staff Engineer",
      employer: "Globex",
      salaryTarget: "$180,000",
      offeredSalary: "$120,000",
      dealBreakers: ["compensation floor", "must be remote"],
    });

    expect(result.recommendation).toBe("reject");
    expect(result.score).toBeLessThan(50);
    expect(result.risks.join(" ")).toMatch(/floor|remote|below/i);
    expect(result.negotiationAngle).toMatch(/walk|decline|counter/i);
  });

  it("holds when the offer cannot be evaluated with enough salary data", () => {
    const result = evaluateOffer({
      jobTitle: "Product Designer",
      employer: "Initech",
      benefits: "generous PTO",
    });

    expect(result.recommendation).toBe("hold");
    expect(result.score).toBeLessThanOrEqual(60);
    expect(result.risks.join(" ")).toMatch(/enough|missing|data/i);
    expect(result.negotiationAngle).toMatch(/clarify|collect|compare/i);
  });
});
