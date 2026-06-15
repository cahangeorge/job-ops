/**
 * Cover Letter Generator with Research (from Career Ops)
 * Generates research-backed cover letters with keyword mirroring.
 */

import { createConfiguredLlmService, resolveLlmModel } from "./modelSelection";
import type { JsonSchemaDefinition } from "./llm/types";

export interface CoverLetterInput {
  jobTitle: string;
  employer: string;
  jobDescription: string;
  resumeSummary: string;
  companyResearch?: string;
  tone?: "formal" | "conversational" | "enthusiastic";
  angle?: "company_mission" | "problem_solving" | "culture_fit" | "technical_challenge";
}

export interface CoverLetterResult {
  coverLetter: string;
  researchNotes: string;
  keywordsMirrored: string[];
  tone: string;
  angle: string;
}

const COVER_LETTER_SCHEMA: JsonSchemaDefinition = {
  name: "cover_letter",
  schema: {
    type: "object",
    properties: {
      coverLetter: { type: "string", description: "The full cover letter text (3-4 paragraphs)" },
      researchNotes: { type: "string", description: "Brief notes on company research used" },
      keywordsMirrored: {
        type: "array",
        items: { type: "string" },
        description: "Keywords from JD that were mirrored in the letter",
      },
      tone: { type: "string", description: "Tone used in the letter" },
      angle: { type: "string", description: "Angle/strategy used" },
    },
    required: ["coverLetter", "researchNotes", "keywordsMirrored", "tone", "angle"],
    additionalProperties: false,
  },
};

export async function generateCoverLetter(
  input: CoverLetterInput,
): Promise<CoverLetterResult> {
  const model = await resolveLlmModel("default");

  const prompt = buildCoverLetterPrompt(input);
  const llm = await createConfiguredLlmService("default");

  const result = await llm.callJson<{
    coverLetter: string;
    researchNotes: string;
    keywordsMirrored: string[];
    tone: string;
    angle: string;
  }>({
    model,
    messages: [{ role: "user", content: prompt }],
    jsonSchema: COVER_LETTER_SCHEMA,
    maxRetries: 1,
  });

  if (!result.success) {
    throw new Error(`Cover letter generation failed: ${result.error}`);
  }

  return {
    coverLetter: result.data.coverLetter,
    researchNotes: result.data.researchNotes,
    keywordsMirrored: result.data.keywordsMirrored ?? [],
    tone: result.data.tone ?? input.tone ?? "formal",
    angle: result.data.angle ?? input.angle ?? "company_mission",
  };
}

function buildCoverLetterPrompt(input: CoverLetterInput): string {
  const { jobTitle, employer, jobDescription, resumeSummary, companyResearch, tone = "formal", angle = "company_mission" } = input;

  const anglePrompts: Record<string, string> = {
    company_mission: "Lead with why this company's mission resonates with you specifically. Connect your values to their stated goals.",
    problem_solving: "Lead with a specific problem this role addresses that you've solved before. Show pattern recognition.",
    culture_fit: "Lead with cultural alignment — reference specific company values, blog posts, or public statements.",
    technical_challenge: "Lead with excitement about the technical complexity. Mention specific technologies or scale challenges.",
  };

  return `Write a cover letter for the following job application.

**ROLE**: ${jobTitle} at ${employer}

**JOB DESCRIPTION**:
${jobDescription.slice(0, 3000)}

**MY BACKGROUND**:
${resumeSummary.slice(0, 1500)}

${companyResearch ? `**COMPANY RESEARCH**:\n${companyResearch.slice(0, 1000)}\n` : ""}

**REQUIREMENTS**:
- Tone: ${tone}
- Angle/Strategy: ${anglePrompts[angle] || anglePrompts.company_mission}
- Mirror keywords from the job description naturally (don't keyword stuff)
- 3-4 paragraphs, max 350 words
- Show specific evidence from my background that maps to their requirements
- End with a confident but not presumptuous closing

Return JSON with: coverLetter, researchNotes, keywordsMirrored, tone, angle.`;
}
