import type { JsonSchemaDefinition } from "./llm/types";
import { createConfiguredLlmService, resolveLlmModel } from "./modelSelection";

export interface InterviewPrepStoryInput {
  id: string;
  title: string;
  situation: string;
  task: string;
  action: string;
  result: string;
  reflection?: string | null;
  skills?: string | null;
  tags?: string | null;
  isMasterStory?: boolean;
}

export interface InterviewPrepInput {
  jobTitle: string;
  employer: string;
  jobDescription?: string | null;
  resumeSummary?: string | null;
  companyResearch?: string | null;
  evaluationInterviewPrep?: string | null;
  targetQuestions?: string | null;
  stories?: InterviewPrepStoryInput[];
}

export interface InterviewPrepAnswerOutline {
  question: string;
  outline: string;
  storyIds: string[];
}

export interface InterviewPrepResult {
  prepGuidance: string;
  targetQuestions: string[];
  answerOutlines: InterviewPrepAnswerOutline[];
  recommendedStoryIds: string[];
  interviewerQuestions: string[];
}

const INTERVIEW_PREP_SCHEMA: JsonSchemaDefinition = {
  name: "interview_prep",
  schema: {
    type: "object",
    properties: {
      prepGuidance: { type: "string" },
      targetQuestions: { type: "array", items: { type: "string" } },
      answerOutlines: {
        type: "array",
        items: {
          type: "object",
          properties: {
            question: { type: "string" },
            outline: { type: "string" },
            storyIds: { type: "array", items: { type: "string" } },
          },
          required: ["question", "outline", "storyIds"],
          additionalProperties: false,
        },
      },
      recommendedStoryIds: { type: "array", items: { type: "string" } },
      interviewerQuestions: { type: "array", items: { type: "string" } },
    },
    required: [
      "prepGuidance",
      "targetQuestions",
      "answerOutlines",
      "recommendedStoryIds",
      "interviewerQuestions",
    ],
    additionalProperties: false,
  },
};

export async function generateInterviewPrep(
  input: InterviewPrepInput,
): Promise<InterviewPrepResult> {
  const model = await resolveLlmModel("default");
  const prompt = buildInterviewPrepPrompt(input);
  const llm = await createConfiguredLlmService("default");

  const result = await llm.callJson<InterviewPrepResult>({
    model,
    messages: [{ role: "user", content: prompt }],
    jsonSchema: INTERVIEW_PREP_SCHEMA,
    maxRetries: 1,
  });

  if (!result.success) {
    throw new Error(`Interview prep generation failed: ${result.error}`);
  }

  const validStoryIds = new Set((input.stories ?? []).map((story) => story.id));
  const normalizeStoryIds = (ids: unknown): string[] => {
    if (!Array.isArray(ids)) return [];
    const normalized = ids.filter(
      (id): id is string =>
        typeof id === "string" &&
        id.trim().length > 0 &&
        (validStoryIds.size === 0 || validStoryIds.has(id)),
    );
    return Array.from(new Set(normalized));
  };

  return {
    prepGuidance: result.data.prepGuidance?.trim() ?? "",
    targetQuestions: normalizeStringArray(result.data.targetQuestions),
    answerOutlines: (result.data.answerOutlines ?? []).map((outline) => ({
      question: outline.question?.trim() ?? "",
      outline: outline.outline?.trim() ?? "",
      storyIds: normalizeStoryIds(outline.storyIds),
    })),
    recommendedStoryIds: normalizeStoryIds(result.data.recommendedStoryIds),
    interviewerQuestions: normalizeStringArray(
      result.data.interviewerQuestions,
    ),
  };
}

function normalizeStringArray(values: unknown): string[] {
  if (!Array.isArray(values)) return [];
  return values
    .filter((value): value is string => typeof value === "string")
    .map((value) => value.trim())
    .filter(Boolean);
}

function buildInterviewPrepPrompt(input: InterviewPrepInput): string {
  const stories = (input.stories ?? [])
    .slice(0, 20)
    .map(
      (story) =>
        `- ID: ${story.id}\n  Title: ${story.title}\n  Situation: ${story.situation}\n  Task: ${story.task}\n  Action: ${story.action}\n  Result: ${story.result}\n  Reflection: ${story.reflection ?? ""}\n  Skills: ${story.skills ?? ""}\n  Tags: ${story.tags ?? ""}\n  Master story: ${story.isMasterStory ? "yes" : "no"}`,
    )
    .join("\n");

  return `Generate a job-specific interview preparation plan for ${input.jobTitle} at ${input.employer}.

JOB DESCRIPTION:
${(input.jobDescription ?? "").slice(0, 3500)}

RESUME / PROFILE SUMMARY:
${(input.resumeSummary ?? "").slice(0, 1800)}

COMPANY RESEARCH:
${(input.companyResearch ?? "").slice(0, 1200)}

EXISTING CAREEROPS INTERVIEW GUIDANCE:
${(input.evaluationInterviewPrep ?? "").slice(0, 1500)}

USER TARGET QUESTIONS OR FOCUS AREAS:
${(input.targetQuestions ?? "").slice(0, 1200)}

AVAILABLE STORY BANK ENTRIES:
${stories || "No saved stories provided."}

TASK:
1. Write concise role-specific prep guidance.
2. Generate 6-8 likely target questions for this interview.
3. For the highest-value questions, provide answer outlines that map to relevant Story Bank IDs when possible.
4. Recommend the best Story Bank IDs to rehearse. Only use IDs from AVAILABLE STORY BANK ENTRIES.
5. Generate thoughtful questions the candidate can ask the interviewer.

Return JSON with prepGuidance, targetQuestions, answerOutlines, recommendedStoryIds, and interviewerQuestions.`;
}
