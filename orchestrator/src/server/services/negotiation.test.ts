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

import { generateNegotiationScripts } from "./negotiation";

describe("generateNegotiationScripts", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    resolveLlmModelMock.mockResolvedValue("gpt-4.1-mini");
    createConfiguredLlmServiceMock.mockResolvedValue({
      callJson: callJsonMock,
    });
  });

  it("passes a strict schema whose required array includes every declared property", async () => {
    callJsonMock.mockResolvedValue({
      success: true,
      data: {
        openingScript: "Thanks for the offer.",
        counterOfferScript: "I'd like to discuss compensation.",
        geographicDiscountPushback: "Scope should determine pay.",
        benefitsNegotiation: "Let's discuss equity and PTO.",
        competingOfferLeverage: "I am balancing another process.",
        timeline: "I can reply by Friday.",
      },
    });

    await generateNegotiationScripts({
      jobTitle: "Senior Backend Engineer",
      employer: "Acme Corp",
      location: "Remote",
    });

    expect(callJsonMock).toHaveBeenCalledWith(
      expect.objectContaining({
        model: "gpt-4.1-mini",
        jsonSchema: expect.objectContaining({
          schema: expect.objectContaining({
            required: [
              "openingScript",
              "counterOfferScript",
              "geographicDiscountPushback",
              "benefitsNegotiation",
              "competingOfferLeverage",
              "timeline",
            ],
            additionalProperties: false,
          }),
        }),
      }),
    );
  });
});
