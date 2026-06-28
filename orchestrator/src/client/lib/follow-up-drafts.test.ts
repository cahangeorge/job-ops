import { describe, expect, it } from "vitest";
import { buildFollowUpDraft } from "./follow-up-drafts";

describe("buildFollowUpDraft", () => {
  it("includes the employer and role in the deterministic draft", () => {
    const draft = buildFollowUpDraft({
      employer: "Acme",
      title: "Engineer",
      daysSinceApplication: 8,
      urgency: "overdue",
    });

    expect(draft.title).toContain("Follow-up draft");
    expect(draft.content).toContain("Acme");
    expect(draft.content).toContain("Engineer");
    expect(draft.content).toContain("8 days ago");
  });
});
