import { createId } from "@paralleldrive/cuid2";
import { and, asc, desc, eq } from "drizzle-orm";
import { db, schema } from "../db";
import { getActiveTenantId } from "../tenancy/context";

const { evaluationBlocks, jobEvaluations } = schema;

// ─── Job Evaluations ──────────────────────────────────────────────────────────

export async function createEvaluation(args: {
  jobId: string;
  userId: string;
  blocks: string[];
}): Promise<typeof jobEvaluations.$inferSelect> {
  const tenantId = getActiveTenantId();
  const id = createId();
  const now = new Date().toISOString();

  await db.insert(jobEvaluations).values({
    id,
    tenantId,
    jobId: args.jobId,
    userId: args.userId,
    status: "pending",
    startedAt: now,
  });

  const [row] = await db
    .select()
    .from(jobEvaluations)
    .where(eq(jobEvaluations.id, id));

  return row!;
}

export async function getEvaluation(
  evaluationId: string,
): Promise<typeof jobEvaluations.$inferSelect | null> {
  const tenantId = getActiveTenantId();
  const [row] = await db
    .select()
    .from(jobEvaluations)
    .where(
      and(
        eq(jobEvaluations.tenantId, tenantId),
        eq(jobEvaluations.id, evaluationId),
      ),
    );
  return row ?? null;
}

export async function getLatestEvaluationForJob(
  jobId: string,
): Promise<typeof jobEvaluations.$inferSelect | null> {
  const tenantId = getActiveTenantId();
  const [row] = await db
    .select()
    .from(jobEvaluations)
    .where(
      and(
        eq(jobEvaluations.tenantId, tenantId),
        eq(jobEvaluations.jobId, jobId),
      ),
    )
    .orderBy(desc(jobEvaluations.startedAt))
    .limit(1);
  return row ?? null;
}

export async function updateEvaluation(
  evaluationId: string,
  data: Partial<typeof jobEvaluations.$inferInsert>,
): Promise<void> {
  const tenantId = getActiveTenantId();
  await db
    .update(jobEvaluations)
    .set(data)
    .where(
      and(
        eq(jobEvaluations.tenantId, tenantId),
        eq(jobEvaluations.id, evaluationId),
      ),
    );
}

export async function listEvaluationsForJob(
  jobId: string,
): Promise<(typeof jobEvaluations.$inferSelect)[]> {
  const tenantId = getActiveTenantId();
  return db
    .select()
    .from(jobEvaluations)
    .where(
      and(
        eq(jobEvaluations.tenantId, tenantId),
        eq(jobEvaluations.jobId, jobId),
      ),
    )
    .orderBy(desc(jobEvaluations.startedAt));
}

// ─── Evaluation Blocks ────────────────────────────────────────────────────────

export async function createBlock(args: {
  evaluationId: string;
  block: string;
}): Promise<typeof evaluationBlocks.$inferSelect> {
  const tenantId = getActiveTenantId();
  const id = createId();
  const now = new Date().toISOString();

  await db.insert(evaluationBlocks).values({
    id,
    evaluationId: args.evaluationId,
    tenantId,
    block: args.block as "A" | "B" | "C" | "D" | "E" | "F" | "G",
    status: "pending",
    startedAt: now,
  });

  const [row] = await db
    .select()
    .from(evaluationBlocks)
    .where(eq(evaluationBlocks.id, id));

  return row!;
}

export async function getBlock(
  blockId: string,
): Promise<typeof evaluationBlocks.$inferSelect | null> {
  const tenantId = getActiveTenantId();
  const [row] = await db
    .select()
    .from(evaluationBlocks)
    .where(
      and(
        eq(evaluationBlocks.tenantId, tenantId),
        eq(evaluationBlocks.id, blockId),
      ),
    );
  return row ?? null;
}

export async function getBlockByEvaluationAndName(
  evaluationId: string,
  block: string,
): Promise<typeof evaluationBlocks.$inferSelect | null> {
  const tenantId = getActiveTenantId();
  const [row] = await db
    .select()
    .from(evaluationBlocks)
    .where(
      and(
        eq(evaluationBlocks.tenantId, tenantId),
        eq(evaluationBlocks.evaluationId, evaluationId),
        eq(
          evaluationBlocks.block,
          block as "A" | "B" | "C" | "D" | "E" | "F" | "G",
        ),
      ),
    );
  return row ?? null;
}

export async function updateBlock(
  blockId: string,
  data: Partial<typeof evaluationBlocks.$inferInsert>,
): Promise<void> {
  const tenantId = getActiveTenantId();
  await db
    .update(evaluationBlocks)
    .set(data)
    .where(
      and(
        eq(evaluationBlocks.tenantId, tenantId),
        eq(evaluationBlocks.id, blockId),
      ),
    );
}

export async function listBlocksForEvaluation(
  evaluationId: string,
): Promise<(typeof evaluationBlocks.$inferSelect)[]> {
  const tenantId = getActiveTenantId();
  return db
    .select()
    .from(evaluationBlocks)
    .where(
      and(
        eq(evaluationBlocks.tenantId, tenantId),
        eq(evaluationBlocks.evaluationId, evaluationId),
      ),
    )
    .orderBy(asc(evaluationBlocks.block));
}
