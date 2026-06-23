/**
 * Service for scoring job suitability using AI.
 */

import { logger } from "@infra/logger";
import { getDefaultPromptTemplate } from "@shared/prompt-template-definitions.js";
import type { Job } from "@shared/types";
import type { JsonSchemaDefinition } from "./llm/types";
import { stripMarkdownCodeFences } from "./llm/utils/json";
import { createConfiguredLlmService, resolveLlmModel } from "./modelSelection";
import { renderPromptTemplate } from "./prompt-templates";
import { getEffectiveSettings } from "./settings";

export class LlmNotConfiguredError extends Error {
  constructor(message?: string) {
    super(message ?? "LLM API key not configured");
    this.name = "LlmNotConfiguredError";
  }
}

interface SuitabilityResult {
  score: number | null;
  reason: string;
  roleSummary?: string;
  cvMatchScore?: number;
  cvMatchReason?: string;
  levelStrategy?: string;
  compResearch?: string;
  personalization?: string;
  interviewPrep?: string;
  legitimacyScore?: number;
  legitimacyReason?: string;
  overallGrade?: string;
  archetype?: string;
  isGhostJob?: boolean;
}

type ScoringPreferences = {
  instructions: string;
  promptTemplate: string;
};

type ProfileRecord = Record<string, unknown>;

/** JSON schema for structured 6-block evaluation */
const SCORING_SCHEMA: JsonSchemaDefinition = {
  name: "job_suitability_evaluation",
  schema: {
    type: "object",
    properties: {
      score: {
        type: "integer",
        description: "Overall suitability score from 0 to 100",
      },
      reason: {
        type: "string",
        description: "Brief 1-2 sentence summary of the evaluation",
      },
      roleSummary: {
        type: "string",
        description: "2-3 sentence summary of what this role actually entails",
      },
      cvMatchScore: {
        type: "integer",
        description: "How well CV matches this role, 0-100",
      },
      cvMatchReason: {
        type: "string",
        description: "Specific strengths and gaps vs the role requirements",
      },
      levelStrategy: {
        type: "string",
        description: "Recommended seniority level to apply for and why",
      },
      compResearch: {
        type: "string",
        description: "Salary/ compensation analysis for this role type and location",
      },
      personalization: {
        type: "string",
        description: "Key angles to personalize application: company-specific problems you could solve",
      },
      interviewPrep: {
        type: "string",
        description: "2-3 likely interview questions with suggested STAR story angles",
      },
      legitimacyScore: {
        type: "integer",
        description: "Likelihood this is a real active role, 0-100. Check for red flags: vague description, no company info, unrealistic requirements, stock photos, missing salary, too-good-to-be-true promises",
      },
      legitimacyReason: {
        type: "string",
        description: "Why this posting seems legitimate or suspicious",
      },
      overallGrade: {
        type: "string",
        description: "Letter grade A-F based on overall fit. A=strong match, B=good match, C=decent, D=weak match, F=avoid",
      },
      archetype: {
        type: "string",
        description: "Role archetype: LLMOps, Agentic, FullStack, Backend, Frontend, DevOps, PM, Data, Research, General",
      },
      isGhostJob: {
        type: "boolean",
        description: "True if this appears to be a stale, expired, or fake posting",
      },
    },
    required: ["score", "reason", "roleSummary", "cvMatchScore", "cvMatchReason", "levelStrategy", "compResearch", "personalization", "interviewPrep", "legitimacyScore", "legitimacyReason", "overallGrade", "archetype", "isGhostJob"],
    additionalProperties: false,
  },
};

/**
 * Check if a job's salary field is missing/empty.
 * Returns true for null, empty string, or whitespace-only strings.
 */
function isSalaryMissing(salary: string | null): boolean {
  return salary === null || salary.trim() === "";
}

/**
 * Apply salary penalty to a score if enabled.
 * Returns the adjusted score, adjusted reason, and whether penalty was applied.
 */
function applySalaryPenalty(
  job: Job,
  originalScore: number,
  originalReason: string,
  settings: { penalizeMissingSalary: boolean; missingSalaryPenalty: number },
): { score: number; reason: string; penaltyApplied: boolean } {
  if (!settings.penalizeMissingSalary || !isSalaryMissing(job.salary)) {
    return {
      score: originalScore,
      reason: originalReason,
      penaltyApplied: false,
    };
  }

  const penalty = settings.missingSalaryPenalty;
  const adjustedScore = Math.max(0, originalScore - penalty);
  const penaltyText = `Score reduced by ${penalty} points due to missing salary information.`;
  const adjustedReason = `${originalReason} ${penaltyText}`;

  logger.info("Applied salary penalty", {
    jobId: job.id,
    originalScore,
    penalty,
    finalScore: adjustedScore,
  });

  return { score: adjustedScore, reason: adjustedReason, penaltyApplied: true };
}

