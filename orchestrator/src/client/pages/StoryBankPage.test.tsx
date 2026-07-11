import { renderWithQueryClient } from "@client/test/renderWithQueryClient";
import { fireEvent, screen, waitFor } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { StoryBankPage } from "./StoryBankPage";

vi.mock("@client/api", () => ({
  createInterviewStory: vi.fn(),
  createStoryTag: vi.fn(),
  deleteInterviewStory: vi.fn(),
  getStoryTags: vi.fn(),
  getInterviewStories: vi.fn(),
  assignStoryTag: vi.fn(),
  unassignStoryTag: vi.fn(),
  updateInterviewStory: vi.fn(),
}));

import {
  assignStoryTag,
  createInterviewStory,
  createStoryTag,
  deleteInterviewStory,
  getInterviewStories,
  getStoryTags,
} from "@client/api";

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
  storyTags: [{ id: "tag-1", name: "leadership" }],
  usageCount: 2,
  lastUsedAt: "2026-01-02T00:00:00.000Z",
  isMasterStory: true,
  createdAt: "2026-01-01T00:00:00.000Z",
  updatedAt: "2026-01-01T00:00:00.000Z",
};

describe("StoryBankPage", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(getInterviewStories).mockResolvedValue({ stories: [story] });
    vi.mocked(getStoryTags).mockResolvedValue({
      tags: [{ id: "tag-1", name: "leadership" }],
    });
    vi.mocked(createInterviewStory).mockResolvedValue({
      ...story,
      id: "story-2",
      title: "Customer migration",
      isMasterStory: false,
    });
    vi.mocked(deleteInterviewStory).mockResolvedValue(undefined);
    vi.mocked(createStoryTag).mockResolvedValue({
      id: "tag-2",
      name: "delivery",
    });
    vi.mocked(assignStoryTag).mockResolvedValue(undefined);
  });

  it("renders saved STAR+R stories", async () => {
    renderWithQueryClient(
      <MemoryRouter>
        <StoryBankPage />
      </MemoryRouter>,
    );

    expect(screen.getByText("Story Bank")).toBeInTheDocument();
    await waitFor(() =>
      expect(screen.getByText("Scale incident")).toBeInTheDocument(),
    );
    expect(
      screen.getByText(/Traffic spiked during launch/),
    ).toBeInTheDocument();
    expect(screen.getByText(/systems,incident-response/)).toBeInTheDocument();
    expect(screen.getByText(/Used 2 times/)).toBeInTheDocument();
    expect(screen.getAllByText("leadership").length).toBeGreaterThan(0);
  });

  it("filters and assigns tags from the Story Bank surface", async () => {
    renderWithQueryClient(
      <MemoryRouter>
        <StoryBankPage />
      </MemoryRouter>,
    );

    await waitFor(() =>
      expect(screen.getByText("Scale incident")).toBeInTheDocument(),
    );
    fireEvent.click(screen.getByRole("button", { name: "leadership" }));
    await waitFor(() =>
      expect(getInterviewStories).toHaveBeenLastCalledWith({
        tagIds: ["tag-1"],
      }),
    );
  });

  it("creates a reusable interview story from STAR fields", async () => {
    renderWithQueryClient(
      <MemoryRouter>
        <StoryBankPage />
      </MemoryRouter>,
    );

    fireEvent.change(screen.getByLabelText("Title"), {
      target: { value: "Customer migration" },
    });
    fireEvent.change(screen.getByLabelText("Situation"), {
      target: { value: "Customer had a hard deadline." },
    });
    fireEvent.change(screen.getByLabelText("Task"), {
      target: { value: "Move workloads safely." },
    });
    fireEvent.change(screen.getByLabelText("Action"), {
      target: { value: "Built migration waves and rollback checks." },
    });
    fireEvent.change(screen.getByLabelText("Result"), {
      target: { value: "Migration finished with no downtime." },
    });
    fireEvent.change(screen.getByLabelText("Skills"), {
      target: { value: "migration,planning" },
    });

    fireEvent.click(screen.getByRole("button", { name: "Save story" }));

    await waitFor(() => expect(createInterviewStory).toHaveBeenCalled());
    expect(vi.mocked(createInterviewStory).mock.calls[0]?.[0]).toEqual(
      expect.objectContaining({
        title: "Customer migration",
        situation: "Customer had a hard deadline.",
        task: "Move workloads safely.",
        action: "Built migration waves and rollback checks.",
        result: "Migration finished with no downtime.",
        skills: "migration,planning",
        isMasterStory: false,
      }),
    );
  });

  it("deletes stories after confirmation", async () => {
    vi.spyOn(window, "confirm").mockReturnValue(true);

    renderWithQueryClient(
      <MemoryRouter>
        <StoryBankPage />
      </MemoryRouter>,
    );

    await waitFor(() =>
      expect(screen.getByText("Scale incident")).toBeInTheDocument(),
    );
    fireEvent.click(
      screen.getByRole("button", { name: "Delete Scale incident" }),
    );

    await waitFor(() => expect(deleteInterviewStory).toHaveBeenCalled());
    expect(vi.mocked(deleteInterviewStory).mock.calls[0]?.[0]).toBe("story-1");
  });
});
