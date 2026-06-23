import { createJob } from "@shared/testing/factories.js";
import { fireEvent, screen, waitFor } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { renderWithQueryClient } from "@/client/test/renderWithQueryClient";
import { InterviewPrepPanel } from "./InterviewPrepPanel";

vi.mock("@client/api", () => ({
  createJobNote: vi.fn(),
  getInterviewStories: vi.fn(),
}));

vi.mock("sonner", () => ({
  toast: {
    success: vi.fn(),
    error: vi.fn(),
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
    vi.mocked(api.createJobNote).mockResolvedValue({
      id: "note-1",
      jobId: "job-1",
      title: "Interview prep — Acme Labs",
      content: "prep",
      createdAt: "2026-01-01T00:00:00.000Z",
      updatedAt: "2026-01-01T00:00:00.000Z",
    });
  });

  it("renders the job interview prep guidance and reusable Story Bank entries", async () => {
    renderPanel();

    expect(screen.getByText("Interview Prep")).toBeInTheDocument();
    expect(
      screen.getByDisplayValue(/distributed systems, incident response/i),
    ).toBeInTheDocument();
    expect(await screen.findByText("Scale incident")).toBeInTheDocument();
    expect(screen.getByText(/Traffic spiked during launch/)).toBeInTheDocument();
  });

  it("saves selected Story Bank entries into a job note", async () => {
    renderPanel();

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
        content: expect.stringContaining("Tell me about a production incident."),
      }),
    );
    expect(vi.mocked(api.createJobNote).mock.calls[0]?.[1]?.content).toContain(
      "Scale incident",
    );
    expect(vi.mocked(api.createJobNote).mock.calls[0]?.[1]?.content).toContain(
      "Error rate dropped below 1%.",
    );
  });
});
