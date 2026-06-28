import { renderWithQueryClient } from "@client/test/renderWithQueryClient";
import { screen, waitFor } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("@client/api", () => ({
  getPatternAnalysis: vi.fn(),
}));

import { getPatternAnalysis } from "@client/api";
import { PatternAnalysisPage } from "./PatternAnalysisPage";

describe("PatternAnalysisPage", () => {
  beforeEach(() => {
    vi.mocked(getPatternAnalysis).mockResolvedValue({
      status: "ok",
      metadata: { total: 8, progressed: 6 },
      funnel: [
        { stage: "All applications", count: 8 },
        { stage: "Progressed applications", count: 6 },
        { stage: "Positive outcomes", count: 3 },
        { stage: "Accepted offers", count: 1 },
      ],
      sourceBreakdown: [
        {
          source: "source-a",
          total: 3,
          positive: 2,
          conversionRate: 66.7,
        },
        {
          source: "source-b",
          total: 3,
          positive: 1,
          conversionRate: 33.3,
        },
      ],
      scoreThreshold: {
        recommendedMinimum: 70,
        reason: "Median positive suitability score: 70",
      },
      recommendations: [
        {
          impact: "medium",
          action: "Raise the minimum suitability score floor to 70",
          reason: "Positive outcomes cluster at or above 70.",
        },
      ],
    });
  });

  it("renders the pattern analysis report", async () => {
    renderWithQueryClient(
      <MemoryRouter>
        <PatternAnalysisPage />
      </MemoryRouter>,
    );

    expect(screen.getByText("Pattern Analysis")).toBeInTheDocument();
    await waitFor(() =>
      expect(screen.getByText("Progressed applications")).toBeInTheDocument(),
    );
    expect(screen.getByText("source-a")).toBeInTheDocument();
    expect(
      screen.getByText(/Raise the minimum suitability score floor to 70/i),
    ).toBeInTheDocument();
  });

  it("shows the insufficient-data message when the report is not ready", async () => {
    vi.mocked(getPatternAnalysis).mockResolvedValueOnce({
      status: "insufficient_data",
      metadata: { total: 4, progressed: 4 },
      funnel: [{ stage: "Progressed applications", count: 4 }],
      sourceBreakdown: [],
      scoreThreshold: {
        recommendedMinimum: null,
        reason:
          "Need at least 5 progressed applications to estimate a score floor.",
      },
      recommendations: [
        {
          impact: "low",
          action: "Collect more application outcomes",
          reason:
            "The current sample is too small for a reliable recommendation.",
        },
      ],
    });

    renderWithQueryClient(
      <MemoryRouter>
        <PatternAnalysisPage />
      </MemoryRouter>,
    );

    expect(
      await screen.findByText(/Need at least 5 progressed applications/i),
    ).toBeInTheDocument();
    expect(
      screen.getByText(/Collect more application outcomes/i),
    ).toBeInTheDocument();
  });
});
