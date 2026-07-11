import * as api from "@client/api";
import type { JobNote, UpdateJobNoteInput } from "@shared/types";
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

  type NoteMutationCase =
    | {
        name: "updating";
        mutate: { jobId: string; noteId: string; input: UpdateJobNoteInput };
        mock: () => void;
      }
    | {
        name: "deleting";
        mutate: { jobId: string; noteId: string };
        mock: () => void;
      };

  it.each<NoteMutationCase>([
    {
      name: "updating",
      mutate: {
        jobId: "job-1",
        noteId: "note-1",
        input: { title: "Updated", content: "Updated content" },
      },
      mock: () => vi.mocked(api.updateJobNote).mockResolvedValue(noteFixture),
    },
    {
      name: "deleting",
      mutate: { jobId: "job-1", noteId: "note-1" },
      mock: () => vi.mocked(api.deleteJobNote).mockResolvedValue(undefined),
    },
  ])("invalidates pipeline projections after $name a note", async (testCase) => {
    testCase.mock();
    const { queryClient, result } = renderHookWithQueryClient(() => {
      if (testCase.name === "updating") {
        return useUpdateJobNoteMutation();
      }

      return useDeleteJobNoteMutation();
    });
    const invalidateSpy = vi
      .spyOn(queryClient, "invalidateQueries")
      .mockImplementation(async () => undefined);

    await act(async () => {
      if (testCase.name === "updating") {
        await result.current.mutateAsync(testCase.mutate);
        return;
      }

      await result.current.mutateAsync(testCase.mutate);
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
