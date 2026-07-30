import type { RuntimeCapabilityHealthResponse } from "@shared/types";
import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { RuntimeCapabilityHealth } from "./RuntimeCapabilityHealth";

describe("RuntimeCapabilityHealth", () => {
  it("renders normalized health states without configuration details", () => {
    const health: RuntimeCapabilityHealthResponse = {
      checkedAt: "2026-07-14T10:00:00.000Z",
      capabilities: [
        { id: "llm", label: "LLM", state: "healthy", reason: "Configured." },
        {
          id: "pdf",
          label: "PDF rendering and QA",
          state: "misconfigured",
          reason: "Configuration needed.",
        },
      ],
    };
    render(
      <RuntimeCapabilityHealth
        health={health}
        isLoading={false}
        onRefresh={() => undefined}
        layoutMode="panel"
      />,
    );
    expect(screen.getByText("Runtime health")).toBeInTheDocument();
    expect(screen.getByText("Healthy")).toBeInTheDocument();
    expect(screen.getByText("Misconfigured")).toBeInTheDocument();
    expect(screen.getByText("Configuration needed.")).toBeInTheDocument();
  });
});
