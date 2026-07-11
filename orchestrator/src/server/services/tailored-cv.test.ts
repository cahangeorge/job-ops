import { buildDefaultReactiveResumeDocument } from "@server/services/rxresume/document";
import type { Job } from "@shared/types";
import { beforeEach, describe, expect, it, vi } from "vitest";

const repo = vi.hoisted(() => ({ getJobById: vi.fn() }));
const designResume = vi.hoisted(() => ({
  requireCurrentDesignResume: vi.fn(),
  updateCurrentDesignResume: vi.fn(),
}));

vi.mock("@server/repositories/jobs", () => repo);
vi.mock("@server/services/design-resume", () => designResume);

import {
  applyTailoredCvCandidate,
  previewTailoredCvCandidate,
} from "./tailored-cv";

const job: Pick<
  Job,
  | "id"
  | "updatedAt"
  | "jobDescription"
  | "tailoredSummary"
  | "tailoredHeadline"
  | "tailoredSkills"
  | "selectedProjectIds"
> = {
  id: "job-1",
  updatedAt: "2026-07-11T10:00:00.000Z",
  jobDescription: "Build reliable TypeScript systems.",
  tailoredSummary: "Tailored summary",
  tailoredHeadline: "Platform Engineer",
  tailoredSkills: JSON.stringify([
    { name: "Backend", keywords: ["TypeScript", "Node.js"] },
  ]),
  selectedProjectIds: null,
};

function makeDesignResume(revision = 7) {
  return {
    id: "resume-primary",
    revision,
    resumeJson: buildDefaultReactiveResumeDocument(),
  };
}

describe("tailored CV service", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    repo.getJobById.mockResolvedValue(job);
    designResume.requireCurrentDesignResume.mockResolvedValue(
      makeDesignResume(),
    );
    designResume.updateCurrentDesignResume.mockResolvedValue({ revision: 8 });
  });

  it("rejects a stale candidate with the Resume Studio conflict contract", async () => {
    const candidate = await previewTailoredCvCandidate(job.id);
    designResume.requireCurrentDesignResume.mockResolvedValue(
      makeDesignResume(8),
    );

    await expect(
      applyTailoredCvCandidate({ jobId: job.id, candidate }),
    ).rejects.toMatchObject({ status: 409, code: "CONFLICT" });
    expect(designResume.updateCurrentDesignResume).not.toHaveBeenCalled();
  });

  it("passes the previewed job version into the atomic resume update", async () => {
    const candidate = await previewTailoredCvCandidate(job.id);

    await applyTailoredCvCandidate({ jobId: job.id, candidate });

    expect(designResume.updateCurrentDesignResume).toHaveBeenCalledWith(
      expect.objectContaining({
        expectedJob: { id: job.id, updatedAt: job.updatedAt },
      }),
    );
  });

  it("does not resolve a Design Resume after a cross-tenant job lookup misses", async () => {
    repo.getJobById.mockResolvedValue(null);

    await expect(
      previewTailoredCvCandidate("other-tenant-job"),
    ).rejects.toMatchObject({
      status: 404,
      code: "NOT_FOUND",
    });
    expect(designResume.requireCurrentDesignResume).not.toHaveBeenCalled();
  });
});
