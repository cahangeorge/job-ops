import type { GenerateInterviewPrepResult } from "@client/api";
import * as api from "@client/api";
import { showErrorToast } from "@client/lib/error-toast";
import { queryKeys } from "@client/lib/queryKeys";
import type { InterviewStory, Job } from "@shared/types.js";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { BookOpenCheck, FileText, Loader2, Save, Sparkles } from "lucide-react";
import type React from "react";
import { useMemo, useState } from "react";
import { toast } from "sonner";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Textarea } from "@/components/ui/textarea";

const DEFAULT_TARGET_QUESTIONS =
  "Tell me about yourself.\nWhy this company and role?\nDescribe a high-impact project.\nDescribe a conflict, failure, or incident and what you learned.";

function storyToMarkdown(story: InterviewStory): string {
  return [
    `### ${story.title}`,
    story.skills ? `Skills: ${story.skills}` : null,
    story.tags ? `Tags: ${story.tags}` : null,
    story.isMasterStory ? "Master story: yes" : null,
    `- Situation: ${story.situation}`,
    `- Task: ${story.task}`,
    `- Action: ${story.action}`,
    `- Result: ${story.result}`,
    story.reflection ? `- Reflection: ${story.reflection}` : null,
  ]
    .filter(Boolean)
    .join("\n");
}

function answerOutlinesToMarkdown(
  outlines: GenerateInterviewPrepResult["answerOutlines"] | undefined,
): string {
  if (!outlines?.length) return "No generated answer outlines yet.";

  return outlines
    .map((outline) =>
      [
        `### ${outline.question}`,
        outline.outline,
        outline.storyIds.length > 0
          ? `Story IDs: ${outline.storyIds.join(", ")}`
          : null,
      ]
        .filter(Boolean)
        .join("\n"),
    )
    .join("\n\n");
}

function interviewerQuestionsToMarkdown(
  questions: string[] | undefined,
): string {
  if (!questions?.length) return "No generated interviewer questions yet.";
  return questions.map((question) => `- ${question}`).join("\n");
}

export function buildInterviewPrepNoteContent(input: {
  job: Job;
  prepGuidance: string;
  targetQuestions: string;
  stories: InterviewStory[];
  generatedPrep?: GenerateInterviewPrepResult | null;
}): string {
  const { job, prepGuidance, targetQuestions, stories, generatedPrep } = input;
  const storySection =
    stories.length > 0
      ? stories.map(storyToMarkdown).join("\n\n")
      : "No Story Bank entries selected yet.";

  return [
    `# Interview prep — ${job.employer}`,
    "",
    `Role: ${job.title}`,
    job.location ? `Location: ${job.location}` : null,
    job.jobUrl ? `Posting: ${job.jobUrl}` : null,
    "",
    "## Role-specific guidance",
    prepGuidance.trim() ||
      "No generated interview guidance is available yet. Use the job description, evaluation, and Story Bank entries below to prepare.",
    "",
    "## Target questions",
    targetQuestions.trim() || DEFAULT_TARGET_QUESTIONS,
    "",
    "## Generated answer outlines",
    answerOutlinesToMarkdown(generatedPrep?.answerOutlines),
    "",
    "## Questions to ask the interviewer",
    interviewerQuestionsToMarkdown(generatedPrep?.interviewerQuestions),
    "",
    "## Reusable STAR+R stories",
    storySection,
    "",
    "## Prep checklist",
    "- [ ] Prepare a 60-second intro tailored to this employer.",
    "- [ ] Map each target question to one STAR+R story.",
    "- [ ] Prepare two role-specific technical examples.",
    "- [ ] Prepare questions for the interviewer about team, scope, and success metrics.",
  ]
    .filter((line): line is string => line !== null)
    .join("\n");
}

type InterviewPrepPanelProps = {
  job: Job;
};

