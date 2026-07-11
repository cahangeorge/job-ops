import * as api from "@client/api";
import { PageHeader, PageMain } from "@client/components/layout";
import { queryKeys } from "@client/lib/queryKeys";
import type { CreateInterviewStoryInput } from "@shared/types";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { BookOpenCheck, Trash2 } from "lucide-react";
import type React from "react";
import { useMemo, useState } from "react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Checkbox } from "@/components/ui/checkbox";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";

const EMPTY_STORY_DRAFT: CreateInterviewStoryInput = {
  title: "",
  situation: "",
  task: "",
  action: "",
  result: "",
  reflection: "",
  skills: "",
  tags: "",
  isMasterStory: false,
};

type StoryDraftKey = keyof CreateInterviewStoryInput;

function normalizeDraft(
  draft: CreateInterviewStoryInput,
): CreateInterviewStoryInput {
  return {
    title: draft.title.trim(),
    situation: draft.situation.trim(),
    task: draft.task.trim(),
    action: draft.action.trim(),
    result: draft.result.trim(),
    reflection: draft.reflection?.trim() || null,
    skills: draft.skills?.trim() || null,
    tags: draft.tags?.trim() || null,
    isMasterStory: draft.isMasterStory === true,
  };
}

function StoryField(props: {
  id: StoryDraftKey;
  label: string;
  value: string;
  onChange: (key: StoryDraftKey, value: string) => void;
  required?: boolean;
  multiline?: boolean;
}) {
  const inputId = `story-${props.id}`;
  return (
    <div className="space-y-1.5">
      <label className="text-sm font-medium" htmlFor={inputId}>
        {props.label}
      </label>
      {props.multiline ? (
        <Textarea
          id={inputId}
          value={props.value}
          required={props.required}
          onChange={(event) => props.onChange(props.id, event.target.value)}
        />
      ) : (
        <Input
          id={inputId}
          value={props.value}
          required={props.required}
          onChange={(event) => props.onChange(props.id, event.target.value)}
        />
      )}
    </div>
  );
}

function StoryCard({
  story,
  availableTags,
  onDelete,
  onToggleTag,
  deleting,
  tagPending,
}: {
  story: api.StoryBankStory;
  availableTags: api.StoryBankTag[];
  onDelete: (story: api.StoryBankStory) => void;
  onToggleTag: (storyId: string, tagId: string, assigned: boolean) => void;
  deleting: boolean;
  tagPending: boolean;
}) {
  return (
    <Card>
      <CardHeader className="pb-3">
        <div className="flex items-start justify-between gap-4">
          <div className="space-y-2">
            <CardTitle className="text-lg">{story.title}</CardTitle>
            <div className="flex flex-wrap gap-2">
              {story.isMasterStory ? <Badge>Master story</Badge> : null}
              {story.skills ? (
                <Badge variant="secondary">{story.skills}</Badge>
              ) : null}
              {story.tags ? (
                <Badge variant="outline">{story.tags}</Badge>
              ) : null}
              {(story.storyTags ?? []).map((tag) => (
                <Badge key={tag.id} variant="outline">
                  {tag.name}
                </Badge>
              ))}
            </div>
          </div>
          <Button
            type="button"
            variant="ghost"
            size="sm"
            disabled={deleting}
            aria-label={`Delete ${story.title}`}
            onClick={() => onDelete(story)}
          >
            <Trash2 className="h-4 w-4" />
          </Button>
        </div>
      </CardHeader>
      <CardContent className="space-y-3 text-sm">
        <p>
          <span className="font-semibold">Situation:</span> {story.situation}
        </p>
        <p>
          <span className="font-semibold">Task:</span> {story.task}
        </p>
        <p>
          <span className="font-semibold">Action:</span> {story.action}
        </p>
        <p>
          <span className="font-semibold">Result:</span> {story.result}
        </p>
        {story.reflection ? (
          <p>
            <span className="font-semibold">Reflection:</span>{" "}
            {story.reflection}
          </p>
        ) : null}
        <p className="text-muted-foreground">
          Used {story.usageCount ?? 0} time{story.usageCount === 1 ? "" : "s"}
          {story.lastUsedAt
            ? ` · last used ${new Date(story.lastUsedAt).toLocaleDateString()}`
            : ""}
        </p>
        {availableTags.length > 0 ? (
          <fieldset
            className="flex flex-wrap gap-3"
            aria-label={`Tags for ${story.title}`}
          >
            {availableTags.map((tag) => {
              const assigned = (story.storyTags ?? []).some(
                (assignedTag) => assignedTag.id === tag.id,
              );
              return (
                <label
                  className="flex items-center gap-1.5 text-xs"
                  htmlFor={`story-${story.id}-tag-${tag.id}`}
                  key={tag.id}
                >
                  <Checkbox
                    id={`story-${story.id}-tag-${tag.id}`}
                    checked={assigned}
                    disabled={tagPending}
                    onCheckedChange={() =>
                      onToggleTag(story.id, tag.id, assigned)
                    }
                  />
                  {tag.name}
                </label>
              );
            })}
          </fieldset>
        ) : null}
      </CardContent>
    </Card>
  );
}

