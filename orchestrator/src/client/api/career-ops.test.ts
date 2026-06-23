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
      .mockResolvedValueOnce(createJsonResponse(200, { ok: true, data: response }));

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
});
