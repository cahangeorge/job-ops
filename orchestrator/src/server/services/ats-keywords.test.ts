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

import { analyzeAtsKeywords } from "./ats-keywords";

describe("analyzeAtsKeywords", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    resolveLlmModelMock.mockResolvedValue("gpt-4.1-mini");
    createConfiguredLlmServiceMock.mockResolvedValue({
      callJson: callJsonMock,
    });
  });

  it("passes a strict keywordDensity item schema to structured output", async () => {
    callJsonMock.mockResolvedValue({
      success: true,
      data: {
        requiredKeywords: ["kubernetes"],
        preferredKeywords: ["typescript"],
        missingKeywords: ["terraform"],
        keywordDensity: [{ keyword: "kubernetes", count: 2 }],
        optimizedSummary: "Optimized summary.",
      },
    });

    await analyzeAtsKeywords({
      jobDescription: "Need kubernetes and terraform experience.",
      resumeText: "Built distributed systems in TypeScript.",
    });

    expect(callJsonMock).toHaveBeenCalledWith(
      expect.objectContaining({
        model: "gpt-4.1-mini",
        jsonSchema: expect.objectContaining({
          schema: expect.objectContaining({
            properties: expect.objectContaining({
              keywordDensity: expect.objectContaining({
                items: expect.objectContaining({
                  type: "object",
                  required: ["keyword", "count"],
                  additionalProperties: false,
                }),
              }),
            }),
          }),
        }),
      }),
    );
  });
});
