import { createJob } from "@shared/testing/factories.js";
import { describe, expect, it } from "vitest";
import {
  derivePortalOrgSlug,
  inferPortalFromJob,
} from "./career-ops-quick-actions";

describe("career-ops-quick-actions helpers", () => {
  it("infers Greenhouse portal slugs from path-based boards", () => {
    const job = createJob({
      applicationLink: "https://job-boards.greenhouse.io/acme/jobs/123",
      employer: "Acme Labs",
    });

    expect(inferPortalFromJob(job)).toBe("greenhouse");
    expect(derivePortalOrgSlug(job)).toBe("acme");
  });

  it("infers Lever portal slugs from jobs.lever.co links", () => {
    const job = createJob({
      applicationLink: "https://jobs.lever.co/example-company/abcdef",
      employer: "Example Company",
    });

    expect(inferPortalFromJob(job)).toBe("lever");
    expect(derivePortalOrgSlug(job)).toBe("example-company");
  });

  it("falls back to employer-derived slugs when URL parsing is unavailable", () => {
    const job = createJob({
      applicationLink: null,
      jobUrl: "https://careers.example.com/backend-engineer",
      employer: "Acme Labs",
    });

    expect(inferPortalFromJob(job)).toBe(null);
    expect(derivePortalOrgSlug(job)).toBe("acme-labs");
  });
});
