import { beforeEach, describe, expect, it, vi } from "vitest";
import * as api from "./career-ops";

function createJsonResponse(status: number, payload: unknown): Response {
  return {
    ok: status >= 200 && status < 300,
    status,
    text: async () => JSON.stringify(payload),
    json: async () => payload,
  } as Response;
}

describe("CareerOps API client", () => {
  beforeEach(() => {
    vi.restoreAllMocks();
  });

  it("posts interview prep generation payloads", async () => {
    const response = {
      prepGuidance: "Focus on reliability leadership.",
      targetQuestions: ["Tell me about an incident."],
      answerOutlines: [
        {
          question: "Tell me about an incident.",
          outline: "Use Scale incident.",
          storyIds: ["story-1"],
        },
      ],
      recommendedStoryIds: ["story-1"],
      interviewerQuestions: ["How is reliability measured?"],
    };
    const fetchSpy = vi
      .spyOn(global, "fetch")
      .mockResolvedValueOnce(
        createJsonResponse(200, { ok: true, data: response }),
      );

    await expect(
      api.generateInterviewPrep({
        jobTitle: "Senior Platform Engineer",
        employer: "Acme Labs",
        stories: [{ id: "story-1", title: "Scale incident" }],
      }),
    ).resolves.toEqual(response);

    expect(fetchSpy).toHaveBeenCalledWith(
      "/api/interview-prep/generate",
      expect.objectContaining({
        method: "POST",
        body: JSON.stringify({
          jobTitle: "Senior Platform Engineer",
          employer: "Acme Labs",
          stories: [{ id: "story-1", title: "Scale incident" }],
        }),
      }),
    );
  });

  it("posts batch score payloads", async () => {
    const response = {
      results: [
        {
          jobId: "job-1",
          title: "Senior Platform Engineer",
          employer: "Acme Labs",
          score: 93,
          reason: "Strong infrastructure fit",
        },
      ],
    };
    const fetchSpy = vi
      .spyOn(global, "fetch")
      .mockResolvedValueOnce(
        createJsonResponse(200, { ok: true, data: response }),
      );

    await expect(
      api.batchScoreJobs({
        jobIds: ["job-1"],
        profile: { headline: "Staff engineer" },
      }),
    ).resolves.toEqual(response);

    expect(fetchSpy).toHaveBeenCalledWith(
      "/api/batch/score",
      expect.objectContaining({
        method: "POST",
        body: JSON.stringify({
          jobIds: ["job-1"],
          profile: { headline: "Staff engineer" },
        }),
      }),
    );
  });

  it("posts batch cover letter payloads", async () => {
    const response = {
      results: [
        {
          jobId: "job-1",
          coverLetter: "Dear Hiring Manager",
          keywordsMirrored: ["reliability"],
        },
      ],
    };
    const fetchSpy = vi
      .spyOn(global, "fetch")
      .mockResolvedValueOnce(
        createJsonResponse(200, { ok: true, data: response }),
      );

    const inputs = [
      {
        jobId: "job-1",
        jobTitle: "Senior Platform Engineer",
        employer: "Acme Labs",
        jobDescription: "Build reliable systems.",
        resumeSummary: "10 years in distributed systems.",
        tone: "formal" as const,
      },
    ];

    await expect(api.batchGenerateCoverLetters({ inputs })).resolves.toEqual(
      response,
    );

    expect(fetchSpy).toHaveBeenCalledWith(
      "/api/batch/cover-letters",
      expect.objectContaining({
        method: "POST",
        body: JSON.stringify({ inputs }),
      }),
    );
  });
});
