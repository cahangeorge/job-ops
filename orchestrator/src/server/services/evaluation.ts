import { logger } from "@infra/logger";
import * as evaluationsRepo from "../repositories/job-evaluations";
import * as jobRepo from "../repositories/jobs";
import { createConfiguredLlmService, resolveLlmModel } from "./modelSelection";

// ─── Types ────────────────────────────────────────────────────────────────────

type BlockName = "A" | "B" | "C" | "D" | "E" | "F" | "G";

type BlockResult = {
  block: BlockName;
  data: Record<string, unknown>;
  durationMs: number;
};

type EvaluationProgress = {
  evaluationId: string;
  block: BlockName;
  status: "processing" | "completed" | "failed";
  data?: Record<string, unknown>;
  error?: string;
};

type ProgressCallback = (progress: EvaluationProgress) => void;

// ─── Block Definitions ────────────────────────────────────────────────────────

const BLOCK_DEFINITIONS: Record<
  BlockName,
  {
    label: string;
    buildPrompt: (args: {
      job: Record<string, unknown>;
      profile: Record<string, unknown>;
      context?: Record<string, unknown>;
    }) => string;
    jsonSchema: Record<string, unknown>;
  }
> = {
  A: {
    label: "Role Summary & Fit Score",
    buildPrompt: ({ job, profile }) =>
      `Analyze this job posting and provide a role summary, ideal candidate profile, and fit score.\n\nJob: ${JSON.stringify(job, null, 2)}\n\nCandidate Profile: ${JSON.stringify(profile, null, 2)}`,
    jsonSchema: {
      type: "object",
      properties: {
        roleSummary: { type: "string" },
        idealCandidate: {
          type: "object",
          properties: {
            skills: { type: "array", items: { type: "string" } },
            experience: { type: "array", items: { type: "string" } },
            traits: { type: "array", items: { type: "string" } },
          },
        },
        score: { type: "number", minimum: 0, maximum: 100 },
      },
      required: ["roleSummary", "idealCandidate", "score"],
    },
  },
  B: {
    label: "Skills & Experience Match",
    buildPrompt: ({ job, profile }) =>
      `Compare the candidate's skills and experience against this job's requirements.\n\nJob: ${JSON.stringify(job, null, 2)}\n\nCandidate: ${JSON.stringify(profile, null, 2)}`,
    jsonSchema: {
      type: "object",
      properties: {
        skillsMatch: {
          type: "object",
          properties: {
            matched: { type: "array", items: { type: "string" } },
            missing: { type: "array", items: { type: "string" } },
            score: { type: "number" },
          },
        },
        experienceMatch: {
          type: "object",
          properties: {
            relevantYears: { type: "number" },
            gapAnalysis: { type: "string" },
          },
        },
        overallFit: { type: "number", minimum: 0, maximum: 100 },
      },
      required: ["skillsMatch", "experienceMatch", "overallFit"],
    },
  },
  C: {
    label: "Level & Positioning Strategy",
    buildPrompt: ({ job, profile }) =>
      `Assess the appropriate seniority level and positioning strategy for this application.\n\nJob: ${JSON.stringify(job, null, 2)}\n\nCandidate: ${JSON.stringify(profile, null, 2)}`,
    jsonSchema: {
      type: "object",
      properties: {
        assessedLevel: { type: "string" },
        recommendedPositioning: { type: "string" },
        seniorityScore: { type: "number" },
      },
      required: ["assessedLevel", "recommendedPositioning", "seniorityScore"],
    },
  },
  D: {
    label: "Compensation Research",
    buildPrompt: ({ job }) =>
      `Estimate the market compensation range for this role.\n\nJob: ${JSON.stringify(job, null, 2)}`,
    jsonSchema: {
      type: "object",
      properties: {
        currency: { type: "string" },
        marketRate: {
          type: "object",
          properties: {
            low: { type: "number" },
            high: { type: "number" },
            median: { type: "number" },
          },
        },
        dataFreshness: { type: "string" },
        sources: { type: "array", items: { type: "string" } },
      },
      required: ["currency", "marketRate"],
    },
  },
  E: {
    label: "Tailoring Strategy",
    buildPrompt: ({ job, profile }) =>
      `Create a tailoring strategy for the candidate's resume and application.\n\nJob: ${JSON.stringify(job, null, 2)}\n\nCandidate: ${JSON.stringify(profile, null, 2)}`,
    jsonSchema: {
      type: "object",
      properties: {
        headline: { type: "string" },
        summaryRewrite: { type: "string" },
        skillsReorder: { type: "array", items: { type: "string" } },
        projectSelection: { type: "array", items: { type: "string" } },
        rationale: { type: "string" },
      },
      required: ["headline", "rationale"],
    },
  },
  F: {
    label: "Interview Prep (STAR+R)",
    buildPrompt: ({ job, profile, context }) =>
      `Map the candidate's stories to job requirements using STAR+R format.\n\nJob: ${JSON.stringify(job, null, 2)}\n\nCandidate: ${JSON.stringify(profile, null, 2)}\n\nStories: ${JSON.stringify(context?.stories ?? [], null, 2)}`,
    jsonSchema: {
      type: "object",
      properties: {
        mappedStories: {
          type: "array",
          items: {
            type: "object",
            properties: {
              jobRequirement: { type: "string" },
              storyId: { type: "string" },
              starPlusR: {
                type: "object",
                properties: {
                  situation: { type: "string" },
                  task: { type: "string" },
                  action: { type: "string" },
                  result: { type: "string" },
                  reflection: { type: "string" },
                },
              },
              relevanceScore: { type: "number" },
            },
          },
        },
      },
      required: ["mappedStories"],
    },
  },
  G: {
    label: "Posting Legitimacy Check",
    buildPrompt: ({ job }) =>
      `Analyze this job posting for legitimacy indicators. Check for ghost jobs, scams, or red flags.\n\nJob: ${JSON.stringify(job, null, 2)}`,
    jsonSchema: {
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
      required: ["legitimacyScore", "confidence"],
    },
  },
};

