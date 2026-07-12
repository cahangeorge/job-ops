import { buildDefaultReactiveResumeDocument } from "@server/services/rxresume/document";
import type { Job } from "@shared/types";
import { beforeEach, describe, expect, it, vi } from "vitest";

const repo = vi.hoisted(() => ({ getJobById: vi.fn() }));
const stories = vi.hoisted(() => ({ getInterviewStoryById: vi.fn() }));
const designResume = vi.hoisted(() => ({
  requireCurrentDesignResume: vi.fn(),
  updateCurrentDesignResume: vi.fn(),
}));

vi.mock("@server/repositories/jobs", () => repo);
vi.mock("@server/repositories/interview-stories", () => stories);
vi.mock("@server/services/design-resume", () => designResume);

import {
  applyTailoredCvCandidate,
  designResumeV5Template,
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
    sourceMode: "v5",
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
    stories.getInterviewStoryById.mockResolvedValue(null);
  });

  it("rejects a stale candidate with the Resume Studio conflict contract", async () => {
    const candidate = await previewTailoredCvCandidate(job.id, {
      storyIds: [],
      template: designResumeV5Template,
    });
    designResume.requireCurrentDesignResume.mockResolvedValue(
      makeDesignResume(8),
    );

    await expect(
      applyTailoredCvCandidate({ jobId: job.id, candidate }),
    ).rejects.toMatchObject({ status: 409, code: "CONFLICT" });
    expect(designResume.updateCurrentDesignResume).not.toHaveBeenCalled();
  });

  it("passes the previewed job version into the atomic resume update", async () => {
    const candidate = await previewTailoredCvCandidate(job.id, {
      storyIds: [],
      template: designResumeV5Template,
    });

    await applyTailoredCvCandidate({ jobId: job.id, candidate });

    expect(designResume.updateCurrentDesignResume).toHaveBeenCalledWith(
      expect.objectContaining({
        expectedJob: { id: job.id, updatedAt: job.updatedAt },
      }),
    );
  });

  it("applies the proof points rendered in the preview without duplication", async () => {
    const story = {
      id: "7d7b1744-4e0f-4174-9d30-31d85d66f5b9",
      tenantId: "tenant-1",
      title: "Scaled API",
      situation: "Traffic grew",
      task: "Keep latency low",
      action: "Added caching",
      result: "Latency fell",
      reflection: null,
      skills: null,
      tags: null,
      isMasterStory: false,
      createdAt: "2026-07-01T00:00:00.000Z",
      updatedAt: "2026-07-01T00:00:00.000Z",
    };
    stories.getInterviewStoryById.mockResolvedValue(story);

    const candidate = await previewTailoredCvCandidate(job.id, {
      storyIds: [story.id],
      template: designResumeV5Template,
    });
    await applyTailoredCvCandidate({ jobId: job.id, candidate });

    const appliedDocument =
      designResume.updateCurrentDesignResume.mock.calls[0]?.[0].document;
    expect(candidate.resumeJson.summary.content).toBe(
      "Tailored summary<p><strong>Selected proof points</strong></p><ul><li>Scaled API — Added caching — Latency fell</li></ul>",
    );
    expect(appliedDocument.summary.content).toBe(
      candidate.resumeJson.summary.content,
    );
  });

  it("does not resolve a Design Resume after a cross-tenant job lookup misses", async () => {
    repo.getJobById.mockResolvedValue(null);

    await expect(
      previewTailoredCvCandidate("other-tenant-job", {
        storyIds: [],
        template: designResumeV5Template,
      }),
    ).rejects.toMatchObject({
      status: 404,
      code: "NOT_FOUND",
    });
    expect(designResume.requireCurrentDesignResume).not.toHaveBeenCalled();
  });

  it("rejects unknown or foreign Story Bank proof points before preview", async () => {
    await expect(
      previewTailoredCvCandidate(job.id, {
        storyIds: ["7d7b1744-4e0f-4174-9d30-31d85d66f5b9"],
        template: designResumeV5Template,
      }),
    ).rejects.toMatchObject({ status: 400, code: "INVALID_REQUEST" });
  });

  it("rejects a candidate whose selected proof point changes after preview", async () => {
    const story = {
      id: "7d7b1744-4e0f-4174-9d30-31d85d66f5b9",
      tenantId: "tenant-1",
      title: "Scaled API",
      situation: "Traffic grew",
      task: "Keep latency low",
      action: "Added caching",
      result: "Latency fell",
      reflection: null,
      skills: null,
      tags: null,
      isMasterStory: false,
      createdAt: "2026-07-01T00:00:00.000Z",
      updatedAt: "2026-07-01T00:00:00.000Z",
    };
    stories.getInterviewStoryById.mockResolvedValue(story);
    const candidate = await previewTailoredCvCandidate(job.id, {
      storyIds: [story.id],
      template: designResumeV5Template,
    });
    stories.getInterviewStoryById.mockResolvedValue({
      ...story,
      result: "Latency fell by 80%",
      updatedAt: "2026-07-02T00:00:00.000Z",
    });

    await expect(
      applyTailoredCvCandidate({ jobId: job.id, candidate }),
    ).rejects.toMatchObject({ status: 409, code: "CONFLICT" });
  });
});
