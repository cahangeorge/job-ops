import { createJob } from "@shared/testing/factories.js";
import { screen, waitFor } from "@testing-library/react";
import type { ReactNode } from "react";
import { describe, expect, it, vi } from "vitest";
import { renderWithQueryClient } from "@/client/test/renderWithQueryClient";
import { JobPageRightSidebar } from "./JobPageRightSidebar";

vi.mock("@client/api", () => ({
  getCareerOpsAvailability: vi.fn().mockResolvedValue(true),
  analyzeAtsKeywords: vi.fn(),
  checkJobPostingLiveness: vi.fn().mockResolvedValue({
    status: "live",
    checkedAt: 1_800_000_000_000,
    reason: "Apply signal found",
  }),
  generateCoverLetter: vi.fn(),
  generateNegotiationScripts: vi.fn(),
  scanCompanyPortal: vi.fn(),
  createJobNote: vi.fn(),
}));

vi.mock("@/components/ui/dropdown-menu", () => ({
  DropdownMenu: ({ children }: { children: ReactNode }) => <>{children}</>,
  DropdownMenuTrigger: ({ children }: { children: ReactNode }) => (
    <>{children}</>
  ),
  DropdownMenuContent: ({ children }: { children: ReactNode }) => (
    <div>{children}</div>
  ),
  DropdownMenuItem: ({
    children,
    onSelect,
    disabled,
  }: {
    children: ReactNode;
    onSelect?: () => void;
    disabled?: boolean;
  }) => (
    <button type="button" disabled={disabled} onClick={() => onSelect?.()}>
      {children}
    </button>
  ),
  DropdownMenuSeparator: () => <hr />,
}));

const noop = vi.fn();

function renderRightSidebar(overrides: Parameters<typeof createJob>[0] = {}) {
  const job = createJob({
    status: "ready",
    pdfPath: "data/pdfs/resume_job-1.pdf",
    pdfFreshness: "stale",
    ...overrides,
  });

  return renderWithQueryClient(
    <JobPageRightSidebar
      job={job}
      tasks={[]}
      jobLink={job.jobUrl}
      isDiscovered={job.status === "discovered"}
      isReady={job.status === "ready"}
      isApplied={job.status === "applied"}
      isInProgress={job.status === "in_progress"}
      canLogEvents={false}
      isBusy={false}
      isUploadingPdf={false}
      pdfActionsDisabled={false}
      pdfRegeneratingReason={null}
      pdfViewLabel="View old PDF"
      pdfDownloadLabel="Download old PDF"
      onStartTailoring={noop}
      onMarkApplied={noop}
      onMoveToInProgress={noop}
      onOpenLogEvent={noop}
      onEditTailoring={noop}
      onViewPdf={noop}
      onDownloadPdf={noop}
      onUploadPdf={noop}
      onRegeneratePdf={noop}
      onSkip={noop}
      onOpenEditDetails={noop}
      onViewJobDescription={noop}
      onCopyJobInfo={noop}
      onRescore={noop}
      onCheckSponsor={noop}
      onPrepareApplyChecklist={noop}
      resumeSummaryFallback="Base profile summary"
    />,
  );
}

describe("JobPageRightSidebar actions", () => {
  it("includes the orchestrator detail menu actions on the job page", async () => {
    renderRightSidebar();

    expect(
      screen.getByRole("button", { name: /edit details/i }),
    ).toBeInTheDocument();
    expect(
      screen.getByRole("button", { name: /view job description/i }),
    ).toBeInTheDocument();
    expect(
      screen.getByRole("button", { name: /copy job info/i }),
    ).toBeInTheDocument();
    expect(
      screen.getByRole("button", { name: /recalculate match/i }),
    ).toBeInTheDocument();
    expect(
      screen.getAllByRole("button", { name: /replace pdf/i }).length,
    ).toBeGreaterThan(0);
    expect(
      screen.getAllByRole("button", { name: /view old pdf/i }).length,
    ).toBeGreaterThan(0);
    expect(
      screen.getByRole("button", { name: /download old pdf/i }),
    ).toBeInTheDocument();
    await waitFor(() =>
      expect(screen.getByRole("button", { name: /ats fit/i })).toBeInTheDocument(),
    );
    expect(
      screen.getByRole("button", { name: /cover letter/i }),
    ).toBeInTheDocument();
    expect(
      screen.getByRole("button", { name: /negotiation/i }),
    ).toBeInTheDocument();
    expect(
      screen.getByRole("button", { name: /check posting/i }),
    ).toBeInTheDocument();
    expect(
      screen.getByRole("button", { name: /scan company jobs/i }),
    ).toBeDisabled();
    expect(
      screen.getByRole("button", { name: /prepare application checklist/i }),
    ).toBeInTheDocument();
  });

  it("uses upload wording when the job has no resume PDF", () => {
    renderRightSidebar({ pdfPath: null, pdfFreshness: "missing" });

    expect(
      screen.getAllByRole("button", { name: /upload pdf/i }).length,
    ).toBeGreaterThan(0);
    expect(screen.queryByRole("button", { name: /download pdf/i })).toBeNull();
  });
});
