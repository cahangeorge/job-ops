import { logger } from "@infra/logger";
import * as settingsRepo from "@server/repositories/settings";
import * as writingStyleRepo from "@server/repositories/writing-style";
import { settingsRegistry } from "@shared/settings-registry";
import type {
  ChatStyleLanguageMode,
  ChatStyleManualLanguage,
} from "@shared/types";
import { createConfiguredLlmService, resolveLlmModel } from "./modelSelection";

export type WritingStyle = {
  tone: string;
  formality: string;
  constraints: string;
  doNotUse: string;
  languageMode: ChatStyleLanguageMode;
  manualLanguage: ChatStyleManualLanguage;
  summaryMaxWords: number | null;
  maxKeywordsPerSkill: number | null;
};

const WORD_LIMIT_PATTERNS = [
  // "keep summary under 100 words", "max 80 words", "no more than 60 words in the summary"
  /\b(?:keep|limit|max(?:imum)?|no more than|under|at most|up to)[\w\s]{0,20}\b\d+\s*words?\b[\w\s]{0,15}[.,;!?]?/gi,
  // "50 words max", "80 words or less/fewer", "100 words limit"
  /\b\d+\s*words?\s*(?:max(?:imum)?|limit|or (?:less|fewer))\b[.,;!?]?/gi,
];

const KEYWORD_LIMIT_PATTERNS = [
  // "max 5 keywords per category", "at most 8 keywords per skill"
  /\b(?:max(?:imum)?|no more than|at most|up to)\s+\d+\s*keywords?\b(?:\s+per\s+(?:category|skill|section))?[.,;!?]?/gi,
  // "limit keywords to 10", "keep keywords under 5"
  /\b(?:keep|limit)\s+keywords?\s+(?:to|under|at)\s+\d+\b(?:\s+per\s+(?:category|skill|section))?[.,;!?]?/gi,
  // "5 keywords max", "10 keywords per category limit", "8 keywords or fewer"
  /\b\d+\s*keywords?\s*(?:max(?:imum)?|limit|per (?:category|skill|section)|or (?:less|fewer))\b[.,;!?]?/gi,
];

const LANGUAGE_NAMES_PATTERN = "english|german|french|spanish";

const LANGUAGE_DIRECTIVE_PATTERNS = [
  new RegExp(
    String.raw`\b(?:always\s+)?(?:respond|reply|write|generate|output)(?:\s+\w+){0,3}\s+(?:in|using)\s+(?:${LANGUAGE_NAMES_PATTERN})\b[.!]?`,
    "gi",
  ),
  new RegExp(
    String.raw`\b(?:set|use|choose|default\s+to)\s+(?:the\s+)?(?:output\s+)?language(?:\s+to)?\s+(?:${LANGUAGE_NAMES_PATTERN})\b[.!]?`,
    "gi",
  ),
  new RegExp(
    String.raw`\b(?:output|response)\s+language\s*[:=]?\s*(?:${LANGUAGE_NAMES_PATTERN})\b[.!]?`,
    "gi",
  ),
];

function stripDirectivesFromConstraints(
  constraints: string,
  patterns: RegExp[],
): string {
  if (!constraints.trim()) {
    return "";
  }

  return constraints
    .split(/\r?\n/g)
    .map((line) => {
      let nextLine = line;

      for (const pattern of patterns) {
        nextLine = nextLine.replace(pattern, "");
      }

      return nextLine
        .replace(/\s{2,}/g, " ")
        .replace(/\s+([,.;:!?])/g, "$1")
        .replace(/^[,.;:!?\s-]+|[,.;:!?\s-]+$/g, "")
        .trim();
    })
    .filter(Boolean)
    .join("\n");
}

export function stripLanguageDirectivesFromConstraints(
  constraints: string,
): string {
  return stripDirectivesFromConstraints(
    constraints,
    LANGUAGE_DIRECTIVE_PATTERNS,
  );
}

export function stripWordLimitFromConstraints(constraints: string): string {
  return stripDirectivesFromConstraints(constraints, WORD_LIMIT_PATTERNS);
}

export function stripKeywordLimitFromConstraints(constraints: string): string {
  return stripDirectivesFromConstraints(constraints, KEYWORD_LIMIT_PATTERNS);
}

