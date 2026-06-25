import * as api from "@client/api";
import { renderWithQueryClient } from "@client/test/renderWithQueryClient";
import { createJob } from "@shared/testing/factories.js";
import { fireEvent, screen, waitFor } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { CareerOpsQuickActions } from "./CareerOpsQuickActions";

vi.mock("@client/api", () => ({
  getCareerOpsAvailability: vi.fn(),
  analyzeAtsKeywords: vi.fn(),
  checkJobPostingLiveness: vi.fn(),
  generateCoverLetter: vi.fn(),
  generateNegotiationScripts: vi.fn(),
  scanCompanyPortal: vi.fn(),
  createJobNote: vi.fn(),
}));

vi.mock("@/lib/utils", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/lib/utils")>();
  return {
    ...actual,
    copyTextToClipboard: vi.fn().mockResolvedValue(undefined),
  };
});

vi.mock("sonner", () => ({
  toast: {
    success: vi.fn(),
    error: vi.fn(),
  },
}));

describe("CareerOpsQuickActions", () => {
  const renderQuickActions = (ui: React.ReactElement) =>
    renderWithQueryClient(<MemoryRouter>{ui}</MemoryRouter>);

  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(api.getCareerOpsAvailability).mockResolvedValue(true);
    vi.mocked(api.analyzeAtsKeywords).mockResolvedValue({
      requiredKeywords: ["k8s"],
      preferredKeywords: ["typescript"],
      missingKeywords: [],
      keywordDensity: [{ keyword: "k8s", count: 2 }],
      optimizedSummary: "Optimized role summary.",
    });
    vi.mocked(api.generateCoverLetter).mockResolvedValue({
      coverLetter: "Dear Hiring Manager",
      researchNotes: "Strong mission fit",
      keywordsMirrored: ["reliability"],
      tone: "formal",
      angle: "company_mission",
    });
    vi.mocked(api.generateNegotiationScripts).mockResolvedValue({
      openingScript: "Thanks for the offer.",
      counterOfferScript: "I would like to discuss compensation.",
      geographicDiscountPushback: "Scope should drive compensation.",
      benefitsNegotiation: "Let's discuss equity.",
      competingOfferLeverage: "I am balancing another offer.",
      timeline: "I can decide by Friday.",
    });
    vi.mocked(api.scanCompanyPortal).mockResolvedValue({
      total: 5,
      filtered: 1,
      errors: [],
      jobs: [
        {
          id: "job-2",
          title: "Platform Engineer",
          employer: "Acme Labs",
          location: "Remote",
          department: "Infrastructure",
          url: "https://boards.greenhouse.io/acme/jobs/2",
          portal: "greenhouse",
          postedAt: "2026-01-02T12:00:00.000Z",
          description: "Build platforms",
          employmentType: "Full-time",
          experienceLevel: "Senior",
          isRemote: true,
        },
      ],
    });
    vi.mocked(api.createJobNote).mockResolvedValue({
      id: "note-1",
      jobId: "job-1",
      title: "Saved note",
      content: "Saved content",
      createdAt: "2026-01-02T12:00:00.000Z",
      updatedAt: "2026-01-02T12:00:00.000Z",
    });
    vi.mocked(api.checkJobPostingLiveness).mockResolvedValue({
      status: "live",
      checkedAt: 1_800_000_000_000,
      reason: "Apply signal found",
    });
  });

  it("renders actions and disables company scan when portal cannot be inferred", () => {
    renderQuickActions(<CareerOpsQuickActions job={createJob()} />);

    return waitFor(() => {
      expect(
        screen.getByRole("button", { name: "ATS Fit" }),
      ).toBeInTheDocument();
      expect(
        screen.getByRole("button", { name: "Cover Letter" }),
      ).toBeInTheDocument();
      expect(
        screen.getByRole("button", { name: "Negotiation" }),
      ).toBeInTheDocument();
      expect(
        screen.getByRole("button", { name: "Scan company jobs" }),
      ).toBeDisabled();
    });
  });

  it("runs ATS analysis from job context", async () => {
    renderQuickActions(
      <CareerOpsQuickActions
        job={createJob({
          tailoredSummary: "Built resilient backend systems.",
        })}
      />,
    );

    await screen.findByRole("button", { name: "ATS Fit" });
    fireEvent.click(screen.getByRole("button", { name: "ATS Fit" }));

    await waitFor(() =>
      expect(api.analyzeAtsKeywords).toHaveBeenCalledWith({
        jobDescription: "Job description content",
        resumeText: "Built resilient backend systems.",
      }),
    );
    expect(
      await screen.findByText("Optimized role summary."),
    ).toBeInTheDocument();
  });

  it("uses fallback profile summary for cover letter generation", async () => {
    renderQuickActions(
      <CareerOpsQuickActions
        job={createJob({
          tailoredSummary: null,
          companyDescription: "Company mission details",
        })}
        resumeSummaryFallback="Profile baseline summary"
      />,
    );

    await screen.findByRole("button", { name: "Cover Letter" });
    fireEvent.click(screen.getByRole("button", { name: "Cover Letter" }));

    await waitFor(() =>
      expect(api.generateCoverLetter).toHaveBeenCalledWith({
        jobTitle: "Backend Engineer",
        employer: "Acme Labs",
        jobDescription: "Job description content",
        resumeSummary: "Profile baseline summary",
        companyResearch: "Company mission details",
        tone: "formal",
        angle: "company_mission",
      }),
    );
    expect(await screen.findByText("Dear Hiring Manager")).toBeInTheDocument();

    fireEvent.click(screen.getByRole("button", { name: "Save to notes" }));

    await waitFor(() =>
      expect(api.createJobNote).toHaveBeenCalledWith("job-1", {
        title: "Cover letter - Backend Engineer",
        content: "Dear Hiring Manager",
      }),
    );
    expect(screen.getByRole("link", { name: /open notes/i })).toHaveAttribute(
      "href",
      "/job/job-1/notes?noteId=note-1",
    );
  });

  it("runs negotiation and portal scan actions", async () => {
    renderQuickActions(
      <CareerOpsQuickActions
        job={createJob({
          applicationLink: "https://boards.greenhouse.io/acme/jobs/1",
        })}
        resumeSummaryFallback="Profile baseline summary"
      />,
    );

    await screen.findByRole("button", { name: "Negotiation" });
    fireEvent.click(screen.getByRole("button", { name: "Negotiation" }));
    await waitFor(() =>
      expect(api.generateNegotiationScripts).toHaveBeenCalledWith({
        jobTitle: "Backend Engineer",
        employer: "Acme Labs",
        location: "California",
        tone: "collaborative",
      }),
    );
    expect(
      await screen.findByText("Timeline: I can decide by Friday."),
    ).toBeInTheDocument();

    fireEvent.click(screen.getByRole("button", { name: "Save to notes" }));
    await waitFor(() =>
      expect(api.createJobNote).toHaveBeenCalledWith("job-1", {
        title: "Negotiation script - Backend Engineer",
        content:
          "## Opening script\nThanks for the offer.\n\n## Counter-offer script\nI would like to discuss compensation.\n\n## Timeline\nI can decide by Friday.",
      }),
    );

    fireEvent.click(screen.getByRole("button", { name: "Scan company jobs" }));
    await waitFor(() =>
      expect(api.scanCompanyPortal).toHaveBeenCalledWith({
        orgSlug: "acme",
        portal: "greenhouse",
        excludeInternships: true,
      }),
    );
    expect(await screen.findByText("Platform Engineer")).toBeInTheDocument();

    fireEvent.click(screen.getByRole("button", { name: "Save to notes" }));
    await waitFor(() =>
      expect(api.createJobNote).toHaveBeenCalledWith("job-1", {
        title: "Company scan - Acme Labs",
        content:
          "## Company scan\n\n**Employer**\nAcme Labs\n\n**Total results**\n5\n\n**Filtered results**\n1\n\n**Jobs**\n- Platform Engineer | Remote | https://boards.greenhouse.io/acme/jobs/2",
      }),
    );
    expect(screen.getByRole("link", { name: /open notes/i })).toHaveAttribute(
      "href",
      "/job/job-1/notes?noteId=note-1",
    );
  });

  it("saves ATS output to notes", async () => {
    renderQuickActions(
      <CareerOpsQuickActions
        job={createJob({
          tailoredSummary: "Built resilient backend systems.",
        })}
      />,
    );

    await screen.findByRole("button", { name: "ATS Fit" });
    fireEvent.click(screen.getByRole("button", { name: "ATS Fit" }));
    expect(
      await screen.findByText("Optimized role summary."),
    ).toBeInTheDocument();

    fireEvent.click(screen.getByRole("button", { name: "Save to notes" }));

    await waitFor(() =>
      expect(api.createJobNote).toHaveBeenCalledWith("job-1", {
        title: "ATS fit - Backend Engineer",
        content:
          "## ATS Fit\n\n**Optimized summary**\nOptimized role summary.\n\n**Required keywords**\nk8s\n\n**Preferred keywords**\ntypescript\n\n**Missing keywords**\nnone detected",
      }),
    );
    expect(screen.getByRole("link", { name: /open notes/i })).toHaveAttribute(
      "href",
      "/job/job-1/notes?noteId=note-1",
    );
  });

  it("does not render missing CareerOps registry items as job-page action buttons", async () => {
    renderQuickActions(
      <CareerOpsQuickActions
        job={createJob({
          tailoredSummary: "Built resilient backend systems.",
        })}
        resumeSummaryFallback="Profile baseline summary"
      />,
    );

    expect(
      await screen.findByRole("button", { name: "ATS Fit" }),
    ).toBeInTheDocument();
    expect(
      screen.getByRole("button", { name: "Cover Letter" }),
    ).toBeInTheDocument();
    expect(
      screen.getByRole("button", { name: "Negotiation" }),
    ).toBeInTheDocument();
    expect(
      screen.queryByRole("button", { name: /interview prep/i }),
    ).not.toBeInTheDocument();
    expect(
      screen.queryByRole("button", { name: /liveness/i }),
    ).not.toBeInTheDocument();
  });

  it("stays hidden when the backend does not expose Career Ops routes", async () => {
    vi.mocked(api.getCareerOpsAvailability).mockRejectedValueOnce(
      new Error("Server error (500): Expected JSON but received HTML."),
    );

    renderQuickActions(<CareerOpsQuickActions job={createJob()} />);

    await waitFor(() => {
      expect(
        screen.queryByTestId("career-ops-quick-actions"),
      ).not.toBeInTheDocument();
    });
  });
});
