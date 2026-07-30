import { setupWindowVirtualizerTestEnvironment } from "@client/test/virtualization";
import { createJob } from "@shared/testing/factories.js";
import {
  act,
  fireEvent,
  render,
  screen,
  waitFor,
} from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { JobListPanel } from "./JobListPanel";

const createJobs = (count: number) =>
  Array.from({ length: count }, (_, index) =>
    createJob({
      id: `job-${index + 1}`,
      title: `Job ${index + 1}`,
      employer: `Employer ${index + 1}`,
    }),
  );

let virtualizationEnvironment: ReturnType<
  typeof setupWindowVirtualizerTestEnvironment
> | null = null;

afterEach(() => {
  virtualizationEnvironment?.cleanup();
  virtualizationEnvironment = null;
});

describe("JobListPanel", () => {
  it("shows a loading state when fetching jobs", () => {
    render(
      <JobListPanel
        isLoading
        jobs={[]}
        activeJobs={[]}
        selectedJobId={null}
        selectedJobIds={new Set()}
        activeTab="ready"
        onSelectJob={vi.fn()}
        onToggleSelectJob={vi.fn()}
        onToggleSelectAll={vi.fn()}
      />,
    );

    expect(screen.getByText("Loading jobs...")).toBeInTheDocument();
  });

  it("shows the tab empty state copy when no jobs exist", () => {
    render(
      <JobListPanel
        isLoading={false}
        jobs={[]}
        activeJobs={[]}
        selectedJobId={null}
        selectedJobIds={new Set()}
        activeTab="ready"
        onSelectJob={vi.fn()}
        onToggleSelectJob={vi.fn()}
        onToggleSelectAll={vi.fn()}
        primaryEmptyStateAction={{
          label: "Tailor discovered jobs",
          onClick: vi.fn(),
        }}
        secondaryEmptyStateAction={{
          label: "Run pipeline",
          onClick: vi.fn(),
        }}
      />,
    );

    expect(screen.getByText("No jobs found")).toBeInTheDocument();
    expect(
      screen.getByText("Run the pipeline to discover and process new jobs."),
    ).toBeInTheDocument();
    expect(
      screen.getByRole("button", { name: /tailor discovered jobs/i }),
    ).toBeInTheDocument();
    expect(
      screen.getByRole("button", { name: /run pipeline/i }),
    ).toBeInTheDocument();
  });

  it("fires empty state actions when provided", () => {
    const onPrimary = vi.fn();
    const onSecondary = vi.fn();

    render(
      <JobListPanel
        isLoading={false}
        jobs={[]}
        activeJobs={[]}
        selectedJobId={null}
        selectedJobIds={new Set()}
        activeTab="ready"
        onSelectJob={vi.fn()}
        onToggleSelectJob={vi.fn()}
        onToggleSelectAll={vi.fn()}
        primaryEmptyStateAction={{
          label: "Tailor discovered jobs",
          onClick: onPrimary,
        }}
        secondaryEmptyStateAction={{
          label: "Run pipeline",
          onClick: onSecondary,
        }}
      />,
    );

    fireEvent.click(
      screen.getByRole("button", { name: /tailor discovered jobs/i }),
    );
    fireEvent.click(screen.getByRole("button", { name: /run pipeline/i }));

    expect(onPrimary).toHaveBeenCalledTimes(1);
    expect(onSecondary).toHaveBeenCalledTimes(1);
  });

  it("prefers a custom empty state message when provided", () => {
    render(
      <JobListPanel
        isLoading={false}
        jobs={[]}
        activeJobs={[]}
        selectedJobId={null}
        selectedJobIds={new Set()}
        activeTab="all"
        onSelectJob={vi.fn()}
        onToggleSelectJob={vi.fn()}
        onToggleSelectAll={vi.fn()}
        emptyStateMessage="No applied jobs found for this date range."
      />,
    );

    expect(
      screen.getByText("No applied jobs found for this date range."),
    ).toBeInTheDocument();
  });

  it("renders jobs and notifies when a job is selected", () => {
    const onSelectJob = vi.fn();
    const onToggleSelectJob = vi.fn();
    const onToggleSelectAll = vi.fn();
    const jobs = [
      createJob({ id: "job-1", title: "Backend Engineer" }),
      createJob({
        id: "job-2",
        title: "Frontend Engineer",
        employer: "Globex",
      }),
    ];

    render(
      <JobListPanel
        isLoading={false}
        jobs={jobs}
        activeJobs={jobs}
        selectedJobId="job-1"
        selectedJobIds={new Set()}
        activeTab="ready"
        onSelectJob={onSelectJob}
        onToggleSelectJob={onToggleSelectJob}
        onToggleSelectAll={onToggleSelectAll}
      />,
    );

    expect(
      screen.getByRole("button", { name: /Backend Engineer/i }),
    ).toHaveAttribute("aria-pressed", "true");

    fireEvent.click(screen.getByRole("button", { name: /Frontend Engineer/i }));
    expect(onSelectJob).toHaveBeenCalledWith("job-2");
  });

  it("shows discovered jobs without scores as awaiting AI scoring", () => {
    const jobs = [
      createJob({
        id: "job-1",
        title: "Backend Engineer",
        status: "discovered",
        suitabilityScore: null,
        suitabilityReason: null,
      }),
    ];

    render(
      <JobListPanel
        isLoading={false}
        jobs={jobs}
        activeJobs={jobs}
        selectedJobId={null}
        selectedJobIds={new Set()}
        activeTab="discovered"
        onSelectJob={vi.fn()}
        onToggleSelectJob={vi.fn()}
        onToggleSelectAll={vi.fn()}
      />,
    );

    expect(
      screen.getByLabelText("Waiting for AI scoring to finish."),
    ).toBeInTheDocument();
    expect(
      screen.queryByLabelText("AI misconfiguration or service error."),
    ).not.toBeInTheDocument();
  });

  it("shows a yellow status dot for flagged reposts without an inline badge", () => {
    const jobs = [
      createJob({
        id: "job-1",
        title: "Backend Engineer",
        appliedDuplicateMatch: {
          jobId: "job-applied",
          title: "Backend Engineer",
          employer: "Acme Labs",
          appliedAt: "2026-04-01T10:00:00.000Z",
          score: 96,
          titleScore: 97,
          employerScore: 95,
        },
      }),
    ];

    render(
      <JobListPanel
        isLoading={false}
        jobs={jobs}
        activeJobs={jobs}
        selectedJobId={null}
        selectedJobIds={new Set()}
        activeTab="ready"
        onSelectJob={vi.fn()}
        onToggleSelectJob={vi.fn()}
        onToggleSelectAll={vi.fn()}
      />,
    );

    expect(screen.queryByText("Previously Applied")).not.toBeInTheDocument();
    expect(screen.getByTitle("Previously Applied")).toHaveClass(
      "bg-yellow-400",
    );
  });

  it("shows legitimacy badges for high, medium, low, and unknown jobs", () => {
    const jobs = [
      createJob({
        id: "job-high",
        title: "High Legitimacy",
        evaluationLegitimacyScore: 91,
      }),
      createJob({
        id: "job-medium",
        title: "Medium Legitimacy",
        evaluationLegitimacyScore: 65,
      }),
      createJob({
        id: "job-low",
        title: "Low Legitimacy",
        evaluationLegitimacyScore: 32,
      }),
      createJob({
        id: "job-unknown",
        title: "Unknown Legitimacy",
        evaluationLegitimacyScore: null,
      }),
    ];

    render(
      <JobListPanel
        isLoading={false}
        jobs={jobs}
        activeJobs={jobs}
        selectedJobId={null}
        selectedJobIds={new Set()}
        activeTab="ready"
        onSelectJob={vi.fn()}
        onToggleSelectJob={vi.fn()}
        onToggleSelectAll={vi.fn()}
      />,
    );

    expect(screen.getByText("High legitimacy")).toBeInTheDocument();
    expect(screen.getByText("Medium legitimacy")).toBeInTheDocument();
    expect(screen.getByText("Low legitimacy")).toBeInTheDocument();
    expect(screen.getByText("Unknown legitimacy")).toBeInTheDocument();
  });

  it("shows ghost-job badges without replacing the applied duplicate indicator", () => {
    const jobs = [
      createJob({
        id: "job-ghost",
        title: "Ghosted Role",
        isGhostJob: true,
      }),
      createJob({
        id: "job-repost",
        title: "Repost Role",
        isGhostJob: true,
        appliedDuplicateMatch: {
          jobId: "job-applied",
          title: "Repost Role",
          employer: "Acme Labs",
          appliedAt: "2026-04-01T10:00:00.000Z",
          score: 96,
          titleScore: 97,
          employerScore: 95,
        },
      }),
    ];

    render(
      <JobListPanel
        isLoading={false}
        jobs={jobs}
        activeJobs={jobs}
        selectedJobId={null}
        selectedJobIds={new Set()}
        activeTab="ready"
        onSelectJob={vi.fn()}
        onToggleSelectJob={vi.fn()}
        onToggleSelectAll={vi.fn()}
      />,
    );

    expect(screen.getAllByText("Ghost job")).toHaveLength(2);
    expect(screen.getByTitle("Previously Applied")).toHaveClass(
      "bg-yellow-400",
    );
  });

  it("explains legitimacy and ghost-job badges with tooltips", async () => {
    const jobs = [
      createJob({
        id: "job-high",
        title: "Tooltip High Legitimacy",
        evaluationLegitimacyScore: 91,
        isGhostJob: true,
      }),
    ];

    render(
      <JobListPanel
        isLoading={false}
        jobs={jobs}
        activeJobs={jobs}
        selectedJobId={null}
        selectedJobIds={new Set()}
        activeTab="ready"
        onSelectJob={vi.fn()}
        onToggleSelectJob={vi.fn()}
        onToggleSelectAll={vi.fn()}
      />,
    );

    fireEvent.mouseEnter(screen.getByText("High legitimacy"));
    expect(
      await screen.findByText(
        /high-confidence role based on company and posting signals/i,
      ),
    ).toBeInTheDocument();

    fireEvent.mouseEnter(screen.getByText("Ghost job"));
    expect(
      await screen.findByText(
        /posting may be stale, low-intent, or unlikely to lead to a real hire/i,
      ),
    ).toBeInTheDocument();
  });

  it("toggles row selection and select-all", () => {
    const onToggleSelectJob = vi.fn();
    const onToggleSelectAll = vi.fn();
    const jobs = [
      createJob({ id: "job-1", title: "Backend Engineer" }),
      createJob({ id: "job-2", title: "Frontend Engineer" }),
    ];

    render(
      <JobListPanel
        isLoading={false}
        jobs={jobs}
        activeJobs={jobs}
        selectedJobId="job-1"
        selectedJobIds={new Set(["job-1"])}
        activeTab="ready"
        onSelectJob={vi.fn()}
        onToggleSelectJob={onToggleSelectJob}
        onToggleSelectAll={onToggleSelectAll}
      />,
    );

    fireEvent.click(screen.getByLabelText("Select Backend Engineer"));
    expect(onToggleSelectJob).toHaveBeenCalledWith("job-1");

    fireEvent.click(screen.getByLabelText("Select all filtered jobs"));
    expect(onToggleSelectAll).toHaveBeenCalledWith(true);
  });

  it("shows checkbox only for selected or checked rows", () => {
    const jobs = [createJob({ id: "job-1", title: "Backend Engineer" })];
    const { rerender } = render(
      <JobListPanel
        isLoading={false}
        jobs={jobs}
        activeJobs={jobs}
        selectedJobId={null}
        selectedJobIds={new Set()}
        activeTab="ready"
        onSelectJob={vi.fn()}
        onToggleSelectJob={vi.fn()}
        onToggleSelectAll={vi.fn()}
      />,
    );

    expect(screen.getByLabelText("Select Backend Engineer")).toHaveClass(
      "opacity-0",
    );

    rerender(
      <JobListPanel
        isLoading={false}
        jobs={jobs}
        activeJobs={jobs}
        selectedJobId="job-1"
        selectedJobIds={new Set()}
        activeTab="ready"
        onSelectJob={vi.fn()}
        onToggleSelectJob={vi.fn()}
        onToggleSelectAll={vi.fn()}
      />,
    );

    expect(screen.getByLabelText("Select Backend Engineer")).toHaveClass(
      "opacity-100",
    );

    rerender(
      <JobListPanel
        isLoading={false}
        jobs={jobs}
        activeJobs={jobs}
        selectedJobId={null}
        selectedJobIds={new Set(["job-1"])}
        activeTab="ready"
        onSelectJob={vi.fn()}
        onToggleSelectJob={vi.fn()}
        onToggleSelectAll={vi.fn()}
      />,
    );

    expect(screen.getByLabelText("Select Backend Engineer")).toHaveClass(
      "opacity-100",
    );
  });

  it("keeps large lists virtualized and scrolls offscreen rows into view", async () => {
    virtualizationEnvironment = setupWindowVirtualizerTestEnvironment({
      viewportHeight: 240,
      rowHeight: 72,
    });
    const jobs = createJobs(40);

    render(
      <JobListPanel
        isLoading={false}
        jobs={jobs}
        activeJobs={jobs}
        selectedJobId="job-1"
        selectedJobIds={new Set(["job-1"])}
        activeTab="ready"
        onSelectJob={vi.fn()}
        onToggleSelectJob={vi.fn()}
        onToggleSelectAll={vi.fn()}
      />,
    );

    expect(screen.queryByTestId("select-job-35")).not.toBeInTheDocument();
    const renderedRows = screen.getAllByTestId(/select-job-/);
    expect(renderedRows.length).toBeGreaterThan(0);
    expect(renderedRows.length).toBeLessThan(jobs.length);

    act(() => {
      window.scrollY = 2800;
      window.dispatchEvent(new Event("scroll"));
    });

    await waitFor(() => {
      expect(screen.getByTestId("select-job-35")).toBeInTheDocument();
    });
  });
});