export async function getWritingStyle(): Promise<WritingStyle> {
  const getSettingFromRepo =
    "getSetting" in settingsRepo ? settingsRepo.getSetting : null;
  const getSetting =
    typeof getSettingFromRepo === "function"
      ? getSettingFromRepo.bind(settingsRepo)
      : async () => null;
  const [
    toneRaw,
    formalityRaw,
    constraintsRaw,
    doNotUseRaw,
    languageModeRaw,
    manualLanguageRaw,
    summaryMaxWordsRaw,
    maxKeywordsPerSkillRaw,
  ] = await Promise.all([
    getSetting("chatStyleTone"),
    getSetting("chatStyleFormality"),
    getSetting("chatStyleConstraints"),
    getSetting("chatStyleDoNotUse"),
    getSetting("chatStyleLanguageMode"),
    getSetting("chatStyleManualLanguage"),
    getSetting("chatStyleSummaryMaxWords"),
    getSetting("chatStyleMaxKeywordsPerSkill"),
  ]);

  const rawSummaryMaxWords =
    settingsRegistry.chatStyleSummaryMaxWords.parse(
      summaryMaxWordsRaw ?? undefined,
    ) ?? settingsRegistry.chatStyleSummaryMaxWords.default();
  const parsedSummaryMaxWords =
    rawSummaryMaxWords != null && rawSummaryMaxWords > 0
      ? Math.max(1, Math.min(500, rawSummaryMaxWords))
      : null;
  const rawMaxKeywordsPerSkill =
    settingsRegistry.chatStyleMaxKeywordsPerSkill.parse(
      maxKeywordsPerSkillRaw ?? undefined,
    ) ?? settingsRegistry.chatStyleMaxKeywordsPerSkill.default();
  const parsedMaxKeywordsPerSkill =
    rawMaxKeywordsPerSkill != null && rawMaxKeywordsPerSkill > 0
      ? Math.max(1, Math.min(50, rawMaxKeywordsPerSkill))
      : null;

  return {
    tone:
      settingsRegistry.chatStyleTone.parse(toneRaw ?? undefined) ??
      settingsRegistry.chatStyleTone.default(),
    formality:
      settingsRegistry.chatStyleFormality.parse(formalityRaw ?? undefined) ??
      settingsRegistry.chatStyleFormality.default(),
    constraints:
      settingsRegistry.chatStyleConstraints.parse(
        constraintsRaw ?? undefined,
      ) ?? settingsRegistry.chatStyleConstraints.default(),
    doNotUse:
      settingsRegistry.chatStyleDoNotUse.parse(doNotUseRaw ?? undefined) ??
      settingsRegistry.chatStyleDoNotUse.default(),
    languageMode:
      settingsRegistry.chatStyleLanguageMode.parse(
        languageModeRaw ?? undefined,
      ) ?? settingsRegistry.chatStyleLanguageMode.default(),
    manualLanguage:
      settingsRegistry.chatStyleManualLanguage.parse(
        manualLanguageRaw ?? undefined,
      ) ?? settingsRegistry.chatStyleManualLanguage.default(),
    summaryMaxWords:
      parsedSummaryMaxWords != null && parsedSummaryMaxWords > 0
        ? parsedSummaryMaxWords
        : null,
    maxKeywordsPerSkill:
      parsedMaxKeywordsPerSkill != null && parsedMaxKeywordsPerSkill > 0
        ? parsedMaxKeywordsPerSkill
        : null,
  };
}

// ---------------------------------------------------------------------------
// Story Bank Writing Style Calibration (new feature)
// ---------------------------------------------------------------------------

type CalibrationResult = {
  tone: string;
  sentenceLength: string;
  vocabulary: string;
  structure: string;
  personalityTraits: string[];
};

export async function calibrateFromSamples(args: {
  samples: string[];
  userId?: string;
}): Promise<Awaited<ReturnType<typeof writingStyleRepo.upsertProfile>>> {
  if (args.samples.length === 0) {
    throw new Error("At least one writing sample is required for calibration");
  }

  const model = await resolveLlmModel("tailoring");
  const llm = await createConfiguredLlmService("tailoring");

  const prompt = `Analyze the following writing samples and extract the author's writing style profile.

Writing Samples:
${args.samples.map((s, i) => `--- Sample ${i + 1} ---\n${s}`).join("\n\n")}

Extract:
1. Tone (formal/informal, confident/humble, technical/conversational)
2. Sentence length pattern (short/medium/long, varied/consistent)
3. Vocabulary level (simple/moderate/advanced, technical jargon usage)
4. Structure preference (paragraphs/bullets/mixed, how ideas are organized)
5. Personality traits (analytical/creative/pragmatic/empathetic/etc.)

Return as JSON with keys: tone, sentenceLength, vocabulary, structure, personalityTraits (string array).`;

  const result = await llm.callJson<CalibrationResult>({
    model,
    messages: [{ role: "user", content: prompt }],
    jsonSchema: {
      name: "writing_style_calibration",
      schema: {
        type: "object",
        properties: {
          tone: { type: "string" },
          sentenceLength: { type: "string" },
          vocabulary: { type: "string" },
          structure: { type: "string" },
          personalityTraits: { type: "array", items: { type: "string" } },
        },
        required: [
          "tone",
          "sentenceLength",
          "vocabulary",
          "structure",
          "personalityTraits",
        ],
        additionalProperties: false,
      },
    },
    maxRetries: 2,
  });

  if (!result.success) {
    throw new Error(`Writing style calibration failed: ${result.error}`);
  }

  const profile = await writingStyleRepo.upsertProfile({
    userId: args.userId ?? "anonymous",
    tone: result.data.tone,
    sentenceLength: result.data.sentenceLength,
    vocabulary: result.data.vocabulary,
    structure: result.data.structure,
    personalityTraits: result.data.personalityTraits,
    sampleCount: args.samples.length,
  });

  logger.info("Writing style calibrated", {
    userId: args.userId,
    sampleCount: args.samples.length,
    tone: result.data.tone,
  });

  return profile;
}

export async function getCalibratedProfile(args: {
  userId?: string;
}): Promise<Awaited<
  ReturnType<typeof writingStyleRepo.getProfileForUser>
> | null> {
  if (!args.userId) return null;
  return writingStyleRepo.getProfileForUser(args.userId);
}

export async function deleteCalibratedProfile(args: {
  userId?: string;
}): Promise<void> {
  if (!args.userId) return;
  // Find profile by userId first, then delete by profile ID
  const profile = await writingStyleRepo.getProfileForUser(args.userId);
  if (profile) {
    await writingStyleRepo.deleteProfile(profile.id);
  }
}
