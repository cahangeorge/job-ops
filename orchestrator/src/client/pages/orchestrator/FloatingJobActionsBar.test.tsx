import { fireEvent, render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { FloatingJobActionsBar } from "./FloatingJobActionsBar";

describe("FloatingJobActionsBar", () => {
  it("renders batch selection actions and wires callbacks", () => {
    const onMoveToReady = vi.fn();
    const onSkipSelected = vi.fn();
    const onRescoreSelected = vi.fn();
    const onCheckLivenessSelected = vi.fn();
    const onClear = vi.fn();

    render(
      <FloatingJobActionsBar
        selectedCount={3}
        canMoveSelected
        canSkipSelected
        canRescoreSelected
        canCheckLivenessSelected
        jobActionInFlight={false}
        onMoveToReady={onMoveToReady}
        onSkipSelected={onSkipSelected}
        onRescoreSelected={onRescoreSelected}
        onCheckLivenessSelected={onCheckLivenessSelected}
        onClear={onClear}
      />,
    );

    expect(screen.getByText("3 selected")).toBeInTheDocument();
    expect(
      screen.getByRole("button", { name: "Batch rescore" }),
    ).toBeInTheDocument();
    expect(
      screen.getByRole("button", { name: "Batch liveness check" }),
    ).toBeInTheDocument();

    fireEvent.click(screen.getByRole("button", { name: "Move to Ready" }));
    fireEvent.click(screen.getByRole("button", { name: "Skip selected" }));
    fireEvent.click(screen.getByRole("button", { name: "Batch rescore" }));
    fireEvent.click(
      screen.getByRole("button", { name: "Batch liveness check" }),
    );
    fireEvent.click(screen.getByRole("button", { name: "Clear" }));

    expect(onMoveToReady).toHaveBeenCalledTimes(1);
    expect(onSkipSelected).toHaveBeenCalledTimes(1);
    expect(onRescoreSelected).toHaveBeenCalledTimes(1);
    expect(onCheckLivenessSelected).toHaveBeenCalledTimes(1);
    expect(onClear).toHaveBeenCalledTimes(1);
  });
});
