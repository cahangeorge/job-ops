import { createJob } from "@shared/testing/factories.js";
import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { CareerOpsEvaluationPanel } from "./CareerOpsEvaluationPanel";

describe("CareerOpsEvaluationPanel", () => {
  it("surfaces deep evaluation fields from the job detail record", () => {
    render(
      <CareerOpsEvaluationPanel
        job={createJob({
          evaluationOverallGrade: "A",
          archetype: "Strategic builder",
          evaluationCvMatchScore: 91,
          evaluationCvMatchReason:
            "Excellent fit for platform and TypeScript work.",
          evaluationLevelStrategy:
            "Target senior IC scope with systems ownership.",
          evaluationCompResearch: "Market range suggests £80k-£95k.",
          evaluationPersonalization:
            "Highlight incident response and scaling work.",
          evaluationLegitimacyReason:
            "Legit because the team and scope are concrete.",
        })}
      />,
    );

    expect(
      screen.getByTestId("career-ops-evaluation-panel"),
    ).toBeInTheDocument();
    expect(screen.getByText("Overall grade")).toBeInTheDocument();
    expect(screen.getByText("A")).toBeInTheDocument();
    expect(screen.getByText("Archetype")).toBeInTheDocument();
    expect(screen.getByText("Strategic builder")).toBeInTheDocument();
    expect(screen.getByText("CV match")).toBeInTheDocument();
    expect(screen.getByText("91%")).toBeInTheDocument();
    expect(
      screen.getByText(/platform and TypeScript work/i),
    ).toBeInTheDocument();
    expect(screen.getByText("Evaluation level strategy")).toBeInTheDocument();
    expect(screen.getByText(/senior IC scope/i)).toBeInTheDocument();
    expect(screen.getByText("Compensation research")).toBeInTheDocument();
    expect(screen.getByText(/£80k-£95k/i)).toBeInTheDocument();
    expect(screen.getByText("Personalization angle")).toBeInTheDocument();
    expect(
      screen.getByText(/incident response and scaling work/i),
    ).toBeInTheDocument();
    expect(screen.getByText("Legitimacy reason")).toBeInTheDocument();
    expect(
      screen.getByText(/team and scope are concrete/i),
    ).toBeInTheDocument();
  });
});