/**
 * Score a job's suitability based on profile and job description.
 * Includes retry logic for when AI returns garbage responses.
 */
export async function scoreJobSuitability(
  job: Job,
  profile: Record<string, unknown>,
): Promise<SuitabilityResult> {
  const [model, settings] = await Promise.all([
    resolveLlmModel("scoring"),
    getEffectiveSettings(),
  ]);

  const prompt = buildScoringPrompt(job, sanitizeProfileForPrompt(profile), {
    instructions: settings.scoringInstructions?.value ?? "",
    promptTemplate:
      settings.scoringPromptTemplate?.value ??
      getDefaultPromptTemplate("scoringPromptTemplate"),
  });

  const llm = await createConfiguredLlmService("scoring");
  const result = await llm.callJson<{
    score: number;
    reason: string;
    roleSummary?: string;
    cvMatchScore?: number;
    cvMatchReason?: string;
    levelStrategy?: string;
    compResearch?: string;
    personalization?: string;
    interviewPrep?: string;
    legitimacyScore?: number;
    legitimacyReason?: string;
    overallGrade?: string;
    archetype?: string;
    isGhostJob?: boolean;
  }>({
    model,
    messages: [{ role: "user", content: prompt }],
    jsonSchema: SCORING_SCHEMA,
    maxRetries: 2,
    jobId: job.id,
  });

  if (!result.success) {
    logger.warn("Scoring failed — pausing pipeline", {
      jobId: job.id,
      error: result.error,
    });
    throw new LlmNotConfiguredError(
      `AI scoring failed: ${result.error}. Check your LLM configuration in Settings → Integrations, then resume scoring.`,
    );
  }

  const { score, reason } = result.data;

  // Validate we got a reasonable response
  if (typeof score !== "number" || Number.isNaN(score)) {
    logger.warn("Invalid score in AI response — pausing pipeline", {
      jobId: job.id,
    });
    throw new LlmNotConfiguredError(
      "AI returned invalid scoring data. Check your LLM configuration in Settings → Integrations, then resume scoring.",
    );
  }

  const clampedScore = Math.min(100, Math.max(0, Math.round(score)));
  const clampedReason = reason || "No explanation provided";

  // Apply salary penalty if enabled
  const penaltyResult = applySalaryPenalty(job, clampedScore, clampedReason, {
    penalizeMissingSalary: settings.penalizeMissingSalary.value,
    missingSalaryPenalty: settings.missingSalaryPenalty.value,
  });

  return {
    score: penaltyResult.score,
    reason: penaltyResult.reason,
    roleSummary: result.data.roleSummary,
    cvMatchScore: result.data.cvMatchScore,
    cvMatchReason: result.data.cvMatchReason,
    levelStrategy: result.data.levelStrategy,
    compResearch: result.data.compResearch,
    personalization: result.data.personalization,
    interviewPrep: result.data.interviewPrep,
    legitimacyScore: result.data.legitimacyScore,
    legitimacyReason: result.data.legitimacyReason,
    overallGrade: result.data.overallGrade,
    archetype: result.data.archetype,
    isGhostJob: result.data.isGhostJob,
  };
}

/**
 * Robustly parse JSON from AI-generated content.
 * Handles common AI quirks: markdown fences, extra text, trailing commas, etc.
 *
 * @deprecated Use LlmService with structured outputs instead. Kept for backwards compatibility with tests.
 */
