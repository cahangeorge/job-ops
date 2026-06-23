import { renderWithQueryClient } from "@client/test/renderWithQueryClient";
import { screen, waitFor } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { CareerOpsCoveragePage } from "./CareerOpsCoveragePage";

vi.mock("@client/api", () => ({
  getCareerOpsCoverage: vi.fn(),
}));

import { getCareerOpsCoverage } from "@client/api";

describe("CareerOpsCoveragePage", () => {
  beforeEach(() => {
    vi.mocked(getCareerOpsCoverage).mockResolvedValue({
      available: true,
      actions: ["ats"],
      features: [
        {
          id: "ats",
          label: "ATS Fit",
          description: "Analyze fit.",
          status: "implemented",
          surface: "job-page-action",
          sourceArea: "job-fit-analysis",
        },
        {
          id: "interview-prep",
          label: "Interview Prep",
          description: "Prepare interviews.",
          status: "missing",
          surface: "not-wired",
          sourceArea: "interview-prep",
          nextStep: "Audit CareerOps interview workflow.",
        },
      ],
    });
  });

  it("renders CareerOps coverage data", async () => {
    renderWithQueryClient(
      <MemoryRouter>
        <CareerOpsCoveragePage />
      </MemoryRouter>,
    );

    expect(screen.getByText("CareerOps Coverage")).toBeInTheDocument();
    await waitFor(() =>
      expect(screen.getByText("ATS Fit")).toBeInTheDocument(),
    );
    expect(screen.getByText("Interview Prep")).toBeInTheDocument();
  });
});
