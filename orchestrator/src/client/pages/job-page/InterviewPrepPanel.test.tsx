import { queryKeys } from "@client/lib/queryKeys";
import { createJob } from "@shared/testing/factories.js";
import { fireEvent, screen, waitFor } from "@testing-library/react";
import { toast } from "sonner";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { renderWithQueryClient } from "@/client/test/renderWithQueryClient";
import { InterviewPrepPanel } from "./InterviewPrepPanel";

vi.mock("@client/api", () => ({
  createJobNote: vi.fn(),
  generateInterviewPrep: vi.fn(),
  getInterviewStories: vi.fn(),
  recordStoryUsage: vi.fn(),
}));

vi.mock("sonner", () => ({
  toast: {
    success: vi.fn(),
    error: vi.fn(),
    warning: vi.fn(),
  },
}));

import * as api from "@client/api";

const story = {
  id: "story-1",
  tenantId: "tenant_default",
  title: "Scale incident",
  situation: "Traffic spiked during launch.",
  task: "Keep the platform online.",
  action: "Added queue backpressure and scaled workers.",
  result: "Error rate dropped below 1%.",
  reflection: "Prepared runbooks earlier next time.",
  skills: "systems,incident-response",
  tags: "reliability,leadership",
  isMasterStory: true,
  createdAt: "2026-01-01T00:00:00.000Z",
  updatedAt: "2026-01-01T00:00:00.000Z",
};

function renderPanel() {
  const job = createJob({
    id: "job-1",
    title: "Senior Platform Engineer",
    employer: "Acme Labs",
    evaluationInterviewPrep:
      "Expect distributed systems, incident response, and stakeholder communication questions.",
  });

  return renderWithQueryClient(<InterviewPrepPanel job={job} />);
}

