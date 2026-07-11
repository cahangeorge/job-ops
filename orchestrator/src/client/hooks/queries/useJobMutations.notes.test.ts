import * as api from "@client/api";
import type { JobNote } from "@shared/types";
import { act } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { queryKeys } from "@/client/lib/queryKeys";
import { renderHookWithQueryClient } from "@/client/test/renderWithQueryClient";
import {
  useCreateJobNoteMutation,
  useDeleteJobNoteMutation,
  useUpdateJobNoteMutation,
} from "./useJobMutations";

vi.mock("@client/api", () => ({
  createJobNote: vi.fn(),
  updateJobNote: vi.fn(),
  deleteJobNote: vi.fn(),
}));

describe("job note mutations", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("invalidates note and pipeline projections after creating a note", async () => {
    const note: JobNote = {
      id: "note-1",
      jobId: "job-1",
      title: "Why applied",
      content: "Because it fits.",
      createdAt: "2026-01-01T00:00:00.000Z",
      updatedAt: "2026-01-01T00:00:00.000Z",
    };
    vi.mocked(api.createJobNote).mockResolvedValue(note);

    const { result, queryClient } = renderHookWithQueryClient(() =>
      useCreateJobNoteMutation(),
    );
    const invalidateSpy = vi
      .spyOn(queryClient, "invalidateQueries")
      .mockImplementation(async () => undefined);

    await act(async () => {
      await result.current.mutateAsync({
        jobId: "job-1",
        input: {
          title: "Why applied",
          content: "Because it fits.",
        },
      });
    });

    expect(api.createJobNote).toHaveBeenCalledWith("job-1", {
      title: "Why applied",
      content: "Because it fits.",
    });
    expect(invalidateSpy).toHaveBeenCalledWith({
      queryKey: queryKeys.jobs.notes("job-1"),
    });
    expect(invalidateSpy).toHaveBeenCalledWith({
      queryKey: queryKeys.jobs.inProgressBoard(),
    });
    expect(invalidateSpy).toHaveBeenCalledWith({
      queryKey: queryKeys.careerOps.pipeline(),
    });
  });

  it("invalidates pipeline projections after updating a note", async () => {
    vi.mocked(api.updateJobNote).mockResolvedValue(noteFixture);
    const { queryClient, result } = renderHookWithQueryClient(() =>
      useUpdateJobNoteMutation(),
    );
    const invalidateSpy = vi
      .spyOn(queryClient, "invalidateQueries")
      .mockImplementation(async () => undefined);

    await act(async () => {
      await result.current.mutateAsync({
        jobId: "job-1",
        noteId: "note-1",
        input: { title: "Updated", content: "Updated content" },
      });
    });

    expect(invalidateSpy).toHaveBeenCalledWith({
      queryKey: queryKeys.jobs.notes("job-1"),
    });
    expect(invalidateSpy).toHaveBeenCalledWith({
      queryKey: queryKeys.jobs.inProgressBoard(),
    });
    expect(invalidateSpy).toHaveBeenCalledWith({
      queryKey: queryKeys.careerOps.pipeline(),
    });
  });

  it("invalidates pipeline projections after deleting a note", async () => {
    vi.mocked(api.deleteJobNote).mockResolvedValue(undefined);
    const { queryClient, result } = renderHookWithQueryClient(() =>
      useDeleteJobNoteMutation(),
    );
    const invalidateSpy = vi
      .spyOn(queryClient, "invalidateQueries")
      .mockImplementation(async () => undefined);

    await act(async () => {
      await result.current.mutateAsync({ jobId: "job-1", noteId: "note-1" });
    });

    expect(invalidateSpy).toHaveBeenCalledWith({
      queryKey: queryKeys.jobs.notes("job-1"),
    });
    expect(invalidateSpy).toHaveBeenCalledWith({
      queryKey: queryKeys.jobs.inProgressBoard(),
    });
    expect(invalidateSpy).toHaveBeenCalledWith({
      queryKey: queryKeys.careerOps.pipeline(),
    });
  });
});

const noteFixture: JobNote = {
  id: "note-1",
  jobId: "job-1",
  title: "Why applied",
  content: "Because it fits.",
  createdAt: "2026-01-01T00:00:00.000Z",
  updatedAt: "2026-01-01T00:00:00.000Z",
};
