import { createJob } from "@shared/testing/factories";
import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { JobRowContent } from "./JobRowContent";

describe("JobRowContent", () => {
  it("renders a live posting badge", () => {
    render(
      <JobRowContent
        job={createJob({
          postingLivenessStatus: "live",
          postingLivenessCheckedAt: 1_800_000_000_000,
          postingLivenessReason: "Apply signal found",
        })}
      />,
    );

    expect(screen.getByText("Posting live")).toBeInTheDocument();
  });

  it("renders an expired posting badge", () => {
    render(
      <JobRowContent
        job={createJob({
          postingLivenessStatus: "expired",
          postingLivenessCheckedAt: 1_800_000_000_000,
          postingLivenessReason: "Posting closed",
        })}
      />,
    );

    expect(screen.getByText("Posting expired")).toBeInTheDocument();
  });
});