// ─── Core Evaluation Logic ────────────────────────────────────────────────────

export async function runBlock(args: {
  evaluationId: string;
  block: BlockName;
  job: Record<string, unknown>;
  profile: Record<string, unknown>;
  context?: Record<string, unknown>;
}): Promise<BlockResult> {
  const definition = BLOCK_DEFINITIONS[args.block];
  if (!definition) throw new Error(`Unknown block: ${args.block}`);

  const start = Date.now();
  const blockRecord = await evaluationsRepo.createBlock({
    evaluationId: args.evaluationId,
    block: args.block,
  });

  await evaluationsRepo.updateBlock(blockRecord.id, { status: "processing" });

  try {
    const model = await resolveLlmModel("scoring");
    const llm = await createConfiguredLlmService("scoring");
    const prompt = definition.buildPrompt({
      job: args.job,
      profile: args.profile,
      context: args.context,
    });

    const result = await llm.callJson<Record<string, unknown>>({
      model,
      messages: [{ role: "user", content: prompt }],
      jsonSchema: {
        name: `block_${args.block.toLowerCase()}`,
        schema: {
          ...(definition.jsonSchema as {
            type: "object";
            properties: Record<string, unknown>;
            required: string[];
          }),
          additionalProperties: false,
        },
      },
      maxRetries: 2,
    });

    const durationMs = Date.now() - start;

    if (!result.success) {
      await evaluationsRepo.updateBlock(blockRecord.id, {
        status: "failed",
        errorMessage: result.error,
        durationMs,
      });
      throw new Error(`Block ${args.block} failed: ${result.error}`);
    }

    await evaluationsRepo.updateBlock(blockRecord.id, {
      status: "completed",
      data: JSON.stringify(result.data),
      durationMs,
    });

    return {
      block: args.block,
      data: result.data,
      durationMs,
    };
  } catch (error) {
    const durationMs = Date.now() - start;
    await evaluationsRepo.updateBlock(blockRecord.id, {
      status: "failed",
      errorMessage: error instanceof Error ? error.message : String(error),
      durationMs,
    });
    throw error;
  }
}

