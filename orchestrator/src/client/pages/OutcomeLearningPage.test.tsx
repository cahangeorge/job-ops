import { renderWithQueryClient } from "@client/test/renderWithQueryClient";
import { screen } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("@client/api", () => ({
  getOutcomeLearning: vi.fn(),
}));

import { getOutcomeLearning } from "@client/api";
import { OutcomeLearningPage } from "./OutcomeLearningPage";

const report = {
  smallSampleThreshold: 5,
  competencies: [
    {
      competencyName: "Communication",
      sampleSize: 2,
      observations: [
        {
          stage: "interview",
          outcome: "offer_accepted",
          numerator: 1,
          denominator: 2,
          sampleSize: 2,
          observation: "insufficient_sample" as const,
        },
      ],
      evidenceSources: [
        {
          sourceType: "stage_event" as const,
          sourceId: "evidence-id-should-never-render",
          sourceVersion: "1",
          sourceRevision: "",
          extractionMethod: "manual" as const,
          confidence: 0.9,
          evidenceHash: "evidence-hash-should-never-render",
        },
      ],
    },
  ],
};

describe("OutcomeLearningPage", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("renders descriptive outcomes and safe provenance with a low-sample label", async () => {
    vi.mocked(getOutcomeLearning).mockResolvedValue(report);

    renderWithQueryClient(
      <MemoryRouter>
        <OutcomeLearningPage />
      </MemoryRouter>,
    );

    expect(
      await screen.findByRole("heading", { name: "Communication" }),
    ).toBeInTheDocument();
    expect(screen.getByText("Low sample")).toBeInTheDocument();
    expect(screen.getByText("1 / 2 · 50%")).toBeInTheDocument();
    expect(screen.getByText("stage event")).toBeInTheDocument();
    expect(screen.getByText("Version 1")).toBeInTheDocument();
    expect(
      screen.getByText("Manual extraction · 90% confidence"),
    ).toBeInTheDocument();
    expect(screen.getByText(/how to read this workspace/i)).toBeInTheDocument();
    expect(
      screen.queryByText("evidence-id-should-never-render"),
    ).not.toBeInTheDocument();
    expect(
      screen.queryByText("evidence-hash-should-never-render"),
    ).not.toBeInTheDocument();
  });

  it("shows loading, empty, and error states", async () => {
    vi.mocked(getOutcomeLearning).mockImplementation(
      () => new Promise(() => undefined),
    );
    const { unmount } = renderWithQueryClient(
      <MemoryRouter>
        <OutcomeLearningPage />
      </MemoryRouter>,
    );
    expect(screen.getByText("Loading outcome learning…")).toBeInTheDocument();
    unmount();

    vi.mocked(getOutcomeLearning).mockResolvedValueOnce({
      smallSampleThreshold: 5,
      competencies: [],
    });
    renderWithQueryClient(
      <MemoryRouter>
        <OutcomeLearningPage />
      </MemoryRouter>,
    );
    expect(
      await screen.findByText(/no competency outcome data yet/i),
    ).toBeInTheDocument();
  });

  it("explains when outcome learning cannot load", async () => {
    vi.mocked(getOutcomeLearning).mockRejectedValueOnce(new Error("offline"));

    renderWithQueryClient(
      <MemoryRouter>
        <OutcomeLearningPage />
      </MemoryRouter>,
    );

    expect(await screen.findByText(/could not be loaded/i)).toBeInTheDocument();
  });
});
