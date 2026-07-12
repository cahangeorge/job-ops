import { fireEvent, screen, waitFor } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import * as api from "@/client/api";
import { renderWithQueryClient } from "@/client/test/renderWithQueryClient";
import { JobDossierPanel } from "./JobDossierPanel";

vi.mock("@/client/api", () => ({
  getJobDossier: vi.fn(),
  createJobDossierDraft: vi.fn(),
  getInterviewStories: vi.fn(),
  getDesignResumeStatus: vi.fn(),
}));

const dossier: api.JobDossier = {
  dossier: {
    id: "dossier-1",
    lifecycleState: "pending_approval",
    createdAt: "2026-01-01T00:00:00.000Z",
  },
  posting: {
    id: "posting-1",
    retrievedAt: "2026-01-01T10:00:00.000Z",
    hashPrefix: "abc12345",
  },
  revisions: [
    {
      id: "revision-1",
      revisionNumber: 1,
      createdAt: "2026-01-01T11:00:00.000Z",
      content: "Immutable historical draft",
      resumeRevision: 4,
      stories: [
        {
          id: "story-1",
          title: "Scale incident",
          excerpt: "Kept the platform online.",
        },
      ],
    },
  ],
  submittedArtifacts: [
    {
      id: "artifact-1",
      draftRevisionId: "revision-1",
      byteSize: 2048,
      mediaType: "application/pdf",
      qaResult: "passed",
      createdAt: "2026-01-01T12:00:00.000Z",
    },
  ],
  hasMore: { revisions: false, submittedArtifacts: false },
};

describe("JobDossierPanel", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(api.getJobDossier).mockResolvedValue(dossier);
    vi.mocked(api.getInterviewStories).mockResolvedValue({
      stories: Array.from({ length: 21 }, (_, index) => ({
        id: `story-${index + 1}`,
        tenantId: "tenant-default",
        title: `Story ${index + 1}`,
        situation: "Situation",
        task: "Task",
        action: "Action",
        result: "Result",
        reflection: null,
        skills: null,
        tags: null,
        isMasterStory: false,
        createdAt: "2026-01-01T00:00:00.000Z",
        updatedAt: "2026-01-01T00:00:00.000Z",
      })),
    });
    vi.mocked(api.getDesignResumeStatus).mockResolvedValue({
      exists: true,
      documentId: "resume-1",
      updatedAt: "2026-01-01T00:00:00.000Z",
    });
    vi.mocked(api.createJobDossierDraft).mockResolvedValue({
      dossier: { id: "dossier-1", lifecycleState: "pending_approval" },
      revision: { id: "revision-2", revisionNumber: 2 },
      posting: dossier.posting,
    });
  });

  it("shows safe provenance and immutable history without raw snapshot details", async () => {
    renderWithQueryClient(<JobDossierPanel jobId="job-1" />);

    expect(
      await screen.findByText("Lifecycle: pending approval"),
    ).toBeInTheDocument();
    expect(screen.getByText(/Posting snapshot.*abc12345/i)).toBeInTheDocument();
    expect(screen.getByText("Design Resume revision 4")).toBeInTheDocument();
    expect(screen.getByText("Scale incident")).toBeInTheDocument();
    expect(screen.getByText("Submitted artifacts")).toBeInTheDocument();
    expect(
      screen.queryByText(/resumeSnapshot|contentHash|storagePath/i),
    ).not.toBeInTheDocument();
  });

  it("caps Story Bank selection at 20 and supports removal", async () => {
    renderWithQueryClient(<JobDossierPanel jobId="job-1" />);
    await screen.findByLabelText("Use Story 1");

    for (let index = 1; index <= 20; index += 1) {
      fireEvent.click(screen.getByLabelText(`Use Story ${index}`));
    }
    expect(screen.getByText("20 of 20 selected")).toBeInTheDocument();
    expect(screen.getByLabelText("Use Story 21")).toBeDisabled();

    fireEvent.click(screen.getByRole("button", { name: "Remove Story 1" }));
    expect(screen.getByText("19 of 20 selected")).toBeInTheDocument();
    expect(screen.getByLabelText("Use Story 21")).not.toBeDisabled();
  });

  it("signals when dossier history is truncated", async () => {
    vi.mocked(api.getJobDossier).mockResolvedValue({
      ...dossier,
      hasMore: { revisions: true, submittedArtifacts: true },
    });
    renderWithQueryClient(<JobDossierPanel jobId="job-1" />);

    expect(
      await screen.findByText("Showing the 20 newest revisions."),
    ).toBeInTheDocument();
    expect(
      screen.getByText("Showing the 20 newest submitted artifacts."),
    ).toBeInTheDocument();
  });

  it("submits a human draft then refetches its dossier", async () => {
    renderWithQueryClient(<JobDossierPanel jobId="job-1" />);
    await screen.findByLabelText("Human draft");
    fireEvent.change(screen.getByLabelText("Human draft"), {
      target: { value: "My draft" },
    });
    fireEvent.click(screen.getByLabelText("Use Story 1"));
    fireEvent.click(
      screen.getByRole("button", { name: "Save immutable revision" }),
    );

    await waitFor(() =>
      expect(api.createJobDossierDraft).toHaveBeenCalledWith("job-1", {
        content: "My draft",
        storyIds: ["story-1"],
      }),
    );
    await waitFor(() => expect(api.getJobDossier).toHaveBeenCalledTimes(2));
  });

  it("makes a missing Design Resume and server errors visible", async () => {
    vi.mocked(api.getDesignResumeStatus).mockResolvedValue({
      exists: false,
      documentId: null,
      updatedAt: null,
    });
    vi.mocked(api.createJobDossierDraft).mockRejectedValue(
      new Error("Story Bank entry not found"),
    );
    renderWithQueryClient(<JobDossierPanel jobId="job-1" />);
    expect(
      await screen.findByText(/Resume Studio is required/i),
    ).toBeInTheDocument();
    fireEvent.change(screen.getByLabelText("Human draft"), {
      target: { value: "My draft" },
    });
    fireEvent.click(
      screen.getByRole("button", { name: "Save immutable revision" }),
    );
    expect(await screen.findByRole("alert")).toHaveTextContent(
      "Story Bank entry not found",
    );
  });
});