export async function runEvaluation(args: {
  jobId: string;
  userId?: string;
  blocks: BlockName[];
  context?: Record<string, unknown>;
  onProgress?: ProgressCallback;
}): Promise<string> {
  const evaluation = await evaluationsRepo.createEvaluation({
    jobId: args.jobId,
    userId: args.userId ?? "anonymous",
    blocks: args.blocks,
  });

  // Fetch job data
  const job = await jobRepo.getJobById(args.jobId);
  if (!job) throw new Error(`Job not found: ${args.jobId}`);

  // Start async evaluation in background
  runEvaluationBlocks({
    evaluationId: evaluation.id,
    job: job as unknown as Record<string, unknown>,
    profile: (args.context?.profile as Record<string, unknown>) ?? {},
    blocks: args.blocks,
    context: args.context,
    onProgress: args.onProgress,
  }).catch((error) => {
    logger.error("Evaluation failed", {
      evaluationId: evaluation.id,
      error: error instanceof Error ? error.message : String(error),
    });
    evaluationsRepo.updateEvaluation(evaluation.id, {
      status: "failed",
      errorMessage: error instanceof Error ? error.message : String(error),
      completedAt: new Date().toISOString(),
    });
  });

  return evaluation.id;
}

async function runEvaluationBlocks(args: {
  evaluationId: string;
  job: Record<string, unknown>;
  profile: Record<string, unknown>;
  blocks: BlockName[];
  context?: Record<string, unknown>;
  onProgress?: ProgressCallback;
}): Promise<void> {
  await evaluationsRepo.updateEvaluation(args.evaluationId, {
    status: "processing",
  });

  const completedBlocks: BlockName[] = [];

  for (const block of args.blocks) {
    args.onProgress?.({
      evaluationId: args.evaluationId,
      block,
      status: "processing",
    });

    try {
      const result = await runBlock({
        evaluationId: args.evaluationId,
        block,
        job: args.job,
        profile: args.profile,
        context: args.context,
      });

      completedBlocks.push(block);

      // Update the evaluation's block completion flag
      const blockFlagMap: Record<
        BlockName,
        { completedKey: string; dataKey: string }
      > = {
        A: { completedKey: "blockACompleted", dataKey: "blockAData" },
        B: { completedKey: "blockBCompleted", dataKey: "blockBData" },
        C: { completedKey: "blockCCompleted", dataKey: "blockCData" },
        D: { completedKey: "blockDCompleted", dataKey: "blockDData" },
        E: { completedKey: "blockECompleted", dataKey: "blockEData" },
        F: { completedKey: "blockFCompleted", dataKey: "blockFData" },
        G: { completedKey: "blockGCompleted", dataKey: "blockGData" },
      };
      const flag = blockFlagMap[block];
      await evaluationsRepo.updateEvaluation(args.evaluationId, {
        [flag.completedKey]: true,
        [flag.dataKey]: JSON.stringify(result.data),
      } as Parameters<typeof evaluationsRepo.updateEvaluation>[1]);

      args.onProgress?.({
        evaluationId: args.evaluationId,
        block,
        status: "completed",
        data: result.data,
      });
    } catch (error) {
      args.onProgress?.({
        evaluationId: args.evaluationId,
        block,
        status: "failed",
        error: error instanceof Error ? error.message : String(error),
      });
      // Continue with remaining blocks
    }
  }

  const allCompleted = completedBlocks.length === args.blocks.length;
  await evaluationsRepo.updateEvaluation(args.evaluationId, {
    status: allCompleted ? "completed" : "partial",
    completedAt: new Date().toISOString(),
  });
}

export async function getEvaluationWithBlocks(evaluationId: string) {
  const evaluation = await evaluationsRepo.getEvaluation(evaluationId);
  if (!evaluation) return null;

  const blocks = await evaluationsRepo.listBlocksForEvaluation(evaluationId);
  return { evaluation, blocks };
}