export function parseJsonFromContent(
  content: string,
  jobId?: string,
): { score?: number; reason?: string } {
  const originalContent = content;
  let candidate = content.trim();

  // Step 1: Remove markdown code fences (with or without language specifier)
  candidate = stripMarkdownCodeFences(candidate);

  // Step 2: Try to extract JSON object if there's surrounding text
  const jsonMatch = candidate.match(/\{[\s\S]*\}/);
  if (jsonMatch) {
    candidate = jsonMatch[0];
  }

  // Step 3: Try direct parse first
  try {
    return JSON.parse(candidate);
  } catch {
    // Continue with sanitization
  }

  // Step 4: Fix common JSON issues
  let sanitized = candidate;

  // Remove JavaScript-style comments (// and /* */)
  sanitized = sanitized.replace(/\/\/[^\n]*/g, "");
  sanitized = sanitized.replace(/\/\*[\s\S]*?\*\//g, "");

  // Remove trailing commas before } or ]
  sanitized = sanitized.replace(/,\s*([\]}])/g, "$1");

  // Fix unquoted keys: word: -> "word":
  // Be more careful - only match at start of object or after comma
  sanitized = sanitized.replace(
    /([{,]\s*)([a-zA-Z_][a-zA-Z0-9_]*)\s*:/g,
    '$1"$2":',
  );

  // Fix single quotes to double quotes
  sanitized = sanitized.replace(/'/g, '"');

  // Remove ALL control characters (including newlines/tabs INSIDE string values which break JSON)
  // First, let's normalize the string - escape actual newlines inside strings
  // biome-ignore lint/suspicious/noControlCharactersInRegex: needed to fix broken JSON from AI
  const controlCharsRegex = /[\x00-\x1F\x7F]/g;
  sanitized = sanitized.replace(controlCharsRegex, (match) => {
    if (match === "\n") return "\\n";
    if (match === "\r") return "\\r";
    if (match === "\t") return "\\t";
    return "";
  });

  // Step 5: Try parsing the sanitized version
  try {
    return JSON.parse(sanitized);
  } catch {
    // Continue with more aggressive extraction
  }

  // Step 6: Even more aggressive - try to rebuild a minimal valid JSON
  // by extracting just the score and reason values
  const scoreMatch = originalContent.match(
    /["']?score["']?\s*[:=]\s*(\d+(?:\.\d+)?)/i,
  );
  const reasonMatch =
    originalContent.match(/["']?reason["']?\s*[:=]\s*["']([^"'\n]+)["']/i) ||
    originalContent.match(
      /["']?reason["']?\s*[:=]\s*["']?(.*?)["']?\s*[,}\n]/is,
    );

  if (scoreMatch) {
    const score = Math.round(parseFloat(scoreMatch[1]));
    const reason = reasonMatch
      ? reasonMatch[1].trim().replace(controlCharsRegex, "")
      : "Score extracted from malformed response";
    logger.warn("Parsed score via regex fallback", {
      jobId: jobId || "unknown",
      score,
    });
    return { score, reason };
  }

  // Log the failure with full content for debugging
  logger.error("Failed to parse AI response", {
    jobId: jobId || "unknown",
    rawSample: originalContent.substring(0, 500),
    sanitizedSample: sanitized.substring(0, 500),
  });

  throw new Error("Unable to parse JSON from model response");
}

function buildScoringPrompt(
  job: Job,
  profile: Record<string, unknown>,
  preferences: ScoringPreferences,
): string {
  return renderPromptTemplate(preferences.promptTemplate, {
    profileJson: JSON.stringify(profile, null, 2),
    jobTitle: job.title,
    employer: job.employer,
    location: job.location || "Not specified",
    salary: job.salary || "Not specified",
    degreeRequired: job.degreeRequired || "Not specified",
    disciplines: job.disciplines || "Not specified",
    jobDescription: job.jobDescription || "No description available",
    scoringInstructionsText: preferences.instructions
      ? preferences.instructions
      : "No additional custom scoring instructions.",
  });
}

function sanitizeProfileForPrompt(
  profile: Record<string, unknown>,
): Record<string, unknown> {
  return {
    basics: sanitizeBasics(profile.basics),
    skills: sanitizeItems(profile, "skills", [
      "name",
      "description",
      "level",
      "proficiency",
      "keywords",
    ]),
    experience: sanitizeItems(profile, "experience", [
      "company",
      "position",
      "location",
      "date",
      "period",
      "summary",
      "description",
    ]),
    projects: sanitizeItems(profile, "projects", [
      "name",
      "description",
      "date",
      "period",
      "summary",
      "keywords",
    ]),
    education: sanitizeItems(profile, "education", [
      "school",
      "institution",
      "degree",
      "area",
      "grade",
      "location",
      "date",
      "period",
      "summary",
      "description",
    ]),
    languages: sanitizeItems(profile, "languages", [
      "language",
      "fluency",
      "level",
    ]),
    awards: sanitizeItems(profile, "awards", [
      "title",
      "awarder",
      "date",
      "summary",
      "description",
    ]),
    certifications: sanitizeItems(profile, "certifications", [
      "title",
      "issuer",
      "date",
      "summary",
      "description",
    ]),
    publications: sanitizeItems(profile, "publications", [
      "title",
      "publisher",
      "date",
      "summary",
      "description",
    ]),
    volunteer: sanitizeItems(profile, "volunteer", [
      "organization",
      "position",
      "location",
      "date",
      "period",
      "summary",
      "description",
    ]),
    interests: sanitizeItems(profile, "interests", [
      "name",
      "summary",
      "description",
      "keywords",
    ]),
  };
}

function sanitizeBasics(value: unknown): ProfileRecord {
  if (!isRecord(value)) return {};
  return pickDefined(value, ["label", "headline", "summary", "location"]);
}

function sanitizeItems(
  profile: ProfileRecord,
  sectionKey: string,
  allowedKeys: string[],
): ProfileRecord[] {
  return collectSectionItems(profile, sectionKey)
    .filter(isVisibleCvItem)
    .map((item) => sanitizeCvItem(item, allowedKeys))
    .filter((item) => Object.keys(item).length > 0);
}

function collectSectionItems(
  profile: ProfileRecord,
  sectionKey: string,
): ProfileRecord[] {
  const sections = isRecord(profile.sections) ? profile.sections : {};
  const section = sections[sectionKey];

  if (isRecord(section)) {
    if (!isVisibleCvItem(section)) return [];
    if (Array.isArray(section.items)) {
      return section.items.filter(isRecord);
    }
  }

  const topLevelSection = profile[sectionKey];
  if (Array.isArray(topLevelSection)) return topLevelSection.filter(isRecord);
  if (isRecord(topLevelSection)) {
    if (!isVisibleCvItem(topLevelSection)) return [];
    if (Array.isArray(topLevelSection.items)) {
      return topLevelSection.items.filter(isRecord);
    }
  }

  return [];
}

function sanitizeCvItem(
  item: ProfileRecord,
  allowedKeys: string[],
): ProfileRecord {
  const sanitized = pickDefined(item, allowedKeys);
  if (Array.isArray(item.roles)) {
    const roles = item.roles
      .filter(isRecord)
      .filter(isVisibleCvItem)
      .map((role) =>
        pickDefined(role, ["position", "period", "summary", "description"]),
      )
      .filter((role) => Object.keys(role).length > 0);
    if (roles.length > 0) sanitized.roles = roles;
  }
  return sanitized;
}

function pickDefined(source: ProfileRecord, keys: string[]): ProfileRecord {
  const result: ProfileRecord = {};
  for (const key of keys) {
    const value = source[key];
    if (value !== undefined && value !== null && value !== "") {
      result[key] = value;
    }
  }
  return result;
}

function isVisibleCvItem(item: ProfileRecord): boolean {
  if (item.hidden === true) return false;
  if (item.visible === false) return false;
  return true;
}

function isRecord(value: unknown): value is ProfileRecord {
  return Boolean(value) && typeof value === "object" && !Array.isArray(value);
}

/**
 * Score multiple jobs and return sorted by score (descending).
 */
export async function scoreAndRankJobs(
  jobs: Job[],
  profile: Record<string, unknown>,
): Promise<
  Array<Job & { 
    suitabilityScore: number | null; 
    suitabilityReason: string;
    evaluationRoleSummary: string | null;
    evaluationCvMatchScore: number | null;
    evaluationCvMatchReason: string | null;
    evaluationLevelStrategy: string | null;
    evaluationCompResearch: string | null;
    evaluationPersonalization: string | null;
    evaluationInterviewPrep: string | null;
    evaluationLegitimacyScore: number | null;
    evaluationLegitimacyReason: string | null;
    evaluationOverallGrade: string | null;
    archetype: string | null;
    isGhostJob: boolean | null;
  }>
> {
  const scoredJobs = await Promise.all(
    jobs.map(async (job) => {
      const result = await scoreJobSuitability(job, profile);
      return {
        ...job,
        suitabilityScore: result.score,
        suitabilityReason: result.reason,
        evaluationRoleSummary: result.roleSummary ?? null,
        evaluationCvMatchScore: result.cvMatchScore ?? null,
        evaluationCvMatchReason: result.cvMatchReason ?? null,
        evaluationLevelStrategy: result.levelStrategy ?? null,
        evaluationCompResearch: result.compResearch ?? null,
        evaluationPersonalization: result.personalization ?? null,
        evaluationInterviewPrep: result.interviewPrep ?? null,
        evaluationLegitimacyScore: result.legitimacyScore ?? null,
        evaluationLegitimacyReason: result.legitimacyReason ?? null,
        evaluationOverallGrade: result.overallGrade ?? null,
        archetype: result.archetype ?? null,
        isGhostJob: result.isGhostJob ?? null,
      };
    }),
  );

  return scoredJobs.sort((a, b) => {
    if (a.suitabilityScore == null && b.suitabilityScore == null) return 0;
    if (a.suitabilityScore == null) return 1;
    if (b.suitabilityScore == null) return -1;
    return b.suitabilityScore - a.suitabilityScore;
  });
}