describe("InterviewPrepPanel", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(api.getInterviewStories).mockResolvedValue({ stories: [story] });
    vi.mocked(api.generateInterviewPrep).mockResolvedValue({
      prepGuidance: "Focus on incident leadership and queue scaling tradeoffs.",
      targetQuestions: [
        "Tell me about a production incident.",
        "How do you scale queue workers safely?",
      ],
      answerOutlines: [
        {
          question: "Tell me about a production incident.",
          outline: "Use Scale incident and emphasize measurable recovery.",
          storyIds: ["story-1"],
        },
      ],
      recommendedStoryIds: ["story-1"],
      interviewerQuestions: ["What reliability metrics define success?"],
    });
    vi.mocked(api.createJobNote).mockResolvedValue({
      id: "note-1",
      jobId: "job-1",
      title: "Interview prep — Acme Labs",
      content: "prep",
      createdAt: "2026-01-01T00:00:00.000Z",
      updatedAt: "2026-01-01T00:00:00.000Z",
    });
    vi.mocked(api.recordStoryUsage).mockResolvedValue();
  });

  it("renders the job interview prep guidance and reusable Story Bank entries", async () => {
    renderPanel();

    expect(screen.getByText("Interview Prep")).toBeInTheDocument();
    expect(
      screen.getByDisplayValue(/distributed systems, incident response/i),
    ).toBeInTheDocument();
    expect(await screen.findByText("Scale incident")).toBeInTheDocument();
    expect(
      screen.getByText(/Traffic spiked during launch/),
    ).toBeInTheDocument();
  });

  it("loads Story Bank stories without passing TanStack Query context as a filter", async () => {
    renderPanel();

    await screen.findByText("Scale incident");

    expect(api.getInterviewStories).toHaveBeenCalledWith();
  });

  it("records Story Bank usage and confirms a successful interview prep save", async () => {
    const { queryClient } = renderPanel();
    const invalidateSpy = vi.spyOn(queryClient, "invalidateQueries");

    await screen.findByText("Scale incident");
    fireEvent.click(
      screen.getByRole("checkbox", { name: /Use story Scale incident/i }),
    );
    fireEvent.click(screen.getByRole("button", { name: "Save prep to notes" }));

    await waitFor(() =>
      expect(api.recordStoryUsage).toHaveBeenCalledWith({
        storyId: "story-1",
        jobId: "job-1",
        usageKind: "interview_prep",
        provenance: { noteId: "note-1" },
      }),
    );
    await waitFor(() =>
      expect(invalidateSpy).toHaveBeenCalledWith({
        queryKey: queryKeys.storyBank.all,
      }),
    );
    expect(toast.success).toHaveBeenCalledWith("Interview prep saved to notes");
    expect(toast.warning).not.toHaveBeenCalled();
  });

  it("saves the note and invalidates caches when Story Bank usage tracking fails", async () => {
    const { queryClient } = renderPanel();
    const invalidateSpy = vi.spyOn(queryClient, "invalidateQueries");
    vi.mocked(api.recordStoryUsage).mockRejectedValue(
      new Error("Usage tracking unavailable"),
    );

    await screen.findByText("Scale incident");
    fireEvent.click(
      screen.getByRole("checkbox", { name: /Use story Scale incident/i }),
    );
    fireEvent.change(screen.getByLabelText("Target questions"), {
      target: { value: "Tell me about a production incident." },
    });
    fireEvent.click(screen.getByRole("button", { name: "Save prep to notes" }));

    await waitFor(() => expect(api.createJobNote).toHaveBeenCalled());
    expect(vi.mocked(api.createJobNote).mock.calls[0]?.[0]).toBe("job-1");
    expect(vi.mocked(api.createJobNote).mock.calls[0]?.[1]).toEqual(
      expect.objectContaining({
        title: "Interview prep — Acme Labs",
        content: expect.stringContaining(
          "Tell me about a production incident.",
        ),
      }),
    );
    expect(vi.mocked(api.createJobNote).mock.calls[0]?.[1]?.content).toContain(
      "Scale incident",
    );
    expect(vi.mocked(api.createJobNote).mock.calls[0]?.[1]?.content).toContain(
      "Error rate dropped below 1%.",
    );
    await waitFor(() =>
      expect(api.recordStoryUsage).toHaveBeenCalledWith({
        storyId: "story-1",
        jobId: "job-1",
        usageKind: "interview_prep",
        provenance: { noteId: "note-1" },
      }),
    );
    await waitFor(() =>
      expect(invalidateSpy).toHaveBeenCalledWith({
        queryKey: queryKeys.jobs.notes("job-1"),
      }),
    );
    expect(invalidateSpy).toHaveBeenCalledWith({
      queryKey: queryKeys.storyBank.all,
    });
    expect(toast.warning).toHaveBeenCalledWith(
      "Interview prep saved to notes, but Story Bank usage tracking failed",
    );
    expect(toast.error).not.toHaveBeenCalled();
  });

  it("generates interview prep with AI, recommends stories, and saves generated outlines", async () => {
    renderPanel();

    await screen.findByText("Scale incident");
    fireEvent.click(
      screen.getByRole("button", { name: "Generate prep with AI" }),
    );

    await waitFor(() => expect(api.generateInterviewPrep).toHaveBeenCalled());
    expect(vi.mocked(api.generateInterviewPrep).mock.calls[0]?.[0]).toEqual(
      expect.objectContaining({
        jobTitle: "Senior Platform Engineer",
        employer: "Acme Labs",
        evaluationInterviewPrep:
          "Expect distributed systems, incident response, and stakeholder communication questions.",
        stories: [
          expect.objectContaining({ id: "story-1", title: "Scale incident" }),
        ],
      }),
    );

    expect(
      await screen.findByDisplayValue(/queue scaling tradeoffs/i),
    ).toBeInTheDocument();
    expect(
      screen.getByDisplayValue(/How do you scale queue workers safely/i),
    ).toBeInTheDocument();
    expect(
      screen.getByText(/Use Scale incident and emphasize measurable recovery/i),
    ).toBeInTheDocument();
    expect(
      screen.getByRole("checkbox", { name: /Use story Scale incident/i }),
    ).toBeChecked();

    fireEvent.click(screen.getByRole("button", { name: "Save prep to notes" }));

    await waitFor(() => expect(api.createJobNote).toHaveBeenCalled());
    expect(vi.mocked(api.createJobNote).mock.calls[0]?.[1]?.content).toContain(
      "Use Scale incident and emphasize measurable recovery.",
    );
    expect(vi.mocked(api.createJobNote).mock.calls[0]?.[1]?.content).toContain(
      "What reliability metrics define success?",
    );
  });
});
