import { createId } from "@paralleldrive/cuid2";
import { and, desc, eq } from "drizzle-orm";
import { db, schema } from "../db";
import { getActiveTenantId } from "../tenancy/context";

const { interviewPrepPacks } = schema;

export async function createPrepPack(args: {
  jobId: string;
  userId: string;
  audience: string;
}): Promise<typeof interviewPrepPacks.$inferSelect> {
  const tenantId = getActiveTenantId();
  const id = createId();
  const now = new Date().toISOString();

  await db.insert(interviewPrepPacks).values({
    id,
    tenantId,
    jobId: args.jobId,
    userId: args.userId,
    audience: args.audience as
      | "recruiter"
      | "hiring-manager"
      | "peer"
      | "general",
    status: "generating",
    createdAt: now,
    updatedAt: now,
  });

  const [row] = await db
    .select()
    .from(interviewPrepPacks)
    .where(eq(interviewPrepPacks.id, id));

  return row!;
}

export async function getPrepPack(
  packId: string,
): Promise<typeof interviewPrepPacks.$inferSelect | null> {
  const tenantId = getActiveTenantId();
  const [row] = await db
    .select()
    .from(interviewPrepPacks)
    .where(
      and(
        eq(interviewPrepPacks.tenantId, tenantId),
        eq(interviewPrepPacks.id, packId),
      ),
    );
  return row ?? null;
}

export async function updatePrepPack(
  packId: string,
  data: Partial<typeof interviewPrepPacks.$inferInsert>,
): Promise<void> {
  const tenantId = getActiveTenantId();
  const now = new Date().toISOString();
  await db
    .update(interviewPrepPacks)
    .set({ ...data, updatedAt: now })
    .where(
      and(
        eq(interviewPrepPacks.tenantId, tenantId),
        eq(interviewPrepPacks.id, packId),
      ),
    );
}

export async function listPrepPacksForJob(
  jobId: string,
): Promise<(typeof interviewPrepPacks.$inferSelect)[]> {
  const tenantId = getActiveTenantId();
  return db
    .select()
    .from(interviewPrepPacks)
    .where(
      and(
        eq(interviewPrepPacks.tenantId, tenantId),
        eq(interviewPrepPacks.jobId, jobId),
      ),
    )
    .orderBy(desc(interviewPrepPacks.createdAt));
}

export async function listPrepPacksForUser(
  userId: string,
): Promise<(typeof interviewPrepPacks.$inferSelect)[]> {
  const tenantId = getActiveTenantId();
  return db
    .select()
    .from(interviewPrepPacks)
    .where(
      and(
        eq(interviewPrepPacks.tenantId, tenantId),
        eq(interviewPrepPacks.userId, userId),
      ),
    )
    .orderBy(desc(interviewPrepPacks.createdAt));
}
