import { logger } from "@infra/logger";
import * as legitimacyRepo from "../repositories/legitimacy";
import { createConfiguredLlmService, resolveLlmModel } from "./modelSelection";

type LegitimacyAnalysis = {
  legitimacyScore: number;
  redFlags: string[];
  confidence: "high" | "medium" | "low";
  signals: {
    postingAge?: number;
    recencyScore?: number;
    descriptionPatternScore?: number;
  };
};

// ─── Deterministic Signal Gathering ───────────────────────────────────────────

function gatherDeterministicSignals(job: Record<string, unknown>): {
  postingAge: number | null;
  recencyScore: number | null;
  descriptionPatternScore: number | null;
} {
  const now = Date.now();
  const discoveredAt = job.discoveredAt
    ? new Date(job.discoveredAt as string).getTime()
    : null;

  const postingAge = discoveredAt
    ? Math.floor((now - discoveredAt) / (1000 * 60 * 60 * 24))
    : null;

  // Recency: newer postings score higher
  const recencyScore =
    postingAge !== null
      ? Math.max(0, Math.min(100, 100 - postingAge * 2))
      : null;

  // Description pattern: check for common red flags
  const description = String(job.jobDescription ?? "").toLowerCase();
  const redFlagPatterns = [
    "work from home opportunity",
    "unlimited earning potential",
    "no experience required",
    "send money",
    "wire transfer",
    "cryptocurrency investment",
    "mlm",
    "multi-level",
    "pyramid",
  ];
  const matchedPatterns = redFlagPatterns.filter((p) =>
    description.includes(p),
  );
  const descriptionPatternScore =
    matchedPatterns.length === 0
      ? 80
      : Math.max(0, 80 - matchedPatterns.length * 20);

  return { postingAge, recencyScore, descriptionPatternScore };
}

// ─── LLM Analysis ─────────────────────────────────────────────────────────────

async function analyzeWithLlm(args: {
  job: Record<string, unknown>;
  deterministicSignals: {
    postingAge: number | null;
    recencyScore: number | null;
    descriptionPatternScore: number | null;
  };
}): Promise<LegitimacyAnalysis> {
  const model = await resolveLlmModel("scoring");
  const llm = await createConfiguredLlmService("scoring");

  const prompt = `Analyze this job posting for legitimacy. Consider the job details and pre-computed signals.

Job: ${JSON.stringify(args.job, null, 2)}

Pre-computed Signals:
- Posting Age: ${args.deterministicSignals.postingAge ?? "unknown"} days
- Recency Score: ${args.deterministicSignals.recencyScore ?? "unknown"}/100
- Description Pattern Score: ${args.deterministicSignals.descriptionPatternScore ?? "unknown"}/100

Evaluate:
1. Overall legitimacy score (0-100, where 100 is definitely legitimate)
2. Red flags (list any concerns)
3. Confidence level (high/medium/low)
4. Any additional signal scores

Return as JSON with keys: legitimacyScore, redFlags (string array), confidence, signals (object).`;

  const result = await llm.callJson<LegitimacyAnalysis>({
    model,
    messages: [{ role: "user", content: prompt }],
    jsonSchema: {
      name: "legitimacy_analysis",
      schema: {
        type: "object",
        properties: {
          legitimacyScore: { type: "number", minimum: 0, maximum: 100 },
          redFlags: { type: "array", items: { type: "string" } },
          confidence: { type: "string", enum: ["high", "medium", "low"] },
          signals: {
            type: "object",
            properties: {
              postingAge: { type: "number" },
              recencyScore: { type: "number" },
              descriptionPatternScore: { type: "number" },
            },
          },
        },
        required: ["legitimacyScore", "redFlags", "confidence", "signals"],
        additionalProperties: false,
      },
    },
    maxRetries: 2,
  });

  if (!result.success) {
    throw new Error(`Legitimacy analysis failed: ${result.error}`);
  }

  return result.data;
}

// ─── Main Analysis Function ───────────────────────────────────────────────────

export async function analyzeLegitimacy(args: {
  jobId: string;
  job: Record<string, unknown>;
}): Promise<{ signalId: string; scoreId: string; score: number }> {
  // 1. Gather deterministic signals
  const deterministicSignals = gatherDeterministicSignals(args.job);

  // 2. Store signals
  const signal = await legitimacyRepo.createSignal({
    jobId: args.jobId,
    postingAge: deterministicSignals.postingAge ?? undefined,
    recencyScore: deterministicSignals.recencyScore ?? undefined,
    descriptionPatternScore:
      deterministicSignals.descriptionPatternScore ?? undefined,
    rawSignals: deterministicSignals as unknown as Record<string, unknown>,
  });

  // 3. LLM analysis
  const analysis = await analyzeWithLlm({
    job: args.job,
    deterministicSignals,
  });

  // 4. Store score
  const score = await legitimacyRepo.createScore({
    jobId: args.jobId,
    signalId: signal.id,
    score: analysis.legitimacyScore,
    confidence: analysis.confidence as "high" | "medium" | "low",
    redFlags: analysis.redFlags,
    llmAnalysis: JSON.stringify(analysis),
  });

  logger.info("Legitimacy analysis completed", {
    jobId: args.jobId,
    score: analysis.legitimacyScore,
    confidence: analysis.confidence as string,
    redFlagCount: analysis.redFlags.length,
  });

  return {
    signalId: signal.id,
    scoreId: score.id,
    score: analysis.legitimacyScore,
  };
}

export async function getLatestScore(args: { jobId: string }) {
  return legitimacyRepo.getLatestScoreForJob(args.jobId);
}

export async function getLatestSignal(args: { jobId: string }) {
  return legitimacyRepo.getLatestSignalForJob(args.jobId);
}

export async function listScoresForJobs(args: { jobIds: string[] }) {
  return legitimacyRepo.listScoresForJobs(args.jobIds);
}
