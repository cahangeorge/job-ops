import { logger } from "@infra/logger";
import * as interviewPrepRepo from "../repositories/interview-prep";
import * as jobRepo from "../repositories/jobs";
import { createConfiguredLlmService, resolveLlmModel } from "./modelSelection";

type Audience = "recruiter" | "hiring-manager" | "peer" | "general";

type PrepPackResult = {
  companyIntel: Record<string, unknown>;
  questions: string[];
  talkingPoints: string[];
};

// ─── Interview Prep Generation ────────────────────────────────────────────────

const AUDIENCE_INSTRUCTIONS: Record<Audience, string> = {
  recruiter:
    "Focus on cultural fit, career trajectory, and transferable skills. Prepare answers about teamwork, leadership potential, and company alignment.",
  "hiring-manager":
    "Focus on technical competence, problem-solving approach, and project impact. Prepare deep-dive answers about past projects and technical decisions.",
  peer: "Focus on collaboration style, technical depth, and day-to-day working patterns. Prepare for pair programming scenarios and system design discussions.",
  general:
    "Prepare a balanced set of questions and talking points covering technical skills, culture, and career growth.",
};

export async function generatePrepPack(args: {
  jobId: string;
  userId: string;
  audience: Audience;
  profile?: Record<string, unknown>;
}): Promise<string> {
  const pack = await interviewPrepRepo.createPrepPack({
    jobId: args.jobId,
    userId: args.userId,
    audience: args.audience,
  });

  // Run generation in background
  generatePrepPackContent({
    packId: pack.id,
    jobId: args.jobId,
    audience: args.audience,
    profile: args.profile,
  }).catch((error) => {
    logger.error("Interview prep generation failed", {
      packId: pack.id,
      error: error instanceof Error ? error.message : String(error),
    });
    interviewPrepRepo.updatePrepPack(pack.id, {
      status: "failed",
      errorMessage: error instanceof Error ? error.message : String(error),
    });
  });

  return pack.id;
}

async function generatePrepPackContent(args: {
  packId: string;
  jobId: string;
  audience: Audience;
  profile?: Record<string, unknown>;
}): Promise<void> {
  const job = await jobRepo.getJobById(args.jobId);
  if (!job) throw new Error(`Job not found: ${args.jobId}`);

  const model = await resolveLlmModel("scoring");
  const llm = await createConfiguredLlmService("scoring");

  const prompt = `You are an interview preparation specialist. Generate a comprehensive interview prep pack.

Job: ${JSON.stringify(job, null, 2)}

${args.profile ? `Candidate Profile: ${JSON.stringify(args.profile, null, 2)}` : ""}

Audience: ${args.audience}
Instructions: ${AUDIENCE_INSTRUCTIONS[args.audience]}

Generate:
1. Company intelligence (key facts, recent news, culture signals)
2. Likely interview questions (5-8 questions specific to this role and audience)
3. Talking points (3-5 key messages the candidate should convey)

Return as JSON with keys: companyIntel (object), questions (string array), talkingPoints (string array).`;

  const result = await llm.callJson<PrepPackResult>({
    model,
    messages: [{ role: "user", content: prompt }],
    jsonSchema: {
      name: "interview_prep_pack",
      schema: {
        type: "object",
        properties: {
          companyIntel: { type: "object" },
          questions: { type: "array", items: { type: "string" } },
          talkingPoints: { type: "array", items: { type: "string" } },
        },
        required: ["companyIntel", "questions", "talkingPoints"],
        additionalProperties: false,
      },
    },
    maxRetries: 2,
  });

  if (!result.success) {
    throw new Error(`Interview prep generation failed: ${result.error}`);
  }

  await interviewPrepRepo.updatePrepPack(args.packId, {
    status: "completed",
    companyIntel: JSON.stringify(result.data.companyIntel),
    questions: JSON.stringify(result.data.questions),
    talkingPoints: JSON.stringify(result.data.talkingPoints),
    generatedAt: new Date().toISOString(),
  });

  logger.info("Interview prep pack generated", {
    packId: args.packId,
    audience: args.audience,
    questionCount: result.data.questions.length,
  });
}

export async function getPrepPack(packId: string) {
  return interviewPrepRepo.getPrepPack(packId);
}

export async function listPrepPacksForJob(jobId: string) {
  return interviewPrepRepo.listPrepPacksForJob(jobId);
}

export async function listPrepPacksForUser(userId: string) {
  return interviewPrepRepo.listPrepPacksForUser(userId);
}