export function StoryBankPage() {
  const queryClient = useQueryClient();
  const [draft, setDraft] =
    useState<CreateInterviewStoryInput>(EMPTY_STORY_DRAFT);
  const [formError, setFormError] = useState<string | null>(null);
  const [newTagName, setNewTagName] = useState("");
  const [selectedTagIds, setSelectedTagIds] = useState<string[]>([]);

  const storiesQuery = useQuery({
    queryKey: [...queryKeys.storyBank.list(), selectedTagIds],
    queryFn: () => api.getInterviewStories({ tagIds: selectedTagIds }),
    staleTime: 30_000,
  });
  const tagsQuery = useQuery({
    queryKey: [...queryKeys.storyBank.all, "tags"],
    queryFn: api.getStoryTags,
    staleTime: 30_000,
  });

  const stories = useMemo(
    () => storiesQuery.data?.stories ?? [],
    [storiesQuery.data?.stories],
  );

  const createMutation = useMutation({
    mutationFn: api.createInterviewStory,
    onSuccess: async () => {
      setDraft(EMPTY_STORY_DRAFT);
      setFormError(null);
      await queryClient.invalidateQueries({
        queryKey: queryKeys.storyBank.all,
      });
    },
    onError: (error) => {
      setFormError(
        error instanceof Error ? error.message : "Could not save story.",
      );
    },
  });

  const deleteMutation = useMutation({
    mutationFn: api.deleteInterviewStory,
    onSuccess: async () => {
      await queryClient.invalidateQueries({
        queryKey: queryKeys.storyBank.all,
      });
    },
    onError: (error) => {
      setFormError(
        error instanceof Error ? error.message : "Could not delete story.",
      );
    },
  });

  const createTagMutation = useMutation({
    mutationFn: api.createStoryTag,
    onSuccess: async () => {
      setNewTagName("");
      setFormError(null);
      await queryClient.invalidateQueries({
        queryKey: queryKeys.storyBank.all,
      });
    },
    onError: (error) =>
      setFormError(
        error instanceof Error ? error.message : "Could not save tag.",
      ),
  });
  const toggleTagMutation = useMutation({
    mutationFn: ({
      storyId,
      tagId,
      assigned,
    }: {
      storyId: string;
      tagId: string;
      assigned: boolean;
    }) =>
      assigned
        ? api.unassignStoryTag(storyId, tagId)
        : api.assignStoryTag(storyId, tagId),
    onSuccess: async () =>
      queryClient.invalidateQueries({ queryKey: queryKeys.storyBank.all }),
    onError: (error) =>
      setFormError(
        error instanceof Error ? error.message : "Could not update story tag.",
      ),
  });

  const handleFieldChange = (key: StoryDraftKey, value: string) => {
    setDraft((current) => ({ ...current, [key]: value }));
  };

  const handleSubmit = (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    const input = normalizeDraft(draft);
    if (
      !input.title ||
      !input.situation ||
      !input.task ||
      !input.action ||
      !input.result
    ) {
      setFormError("Title, situation, task, action, and result are required.");
      return;
    }
    createMutation.mutate(input);
  };

  const handleDelete = (story: api.StoryBankStory) => {
    if (!window.confirm(`Delete story '${story.title}'?`)) return;
    deleteMutation.mutate(story.id);
  };

  const handleTagSubmit = (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    const name = newTagName.trim();
    if (!name) return;
    createTagMutation.mutate(name);
  };

  return (
    <>
      <PageHeader
        icon={BookOpenCheck}
        title="Story Bank"
        subtitle="Reusable STAR+R proof points for interview prep, cover letters, and job evaluations."
        badge={`${stories.length} stories`}
      />
      <PageMain>
        <div className="grid gap-6 lg:grid-cols-[minmax(0,1fr)_minmax(360px,420px)]">
          <section className="space-y-4">
            <Card>
              <CardContent className="space-y-3 pt-6">
                <fieldset
                  className="flex flex-wrap gap-2"
                  aria-label="Filter stories by tag"
                >
                  {(tagsQuery.data?.tags ?? []).map((tag) => {
                    const selected = selectedTagIds.includes(tag.id);
                    return (
                      <Button
                        key={tag.id}
                        type="button"
                        variant={selected ? "default" : "outline"}
                        size="sm"
                        onClick={() =>
                          setSelectedTagIds((current) =>
                            selected
                              ? current.filter((id) => id !== tag.id)
                              : [...current, tag.id],
                          )
                        }
                      >
                        {tag.name}
                      </Button>
                    );
                  })}
                </fieldset>
                <form className="flex gap-2" onSubmit={handleTagSubmit}>
                  <Input
                    aria-label="New tag name"
                    value={newTagName}
                    maxLength={64}
                    onChange={(event) => setNewTagName(event.target.value)}
                    placeholder="Add tag"
                  />
                  <Button
                    type="submit"
                    variant="outline"
                    disabled={createTagMutation.isPending}
                  >
                    {createTagMutation.isPending ? "Adding..." : "Add tag"}
                  </Button>
                </form>
              </CardContent>
            </Card>
            {storiesQuery.isLoading ? (
              <Card>
                <CardContent className="pt-6 text-sm text-muted-foreground">
                  Loading interview stories...
                </CardContent>
              </Card>
            ) : stories.length > 0 ? (
              stories.map((story) => (
                <StoryCard
                  key={story.id}
                  story={story}
                  availableTags={tagsQuery.data?.tags ?? []}
                  deleting={deleteMutation.isPending}
                  tagPending={toggleTagMutation.isPending}
                  onDelete={handleDelete}
                  onToggleTag={(storyId, tagId, assigned) =>
                    toggleTagMutation.mutate({ storyId, tagId, assigned })
                  }
                />
              ))
            ) : (
              <Card>
                <CardContent className="pt-6 text-sm text-muted-foreground">
                  No stories yet. Capture a proof point with the form on this
                  page.
                </CardContent>
              </Card>
            )}
          </section>

          <Card>
            <CardHeader>
              <CardTitle>Add STAR+R story</CardTitle>
              <CardDescription>
                Capture the situation, task, action, result, and optional
                reflection.
              </CardDescription>
            </CardHeader>
            <CardContent>
              <form className="space-y-4" onSubmit={handleSubmit}>
                <StoryField
                  id="title"
                  label="Title"
                  value={draft.title}
                  required
                  onChange={handleFieldChange}
                />
                <StoryField
                  id="situation"
                  label="Situation"
                  value={draft.situation}
                  required
                  multiline
                  onChange={handleFieldChange}
                />
                <StoryField
                  id="task"
                  label="Task"
                  value={draft.task}
                  required
                  multiline
                  onChange={handleFieldChange}
                />
                <StoryField
                  id="action"
                  label="Action"
                  value={draft.action}
                  required
                  multiline
                  onChange={handleFieldChange}
                />
                <StoryField
                  id="result"
                  label="Result"
                  value={draft.result}
                  required
                  multiline
                  onChange={handleFieldChange}
                />
                <StoryField
                  id="reflection"
                  label="Reflection"
                  value={draft.reflection ?? ""}
                  multiline
                  onChange={handleFieldChange}
                />
                <StoryField
                  id="skills"
                  label="Skills"
                  value={draft.skills ?? ""}
                  onChange={handleFieldChange}
                />
                <StoryField
                  id="tags"
                  label="Tags"
                  value={draft.tags ?? ""}
                  onChange={handleFieldChange}
                />
                <label
                  className="flex items-center gap-2 text-sm"
                  htmlFor="story-isMasterStory"
                >
                  <Checkbox
                    id="story-isMasterStory"
                    checked={draft.isMasterStory}
                    onCheckedChange={(checked) =>
                      setDraft((current) => ({
                        ...current,
                        isMasterStory: checked === true,
                      }))
                    }
                  />
                  Master story
                </label>
                {formError ? (
                  <p className="rounded-md border border-destructive/40 bg-destructive/10 px-3 py-2 text-sm text-destructive">
                    {formError}
                  </p>
                ) : null}
                <Button type="submit" disabled={createMutation.isPending}>
                  {createMutation.isPending ? "Saving..." : "Save story"}
                </Button>
              </form>
            </CardContent>
          </Card>
        </div>
      </PageMain>
    </>
  );
}
