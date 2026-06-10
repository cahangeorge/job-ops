import { createId } from "@paralleldrive/cuid2";
import { and, desc, eq } from "drizzle-orm";
import { db, schema } from "../db";
import { getActiveTenantId } from "../tenancy/context";

const { storyMappings, stories } = schema;

// ─── Stories ──────────────────────────────────────────────────────────────────

export async function createStory(args: {
  userId: string;
  title: string;
  content: string;
  tags?: string[];
  skills?: string[];
  situation?: string;
  task?: string;
  action?: string;
  result?: string;
  reflection?: string;
}): Promise<typeof stories.$inferSelect> {
  const tenantId = getActiveTenantId();
  const id = createId();
  const now = new Date().toISOString();

  await db.insert(stories).values({
    id,
    tenantId,
    userId: args.userId,
    title: args.title,
    content: args.content,
    tags: JSON.stringify(args.tags ?? []),
    skills: JSON.stringify(args.skills ?? []),
    situation: args.situation ?? null,
    task: args.task ?? null,
    action: args.action ?? null,
    result: args.result ?? null,
    reflection: args.reflection ?? null,
    version: 1,
    createdAt: now,
    updatedAt: now,
  });

  const [row] = await db.select().from(stories).where(eq(stories.id, id));
  return row!;
}

export async function getStory(
  storyId: string,
): Promise<typeof stories.$inferSelect | null> {
  const tenantId = getActiveTenantId();
  const [row] = await db
    .select()
    .from(stories)
    .where(and(eq(stories.tenantId, tenantId), eq(stories.id, storyId)));
  return row ?? null;
}

export async function updateStory(
  storyId: string,
  data: Partial<typeof stories.$inferInsert>,
): Promise<void> {
  const tenantId = getActiveTenantId();
  const now = new Date().toISOString();
  await db
    .update(stories)
    .set({ ...data, updatedAt: now })
    .where(and(eq(stories.tenantId, tenantId), eq(stories.id, storyId)));
}

export async function deleteStory(storyId: string): Promise<void> {
  const tenantId = getActiveTenantId();
  await db
    .delete(stories)
    .where(and(eq(stories.tenantId, tenantId), eq(stories.id, storyId)));
}

export async function listStoriesForUser(
  userId: string,
): Promise<(typeof stories.$inferSelect)[]> {
  const tenantId = getActiveTenantId();
  return db
    .select()
    .from(stories)
    .where(and(eq(stories.tenantId, tenantId), eq(stories.userId, userId)))
    .orderBy(desc(stories.updatedAt));
}

export async function searchStories(args: {
  userId: string;
  query?: string;
  tags?: string[];
  skills?: string[];
}): Promise<(typeof stories.$inferSelect)[]> {
  const tenantId = getActiveTenantId();
  const conditions = [
    eq(stories.tenantId, tenantId),
    eq(stories.userId, args.userId),
  ];

  const rows = await db
    .select()
    .from(stories)
    .where(and(...conditions))
    .orderBy(desc(stories.updatedAt));

  // Post-query filtering for JSON fields (tags/skills) and text search
  return rows.filter((row) => {
    if (args.query) {
      const q = args.query.toLowerCase();
      const searchable = `${row.title} ${row.content}`.toLowerCase();
      if (!searchable.includes(q)) return false;
    }
    if (args.tags?.length) {
      const rowTags: string[] = JSON.parse(String(row.tags ?? "[]"));
      if (!args.tags.some((t) => rowTags.includes(t))) return false;
    }
    if (args.skills?.length) {
      const rowSkills: string[] = JSON.parse(String(row.skills ?? "[]"));
      if (!args.skills.some((s) => rowSkills.includes(s))) return false;
    }
    return true;
  });
}

// ─── Story Mappings ───────────────────────────────────────────────────────────

export async function createStoryMapping(args: {
  evaluationId: string;
  storyId: string;
  jobRequirement: string;
  relevanceScore: number;
  starPlusR: Record<string, string>;
}): Promise<typeof storyMappings.$inferSelect> {
  const tenantId = getActiveTenantId();
  const id = createId();
  const now = new Date().toISOString();

  await db.insert(storyMappings).values({
    id,
    tenantId,
    evaluationId: args.evaluationId,
    storyId: args.storyId,
    jobRequirement: args.jobRequirement,
    relevanceScore: args.relevanceScore,
    starPlusR: JSON.stringify(args.starPlusR),
    createdAt: now,
  });

  const [row] = await db
    .select()
    .from(storyMappings)
    .where(eq(storyMappings.id, id));

  return row!;
}

export async function listMappingsForEvaluation(
  evaluationId: string,
): Promise<(typeof storyMappings.$inferSelect)[]> {
  const tenantId = getActiveTenantId();
  return db
    .select()
    .from(storyMappings)
    .where(
      and(
        eq(storyMappings.tenantId, tenantId),
        eq(storyMappings.evaluationId, evaluationId),
      ),
    )
    .orderBy(desc(storyMappings.relevanceScore));
}

export async function deleteMappingsForEvaluation(
  evaluationId: string,
): Promise<void> {
  const tenantId = getActiveTenantId();
  await db
    .delete(storyMappings)
    .where(
      and(
        eq(storyMappings.tenantId, tenantId),
        eq(storyMappings.evaluationId, evaluationId),
      ),
    );
}
