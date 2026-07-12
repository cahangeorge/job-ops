import { useMutation, useQuery } from "@tanstack/react-query";
import type React from "react";
import { useMemo, useState } from "react";
import * as api from "@/client/api";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { formatDateTime } from "@/lib/utils";

const MAX_STORIES = 20;

function lifecycleLabel(state: api.JobDossierLifecycleState): string {
  return state.replace(/_/g, " ");
}

export const JobDossierPanel: React.FC<{ jobId: string }> = ({ jobId }) => {
  const [content, setContent] = useState("");
  const [selectedStoryIds, setSelectedStoryIds] = useState<string[]>([]);
  const [submitError, setSubmitError] = useState<string | null>(null);
  const dossierQuery = useQuery({
    queryKey: ["jobs", "dossier", jobId],
    queryFn: () => api.getJobDossier(jobId),
  });
  const storiesQuery = useQuery({
    queryKey: ["story-bank", "list"],
    queryFn: () => api.getInterviewStories(),
    staleTime: 30_000,
  });
  const resumeQuery = useQuery({
    queryKey: ["design-resume", "status"],
    queryFn: api.getDesignResumeStatus,
    staleTime: 30_000,
  });
  const stories = storiesQuery.data?.stories ?? [];
  const selectedStories = useMemo(
    () => stories.filter((story) => selectedStoryIds.includes(story.id)),
    [selectedStoryIds, stories],
  );
  const createDraft = useMutation({
    mutationFn: () =>
      api.createJobDossierDraft(jobId, {
        content: content.trim(),
        storyIds: selectedStoryIds,
      }),
    onSuccess: async () => {
      setContent("");
      setSubmitError(null);
      await dossierQuery.refetch();
    },
    onError: (error) =>
      setSubmitError(
        error instanceof Error
          ? error.message
          : "Could not save draft revision.",
      ),
  });

  const toggleStory = (storyId: string) => {
    setSelectedStoryIds((current) => {
      if (current.includes(storyId))
        return current.filter((id) => id !== storyId);
      return current.length < MAX_STORIES ? [...current, storyId] : current;
    });
  };

  if (dossierQuery.isLoading) {
    return (
      <section
        aria-busy="true"
        className="rounded-xl border border-border/50 p-4"
      >
        Loading dossier…
      </section>
    );
  }
  if (dossierQuery.error || !dossierQuery.data) {
    return (
      <section
        role="alert"
        className="rounded-xl border border-destructive/50 p-4"
      >
        Could not load application dossier.{" "}
        <Button variant="link" onClick={() => void dossierQuery.refetch()}>
          Try again
        </Button>
      </section>
    );
  }

  const dossier = dossierQuery.data;
  return (
    <section data-testid="job-dossier-panel" className="space-y-4">
      <header className="rounded-xl border border-border/50 bg-card/85 p-4">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div>
            <h2 className="text-base font-semibold">
              Human application dossier
            </h2>
            <p className="mt-1 text-sm text-muted-foreground">
              Draft a human-authored application record. Saving creates an
              immutable historical revision.
            </p>
          </div>
          <Badge variant="outline">
            Lifecycle: {lifecycleLabel(dossier.dossier.lifecycleState)}
          </Badge>
        </div>
        <p className="mt-3 text-xs text-muted-foreground">
          Posting snapshot{" "}
          {formatDateTime(dossier.posting.retrievedAt) ??
            dossier.posting.retrievedAt}{" "}
          · hash {dossier.posting.hashPrefix}
        </p>
      </header>

      <section className="rounded-xl border border-border/50 bg-card/75 p-4">
        <h3 className="text-sm font-semibold">Mutable human draft</h3>
        {!resumeQuery.isLoading && !resumeQuery.data?.exists ? (
          <p className="mt-2 text-sm text-amber-700 dark:text-amber-300">
            Resume Studio is required before this draft can be saved. Import a
            Design Resume, then return here.
          </p>
        ) : null}
        <label
          className="mt-3 block text-sm font-medium"
          htmlFor="dossier-human-draft"
        >
          Human draft
        </label>
        <Textarea
          id="dossier-human-draft"
          value={content}
          onChange={(event) => setContent(event.target.value)}
          className="mt-2 min-h-40"
          placeholder="Write the application draft you want preserved…"
        />
        {submitError ? (
          <p role="alert" className="mt-2 text-sm text-destructive">
            {submitError}
          </p>
        ) : null}
        <div className="mt-4 flex items-center justify-between gap-3">
          <span className="text-xs text-muted-foreground">
            {selectedStoryIds.length} of {MAX_STORIES} selected
          </span>
          <Button
            onClick={() => createDraft.mutate()}
            disabled={!content.trim() || createDraft.isPending}
          >
            Save immutable revision
          </Button>
        </div>
      </section>

      <section className="rounded-xl border border-border/50 bg-card/75 p-4">
        <h3 className="text-sm font-semibold">Story Bank evidence</h3>
        {storiesQuery.isLoading ? (
          <p className="mt-2 text-sm text-muted-foreground">
            Loading tenant Story Bank…
          </p>
        ) : null}
        {storiesQuery.error ? (
          <p role="alert" className="mt-2 text-sm text-destructive">
            Could not load Story Bank evidence.
          </p>
        ) : null}
        {!storiesQuery.isLoading && stories.length === 0 ? (
          <p className="mt-2 text-sm text-muted-foreground">
            No Story Bank records are available for this workspace.
          </p>
        ) : null}
        <div className="mt-3 space-y-2">
          {stories.map((story) => {
            const selected = selectedStoryIds.includes(story.id);
            return (
              <label
                className="flex items-start gap-2 text-sm"
                htmlFor={`dossier-story-${story.id}`}
                key={story.id}
              >
                <input
                  id={`dossier-story-${story.id}`}
                  aria-label={`Use ${story.title}`}
                  type="checkbox"
                  checked={selected}
                  disabled={!selected && selectedStoryIds.length >= MAX_STORIES}
                  onChange={() => toggleStory(story.id)}
                />
                <span>
                  <span className="font-medium">{story.title}</span>
                  {story.result ? (
                    <span className="block text-xs text-muted-foreground">
                      {story.result.slice(0, 180)}
                    </span>
                  ) : null}
                </span>
              </label>
            );
          })}
        </div>
        {selectedStories.length > 0 ? (
          <div className="mt-3 flex flex-wrap gap-2">
            {selectedStories.map((story) => (
              <Button
                key={story.id}
                size="sm"
                variant="outline"
                onClick={() => toggleStory(story.id)}
                aria-label={`Remove ${story.title}`}
              >
                {story.title} ×
              </Button>
            ))}
          </div>
        ) : null}
      </section>

      <section className="rounded-xl border border-border/50 bg-card/75 p-4">
        <h3 className="text-sm font-semibold">
          Immutable historical revisions
        </h3>
        {dossier.revisions.length === 0 ? (
          <p className="mt-2 text-sm text-muted-foreground">
            No saved revisions yet.
          </p>
        ) : (
          <div className="mt-3 space-y-3">
            {dossier.revisions.map((revision) => (
              <article
                key={revision.id}
                className="rounded-lg border border-border/50 p-3"
              >
                <div className="flex items-center justify-between gap-3">
                  <span className="font-medium">
                    Revision {revision.revisionNumber}
                  </span>
                  <span className="text-xs text-muted-foreground">
                    {formatDateTime(revision.createdAt) ?? revision.createdAt}
                  </span>
                </div>
                {revision.resumeRevision !== null ? (
                  <p className="mt-2 text-xs text-muted-foreground">
                    Design Resume revision {revision.resumeRevision}
                  </p>
                ) : null}
                {revision.stories.map((story) => (
                  <p className="mt-2 text-sm" key={story.id}>
                    <span className="font-medium">{story.title}</span>
                    <span className="text-muted-foreground">
                      {" "}
                      — {story.excerpt}
                    </span>
                  </p>
                ))}
                <p className="mt-3 whitespace-pre-wrap text-sm">
                  {revision.content}
                </p>
              </article>
            ))}
          </div>
        )}
        {dossier.hasMore.revisions ? (
          <p className="mt-3 text-xs text-muted-foreground">
            Showing the 20 newest revisions.
          </p>
        ) : null}
      </section>

      <section className="rounded-xl border border-border/50 bg-card/75 p-4">
        <h3 className="text-sm font-semibold">Submitted artifacts</h3>
        {dossier.submittedArtifacts.length === 0 ? (
          <p className="mt-2 text-sm text-muted-foreground">
            No submitted artifacts yet.
          </p>
        ) : (
          <ul className="mt-3 space-y-2">
            {dossier.submittedArtifacts.map((artifact) => (
              <li className="text-sm" key={artifact.id}>
                {artifact.mediaType} · {artifact.byteSize} bytes · QA{" "}
                {artifact.qaResult} ·{" "}
                {formatDateTime(artifact.createdAt) ?? artifact.createdAt}
              </li>
            ))}
          </ul>
        )}
        {dossier.hasMore.submittedArtifacts ? (
          <p className="mt-3 text-xs text-muted-foreground">
            Showing the 20 newest submitted artifacts.
          </p>
        ) : null}
      </section>
    </section>
  );
};
