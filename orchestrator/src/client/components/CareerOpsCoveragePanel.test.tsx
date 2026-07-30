import { render, screen, within } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { CareerOpsCoveragePanel } from "./CareerOpsCoveragePanel";

const features = [
  {
    id: "ats",
    label: "ATS Fit",
    description: "Analyze fit.",
    status: "implemented" as const,
    surface: "job-page-action" as const,
    sourceArea: "job-fit-analysis",
    jobOpsPath: "orchestrator/src/client/components/CareerOpsQuickActions.tsx",
  },
  {
    id: "interview-prep",
    label: "Interview Prep",
    description: "Prepare interview answers.",
    status: "missing" as const,
    surface: "not-wired" as const,
    sourceArea: "interview-prep",
    missingReason: "No native JobOps route/component identified yet.",
    nextStep: "Audit CareerOps interview workflow.",
  },
];

describe("CareerOpsCoveragePanel", () => {
  it("shows implemented and missing features with clear statuses", () => {
    render(<CareerOpsCoveragePanel features={features} />);

    expect(screen.getByText("ATS Fit")).toBeInTheDocument();
    expect(screen.getByText("Interview Prep")).toBeInTheDocument();
    expect(screen.getByText("Implemented")).toBeInTheDocument();
    expect(screen.getByText("Missing")).toBeInTheDocument();
  });

  it("does not render missing features as active action buttons", () => {
    render(<CareerOpsCoveragePanel features={features} />);

    const interviewPrep = screen.getByTestId(
      "careerops-feature-interview-prep",
    );
    expect(
      within(interviewPrep).queryByRole("button", { name: /run/i }),
    ).not.toBeInTheDocument();
    expect(
      within(interviewPrep).getByText(/Audit CareerOps interview workflow/i),
    ).toBeInTheDocument();
  });
});
