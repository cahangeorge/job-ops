/**
 * ATS Keyword Injection (from Career Ops)
 * Extracts ATS keywords from job descriptions and helps optimize resume text.
 */

import { createConfiguredLlmService, resolveLlmModel } from "./modelSelection";
import type { JsonSchemaDefinition } from "./llm/types";

export interface AtsKeywordInput {
  jobDescription: string;
  resumeText: string;
}

export interface AtsKeywordResult {
  requiredKeywords: string[];
  preferredKeywords: string[];
  missingKeywords: string[];
  keywordDensity: Array<{ keyword: string; count: number }>;
  optimizedSummary: string;
}

const ATS_SCHEMA: JsonSchemaDefinition = {
  name: "ats_keywords",
  schema: {
    type: "object",
    properties: {
      requiredKeywords: { type: "array", items: { type: "string" } },
      preferredKeywords: { type: "array", items: { type: "string" } },
      missingKeywords: { type: "array", items: { type: "string" } },
      keywordDensity: {
        type: "array",
        items: {
          type: "object",
          properties: { keyword: { type: "string" }, count: { type: "number" } },
          required: ["keyword", "count"],
        },
      },
      optimizedSummary: { type: "string" },
    },
    required: ["requiredKeywords", "preferredKeywords", "missingKeywords", "keywordDensity", "optimizedSummary"],
    additionalProperties: false,
  },
};

export async function analyzeAtsKeywords(
  input: AtsKeywordInput,
): Promise<AtsKeywordResult> {
  const model = await resolveLlmModel("default");
  const prompt = buildAtsPrompt(input);
  const llm = await createConfiguredLlmService("default");

  const result = await llm.callJson<{
    requiredKeywords: string[];
    preferredKeywords: string[];
    missingKeywords: string[];
    keywordDensity: Array<{ keyword: string; count: number }>;
    optimizedSummary: string;
  }>({
    model,
    messages: [{ role: "user", content: prompt }],
    jsonSchema: ATS_SCHEMA,
    maxRetries: 1,
  });

  if (!result.success) {
    throw new Error(`ATS analysis failed: ${result.error}`);
  }

  return {
    requiredKeywords: result.data.requiredKeywords ?? [],
    preferredKeywords: result.data.preferredKeywords ?? [],
    missingKeywords: result.data.missingKeywords ?? [],
    keywordDensity: result.data.keywordDensity ?? [],
    optimizedSummary: result.data.optimizedSummary,
  };
}

function buildAtsPrompt(input: AtsKeywordInput): string {
  return `Analyze this job description for ATS keywords and compare against the resume.

**JOB DESCRIPTION** (first 3000 chars):
${input.jobDescription.slice(0, 3000)}

**RESUME TEXT** (first 2000 chars):
${input.resumeText.slice(0, 2000)}

**TASK**:
1. Extract REQUIRED keywords (must-haves for the ATS)
2. Extract PREFERRED keywords (nice-to-haves that boost ranking)
3. Identify MISSING keywords — required/preferred that don't appear in the resume
4. Count keyword density in the job description
5. Rewrite a 2-3 sentence resume summary that naturally includes the missing required keywords

Return JSON with: requiredKeywords, preferredKeywords, missingKeywords, keywordDensity (array of {keyword, count}), optimizedSummary.`;
}