export const InterviewPrepPanel: React.FC<InterviewPrepPanelProps> = ({ job }) => {
  const queryClient = useQueryClient();
  const [selectedStoryIds, setSelectedStoryIds] = useState<Set<string>>(
    () => new Set(),
  );
  const [prepGuidance, setPrepGuidance] = useState(
    job.evaluationInterviewPrep?.trim() ||
      "Review the job description, company context, and saved proof points before the interview.",
  );
  const [targetQuestions, setTargetQuestions] = useState(DEFAULT_TARGET_QUESTIONS);
  const [generatedPrep, setGeneratedPrep] =
    useState<GenerateInterviewPrepResult | null>(null);

  const storiesQuery = useQuery({
    queryKey: queryKeys.storyBank.list(),
    queryFn: () => api.getInterviewStories(),
    staleTime: 30_000,
  });

  const stories = storiesQuery.data?.stories ?? [];
  const selectedStories = useMemo(
    () => stories.filter((story) => selectedStoryIds.has(story.id)),
    [selectedStoryIds, stories],
  );

  const generateMutation = useMutation({
    mutationFn: () =>
      api.generateInterviewPrep({
        jobTitle: job.title,
        employer: job.employer,
        jobDescription: job.jobDescription,
        resumeSummary: job.tailoredSummary || job.suitabilityReason,
        companyResearch: job.companyDescription,
        evaluationInterviewPrep: prepGuidance,
        targetQuestions,
        stories: stories.map((story) => ({
          id: story.id,
          title: story.title,
          situation: story.situation,
          task: story.task,
          action: story.action,
          result: story.result,
          reflection: story.reflection,
          skills: story.skills,
          tags: story.tags,
          isMasterStory: story.isMasterStory,
        })),
      }),
    onSuccess: (result) => {
      setGeneratedPrep(result);
      setPrepGuidance(result.prepGuidance);
      setTargetQuestions(result.targetQuestions.join("\n"));
      setSelectedStoryIds(new Set(result.recommendedStoryIds));
      toast.success("Interview prep generated");
    },
    onError: (error) => {
      showErrorToast(error, "Failed to generate interview prep");
    },
  });

  const saveMutation = useMutation({
    mutationFn: () =>
      api.createJobNote(job.id, {
        title: `Interview prep — ${job.employer}`,
        content: buildInterviewPrepNoteContent({
          job,
          prepGuidance,
          targetQuestions,
          stories: selectedStories,
          generatedPrep,
        }),
      }),
    onSuccess: async (note) => {
      const usageResults = await Promise.allSettled(
        selectedStories.map((story) =>
          api.recordStoryUsage({
            storyId: story.id,
            jobId: job.id,
            usageKind: "interview_prep",
            provenance: { noteId: note.id },
          }),
        ),
      );
      await queryClient.invalidateQueries({
        queryKey: queryKeys.jobs.notes(job.id),
      });
      await queryClient.invalidateQueries({
        queryKey: queryKeys.storyBank.all,
      });
      if (usageResults.some((result) => result.status === "rejected")) {
        toast.warning(
          "Interview prep saved to notes, but Story Bank usage tracking failed",
        );
      }
      toast.success("Interview prep saved to notes");
    },
    onError: (error) => {
      showErrorToast(error, "Failed to save interview prep");
    },
  });

  const toggleStory = (storyId: string) => {
    setSelectedStoryIds((current) => {
      const next = new Set(current);
      if (next.has(storyId)) {
        next.delete(storyId);
      } else {
        next.add(storyId);
      }
      return next;
    });
  };

  return (
    <section data-testid="interview-prep-panel" className="space-y-4">
      <Card className="border-border/50">
        <CardHeader>
          <div className="flex flex-wrap items-start justify-between gap-3">
            <div>
              <CardTitle className="flex items-center gap-2 text-base">
                <BookOpenCheck className="h-4 w-4" />
                Interview Prep
              </CardTitle>
              <CardDescription>
                Build a job-specific interview plan from CareerOps evaluation data and reusable Story Bank proof points.
              </CardDescription>
            </div>
            <div className="flex flex-wrap items-center gap-2">
              <Badge variant="secondary">{selectedStories.length} stories selected</Badge>
              <Button
                type="button"
                size="sm"
                variant="outline"
                onClick={() => generateMutation.mutate()}
                disabled={generateMutation.isPending || storiesQuery.isLoading}
              >
                {generateMutation.isPending ? (
                  <Loader2 className="mr-1.5 h-3.5 w-3.5 animate-spin" />
                ) : (
                  <Sparkles className="mr-1.5 h-3.5 w-3.5" />
                )}
                Generate prep with AI
              </Button>
            </div>
          </div>
        </CardHeader>
        <CardContent className="space-y-5">
          <div className="space-y-2">
            <label htmlFor="interview-prep-guidance" className="text-sm font-medium">
              Role-specific guidance
            </label>
            <Textarea
              id="interview-prep-guidance"
              value={prepGuidance}
              onChange={(event) => setPrepGuidance(event.target.value)}
              className="min-h-28"
            />
          </div>

          <div className="space-y-2">
            <label htmlFor="interview-target-questions" className="text-sm font-medium">
              Target questions
            </label>
            <Textarea
              id="interview-target-questions"
              value={targetQuestions}
              onChange={(event) => setTargetQuestions(event.target.value)}
              className="min-h-28"
            />
          </div>

          {generatedPrep && (
            <div className="grid gap-3 md:grid-cols-2">
              <div className="rounded-xl border border-border/60 bg-background/30 p-4">
                <h3 className="text-sm font-semibold">Generated answer outlines</h3>
                <div className="mt-3 space-y-3 text-sm text-muted-foreground">
                  {generatedPrep.answerOutlines.map((outline) => (
                    <div key={outline.question} className="space-y-1">
                      <div className="font-medium text-foreground">
                        {outline.question}
                      </div>
                      <p>{outline.outline}</p>
                      {outline.storyIds.length > 0 && (
                        <p className="text-xs">Stories: {outline.storyIds.join(", ")}</p>
                      )}
                    </div>
                  ))}
                </div>
              </div>
              <div className="rounded-xl border border-border/60 bg-background/30 p-4">
                <h3 className="text-sm font-semibold">Questions to ask</h3>
                <ul className="mt-3 list-disc space-y-2 pl-5 text-sm text-muted-foreground">
                  {generatedPrep.interviewerQuestions.map((question) => (
                    <li key={question}>{question}</li>
                  ))}
                </ul>
              </div>
            </div>
          )}

          <div className="space-y-3">
            <div className="flex items-center justify-between gap-3">
              <h3 className="text-sm font-semibold">Reusable Story Bank entries</h3>
              <Button variant="outline" size="sm" asChild>
                <a href="/story-bank">
                  <FileText className="mr-1.5 h-3.5 w-3.5" />
                  Open Story Bank
                </a>
              </Button>
            </div>

            {storiesQuery.isLoading ? (
              <div className="rounded-lg border border-dashed border-border/60 p-4 text-sm text-muted-foreground">
                Loading Story Bank entries...
              </div>
            ) : stories.length === 0 ? (
              <div className="rounded-lg border border-dashed border-border/60 p-4 text-sm text-muted-foreground">
                No Story Bank entries yet. Add STAR+R stories before the interview to reuse them here.
              </div>
            ) : (
              <div className="grid gap-3 md:grid-cols-2">
                {stories.map((story) => {
                  const checked = selectedStoryIds.has(story.id);
                  return (
                    <label
                      key={story.id}
                      className="flex cursor-pointer gap-3 rounded-xl border border-border/60 bg-background/30 p-3 text-sm transition hover:bg-muted/20"
                    >
                      <input
                        type="checkbox"
                        className="mt-1 h-4 w-4 shrink-0"
                        checked={checked}
                        aria-label={`Use story ${story.title}`}
                        onChange={() => toggleStory(story.id)}
                      />
                      <span className="min-w-0 space-y-2">
                        <span className="block font-medium">{story.title}</span>
                        <span className="block text-muted-foreground">
                          {story.situation}
                        </span>
                        <span className="flex flex-wrap gap-2">
                          {story.isMasterStory ? <Badge>Master story</Badge> : null}
                          {story.skills ? (
                            <Badge variant="secondary">{story.skills}</Badge>
                          ) : null}
                          {story.tags ? <Badge variant="outline">{story.tags}</Badge> : null}
                        </span>
                      </span>
                    </label>
                  );
                })}
              </div>
            )}
          </div>

          <div className="flex flex-wrap items-center justify-between gap-3 rounded-xl border border-border/50 bg-muted/10 p-3">
            <p className="text-sm text-muted-foreground">
              Saves a markdown interview prep note with selected stories and a checklist.
            </p>
            <Button
              type="button"
              onClick={() => saveMutation.mutate()}
              disabled={saveMutation.isPending}
            >
              {saveMutation.isPending ? (
                <Loader2 className="mr-1.5 h-3.5 w-3.5 animate-spin" />
              ) : (
                <Save className="mr-1.5 h-3.5 w-3.5" />
              )}
              Save prep to notes
            </Button>
          </div>
        </CardContent>
      </Card>
    </section>
  );
};
