import { beforeEach, describe, expect, it, vi } from "vitest";

const { callJsonMock, createConfiguredLlmServiceMock, resolveLlmModelMock } =
  vi.hoisted(() => ({
    callJsonMock: vi.fn(),
    createConfiguredLlmServiceMock: vi.fn(),
    resolveLlmModelMock: vi.fn(),
  }));

vi.mock("./modelSelection", () => ({
  createConfiguredLlmService: createConfiguredLlmServiceMock,
  resolveLlmModel: resolveLlmModelMock,
}));

import { generateInterviewPrep } from "./interview-prep";

const story = {
  id: "story-1",
  title: "Scale incident",
  situation: "Traffic spiked during launch.",
  task: "Keep the platform online.",
  action: "Added queue backpressure and scaled workers.",
  result: "Error rate dropped below 1%.",
  reflection: "Prepared runbooks earlier next time.",
  skills: "systems,incident-response",
  tags: "reliability,leadership",
  isMasterStory: true,
};

describe("generateInterviewPrep", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    resolveLlmModelMock.mockResolvedValue("gpt-4.1-mini");
    createConfiguredLlmServiceMock.mockResolvedValue({
      callJson: callJsonMock,
    });
    callJsonMock.mockResolvedValue({
      success: true,
      data: {
        prepGuidance:
          "Focus on incident leadership and distributed systems tradeoffs.",
        targetQuestions: [
          "Tell me about a production incident.",
          "How do you scale queue workers safely?",
        ],
        answerOutlines: [
          {
            question: "Tell me about a production incident.",
            outline: "Use Scale incident with STAR+R structure.",
            storyIds: ["story-1"],
          },
        ],
        recommendedStoryIds: ["story-1"],
        interviewerQuestions: ["What reliability metrics define success?"],
      },
    });
  });

  it("uses structured output to generate job-specific interview guidance from Story Bank entries", async () => {
    const result = await generateInterviewPrep({
      jobTitle: "Senior Platform Engineer",
      employer: "Acme Labs",
      jobDescription: "Own platform reliability and incident response.",
      resumeSummary: "Platform engineer with incident leadership experience.",
      evaluationInterviewPrep: "Expect distributed systems questions.",
      targetQuestions: "Tell me about a production incident.",
      stories: [story],
    });

    expect(resolveLlmModelMock).toHaveBeenCalledWith("default");
    expect(createConfiguredLlmServiceMock).toHaveBeenCalledWith("default");
    expect(callJsonMock).toHaveBeenCalledWith(
      expect.objectContaining({
        model: "gpt-4.1-mini",
        maxRetries: 1,
        jsonSchema: expect.objectContaining({
          name: "interview_prep",
          schema: expect.objectContaining({
            required: [
              "prepGuidance",
              "targetQuestions",
              "answerOutlines",
              "recommendedStoryIds",
              "interviewerQuestions",
            ],
            additionalProperties: false,
          }),
        }),
      }),
    );
    expect(callJsonMock.mock.calls[0]?.[0]?.messages[0]?.content).toContain(
      "Senior Platform Engineer at Acme Labs",
    );
    expect(callJsonMock.mock.calls[0]?.[0]?.messages[0]?.content).toContain(
      "Scale incident",
    );
    expect(result.recommendedStoryIds).toEqual(["story-1"]);
    expect(result.answerOutlines[0]?.storyIds).toEqual(["story-1"]);
  });
});
