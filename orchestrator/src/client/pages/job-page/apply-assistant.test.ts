import { describe, expect, it } from "vitest";
import { buildApplyChecklistNote } from "./apply-assistant";

describe("buildApplyChecklistNote", () => {
  it("builds an application checklist with key context", () => {
    const note = buildApplyChecklistNote({
      job: {
        id: "job-1",
        title: "Senior Engineer",
        employer: "Acme",
        jobUrl: "https://example.com/job",
        applicationLink: null,
        suitabilityScore: 82,
        suitabilityReason: "Strong platform match",
      },
      coverLetter: "Dear Acme...",
    });

    expect(note.title).toBe("Apply checklist — Acme");
    expect(note.content).toContain("Senior Engineer");
    expect(note.content).toContain("Posting: https://example.com/job");
    expect(note.content).toContain("Score: 82/100");
    expect(note.content).toContain("Fit: Strong platform match");
    expect(note.content).toContain("- [ ] Submitted externally");
    expect(note.content).toContain("Dear Acme...");
  });

  it("falls back to the application link and placeholder cover letter text", () => {
    const note = buildApplyChecklistNote({
      job: {
        id: "job-2",
        title: "Platform Engineer",
        employer: "Globex",
        jobUrl: "https://example.com/job-2",
        applicationLink: "https://example.com/apply-2",
      },
    });

    expect(note.title).toBe("Apply checklist — Globex");
    expect(note.content).toContain("Posting: https://example.com/apply-2");
    expect(note.content).toContain("No cover letter draft saved yet.");
  });
});
