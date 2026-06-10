import { createId } from "@paralleldrive/cuid2";
import { and, desc, eq } from "drizzle-orm";
import { db, schema } from "../db";
import { getActiveTenantId } from "../tenancy/context";

const { writingStyleProfiles } = schema;

export async function getProfileForUser(
  userId: string,
): Promise<typeof writingStyleProfiles.$inferSelect | null> {
  const tenantId = getActiveTenantId();
  const [row] = await db
    .select()
    .from(writingStyleProfiles)
    .where(
      and(
        eq(writingStyleProfiles.tenantId, tenantId),
        eq(writingStyleProfiles.userId, userId),
      ),
    )
    .orderBy(desc(writingStyleProfiles.calibratedAt))
    .limit(1);
  return row ?? null;
}

export async function upsertProfile(args: {
  userId: string;
  tone: string;
  sentenceLength: string;
  vocabulary: string;
  structure: string;
  personalityTraits?: string[];
  sampleCount?: number;
}): Promise<typeof writingStyleProfiles.$inferSelect> {
  const tenantId = getActiveTenantId();
  const now = new Date().toISOString();

  // Check for existing profile
  const existing = await getProfileForUser(args.userId);

  if (existing) {
    await db
      .update(writingStyleProfiles)
      .set({
        tone: args.tone,
        sentenceLength: args.sentenceLength,
        vocabulary: args.vocabulary,
        structure: args.structure,
        personalityTraits: JSON.stringify(args.personalityTraits ?? []),
        sampleCount: args.sampleCount ?? existing.sampleCount,
        calibratedAt: now,
        updatedAt: now,
      })
      .where(
        and(
          eq(writingStyleProfiles.tenantId, tenantId),
          eq(writingStyleProfiles.id, existing.id),
        ),
      );

    const [row] = await db
      .select()
      .from(writingStyleProfiles)
      .where(eq(writingStyleProfiles.id, existing.id));

    return row!;
  }

  const id = createId();
  await db.insert(writingStyleProfiles).values({
    id,
    tenantId,
    userId: args.userId,
    tone: args.tone,
    sentenceLength: args.sentenceLength,
    vocabulary: args.vocabulary,
    structure: args.structure,
    personalityTraits: JSON.stringify(args.personalityTraits ?? []),
    sampleCount: args.sampleCount ?? 0,
    calibratedAt: now,
    createdAt: now,
    updatedAt: now,
  });

  const [row] = await db
    .select()
    .from(writingStyleProfiles)
    .where(eq(writingStyleProfiles.id, id));

  return row!;
}

export async function deleteProfile(profileId: string): Promise<void> {
  const tenantId = getActiveTenantId();
  await db
    .delete(writingStyleProfiles)
    .where(
      and(
        eq(writingStyleProfiles.tenantId, tenantId),
        eq(writingStyleProfiles.id, profileId),
      ),
    );
}
