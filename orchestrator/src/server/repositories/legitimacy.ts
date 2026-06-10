import { createId } from "@paralleldrive/cuid2";
import { and, desc, eq, inArray } from "drizzle-orm";
import { db, schema } from "../db";
import { getActiveTenantId } from "../tenancy/context";

const { legitimacyScores, legitimacySignals } = schema;

// ─── Legitimacy Signals ──────────────────────────────────────────────────────

export async function createSignal(args: {
  jobId: string;
  postingAge?: number;
  recencyScore?: number;
  descriptionPatternScore?: number;
  companyVerificationScore?: number;
  socialPresenceScore?: number;
  rawSignals?: Record<string, unknown>;
}): Promise<typeof legitimacySignals.$inferSelect> {
  const tenantId = getActiveTenantId();
  const id = createId();
  const now = new Date().toISOString();

  await db.insert(legitimacySignals).values({
    id,
    tenantId,
    jobId: args.jobId,
    postingAge: args.postingAge ?? null,
    recencyScore: args.recencyScore ?? null,
    descriptionPatternScore: args.descriptionPatternScore ?? null,
    companyVerificationScore: args.companyVerificationScore ?? null,
    socialPresenceScore: args.socialPresenceScore ?? null,
    rawSignals: args.rawSignals ? JSON.stringify(args.rawSignals) : null,
    gatheredAt: now,
  });

  const [row] = await db
    .select()
    .from(legitimacySignals)
    .where(eq(legitimacySignals.id, id));

  return row!;
}

export async function getLatestSignalForJob(
  jobId: string,
): Promise<typeof legitimacySignals.$inferSelect | null> {
  const tenantId = getActiveTenantId();
  const [row] = await db
    .select()
    .from(legitimacySignals)
    .where(
      and(
        eq(legitimacySignals.tenantId, tenantId),
        eq(legitimacySignals.jobId, jobId),
      ),
    )
    .orderBy(desc(legitimacySignals.gatheredAt))
    .limit(1);
  return row ?? null;
}

// ─── Legitimacy Scores ────────────────────────────────────────────────────────

export async function createScore(args: {
  jobId: string;
  signalId: string;
  score: number;
  confidence: string;
  redFlags?: string[];
  llmAnalysis?: string;
}): Promise<typeof legitimacyScores.$inferSelect> {
  const tenantId = getActiveTenantId();
  const id = createId();
  const now = new Date().toISOString();

  await db.insert(legitimacyScores).values({
    id,
    tenantId,
    jobId: args.jobId,
    signalId: args.signalId,
    score: args.score,
    confidence: args.confidence as "high" | "medium" | "low",
    redFlags: JSON.stringify(args.redFlags ?? []),
    llmAnalysis: args.llmAnalysis ?? null,
    analyzedAt: now,
  });

  const [row] = await db
    .select()
    .from(legitimacyScores)
    .where(eq(legitimacyScores.id, id));

  return row!;
}

export async function getLatestScoreForJob(
  jobId: string,
): Promise<typeof legitimacyScores.$inferSelect | null> {
  const tenantId = getActiveTenantId();
  const [row] = await db
    .select()
    .from(legitimacyScores)
    .where(
      and(
        eq(legitimacyScores.tenantId, tenantId),
        eq(legitimacyScores.jobId, jobId),
      ),
    )
    .orderBy(desc(legitimacyScores.analyzedAt))
    .limit(1);
  return row ?? null;
}

export async function listScoresForJobs(
  jobIds: string[],
): Promise<(typeof legitimacyScores.$inferSelect)[]> {
  if (jobIds.length === 0) return [];
  const tenantId = getActiveTenantId();
  return db
    .select()
    .from(legitimacyScores)
    .where(
      and(
        eq(legitimacyScores.tenantId, tenantId),
        inArray(legitimacyScores.jobId, jobIds),
      ),
    )
    .orderBy(desc(legitimacyScores.analyzedAt));
}
