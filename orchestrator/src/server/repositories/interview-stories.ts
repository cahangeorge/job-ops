import { conflict, notFound } from "@infra/errors";
import type {
  CreateInterviewStoryInput,
  InterviewStory,
  UpdateInterviewStoryInput,
} from "@shared/types";
import { and, desc, eq, inArray, sql } from "drizzle-orm";
import { db, schema } from "../db/index";
import { getActiveTenantId } from "../tenancy/context";

const {
  interviewStories,
  jobs,
  storyTagAssignments,
  storyTags,
  storyUsageEvents,
} = schema;

export type StoryBankTag = { id: string; name: string };
export type StoryBankStory = InterviewStory & {
  storyTags: StoryBankTag[];
  usageCount: number;
  lastUsedAt: string | null;
};

export type StoryUsageInput = {
  storyId: string;
  jobId: string;
  usageKind: "draft" | "submitted_application" | "interview_prep";
  provenance: string;
};

export async function getAllInterviewStories(
  options: { tagIds?: string[] } = {},
): Promise<StoryBankStory[]> {
  const tenantId = getActiveTenantId();
  const tagIds = [...new Set(options.tagIds ?? [])];
  let matchingStoryIds: string[] | undefined;
  if (tagIds.length > 0) {
    matchingStoryIds = (
      await db
        .select({ storyId: storyTagAssignments.storyId })
        .from(storyTagAssignments)
        .where(
          and(
            eq(storyTagAssignments.tenantId, tenantId),
            inArray(storyTagAssignments.tagId, tagIds),
          ),
        )
    ).map((row) => row.storyId);
    if (matchingStoryIds.length === 0) return [];
  }
  const rows = await db
    .select()
    .from(interviewStories)
    .where(
      matchingStoryIds
        ? and(
            eq(interviewStories.tenantId, tenantId),
            inArray(interviewStories.id, matchingStoryIds),
          )
        : eq(interviewStories.tenantId, tenantId),
    )
    .orderBy(desc(interviewStories.createdAt));
  return decorateStories(rows);
}

export async function getInterviewStoryById(
  id: string,
): Promise<StoryBankStory | null> {
  const tenantId = getActiveTenantId();
  const row = await db
    .select()
    .from(interviewStories)
    .where(
      and(eq(interviewStories.id, id), eq(interviewStories.tenantId, tenantId)),
    )
    .limit(1)
    .get();
  if (!row) return null;
  return (await decorateStories([row]))[0] ?? null;
}

export async function createInterviewStory(
  input: CreateInterviewStoryInput,
): Promise<StoryBankStory> {
  const tenantId = getActiveTenantId();
  const id = crypto.randomUUID();
  const now = new Date().toISOString();
  await db.insert(interviewStories).values({
    id,
    tenantId,
    title: input.title,
    situation: input.situation,
    task: input.task,
    action: input.action,
    result: input.result,
    reflection: input.reflection ?? null,
    skills: input.skills ?? null,
    tags: input.tags ?? null,
    isMasterStory: input.isMasterStory ?? false,
    createdAt: now,
    updatedAt: now,
  });
  const created = await getInterviewStoryById(id);
  if (!created) throw new Error("Failed to create interview story");
  return created;
}

export async function updateInterviewStory(
  id: string,
  input: UpdateInterviewStoryInput,
): Promise<StoryBankStory | null> {
  const tenantId = getActiveTenantId();
  const now = new Date().toISOString();
  const setValues: Record<string, unknown> = { updatedAt: now };
  if (input.title !== undefined) setValues.title = input.title;
  if (input.situation !== undefined) setValues.situation = input.situation;
  if (input.task !== undefined) setValues.task = input.task;
  if (input.action !== undefined) setValues.action = input.action;
  if (input.result !== undefined) setValues.result = input.result;
  if (input.reflection !== undefined) setValues.reflection = input.reflection;
  if (input.skills !== undefined) setValues.skills = input.skills;
  if (input.tags !== undefined) setValues.tags = input.tags;
  if (input.isMasterStory !== undefined)
    setValues.isMasterStory = input.isMasterStory;

  await db
    .update(interviewStories)
    .set(setValues)
    .where(
      and(eq(interviewStories.id, id), eq(interviewStories.tenantId, tenantId)),
    );

  return getInterviewStoryById(id);
}

export async function getStoryTags(): Promise<StoryBankTag[]> {
  const tenantId = getActiveTenantId();
  return db
    .select({ id: storyTags.id, name: storyTags.name })
    .from(storyTags)
    .where(eq(storyTags.tenantId, tenantId))
    .orderBy(storyTags.name);
}

export async function createStoryTag(rawName: string): Promise<StoryBankTag> {
  const tenantId = getActiveTenantId();
  const name = normalizeTagName(rawName);
  try {
    const [tag] = await db
      .insert(storyTags)
      .values({
        id: crypto.randomUUID(),
        tenantId,
        name,
        createdAt: new Date().toISOString(),
      })
      .returning({ id: storyTags.id, name: storyTags.name });
    if (!tag) throw new Error("Failed to create story tag");
    return tag;
  } catch (error) {
    if (isUniqueConstraint(error))
      throw conflict("A tag with this name already exists");
    throw error;
  }
}

export async function deleteStoryTag(tagId: string): Promise<boolean> {
  const tenantId = getActiveTenantId();
  const deleted = await db
    .delete(storyTags)
    .where(and(eq(storyTags.id, tagId), eq(storyTags.tenantId, tenantId)))
    .returning({ id: storyTags.id });
  return deleted.length > 0;
}

export async function updateStoryTag(
  tagId: string,
  rawName: string,
): Promise<StoryBankTag | null> {
  const tenantId = getActiveTenantId();
  const name = normalizeTagName(rawName);
  try {
    const [tag] = await db
      .update(storyTags)
      .set({ name })
      .where(and(eq(storyTags.id, tagId), eq(storyTags.tenantId, tenantId)))
      .returning({ id: storyTags.id, name: storyTags.name });
    return tag ?? null;
  } catch (error) {
    if (isUniqueConstraint(error))
      throw conflict("A tag with this name already exists");
    throw error;
  }
}

export async function assignStoryTag(
  storyId: string,
  tagId: string,
): Promise<void> {
  const tenantId = getActiveTenantId();
  await requireStoryAndTag(storyId, tagId, tenantId);
  try {
    await db.insert(storyTagAssignments).values({
      id: crypto.randomUUID(),
      tenantId,
      storyId,
      tagId,
      createdAt: new Date().toISOString(),
    });
  } catch (error) {
    if (!isUniqueConstraint(error)) throw error;
  }
}

export async function unassignStoryTag(
  storyId: string,
  tagId: string,
): Promise<boolean> {
  const tenantId = getActiveTenantId();
  const deleted = await db
    .delete(storyTagAssignments)
    .where(
      and(
        eq(storyTagAssignments.tenantId, tenantId),
        eq(storyTagAssignments.storyId, storyId),
        eq(storyTagAssignments.tagId, tagId),
      ),
    )
    .returning({ id: storyTagAssignments.id });
  return deleted.length > 0;
}

export async function assignStoryUsage(input: StoryUsageInput) {
  const tenantId = getActiveTenantId();
  const [story, job] = await Promise.all([
    db
      .select({ id: interviewStories.id })
      .from(interviewStories)
      .where(
        and(
          eq(interviewStories.id, input.storyId),
          eq(interviewStories.tenantId, tenantId),
        ),
      )
      .limit(1)
      .get(),
    db
      .select({ id: jobs.id })
      .from(jobs)
      .where(and(eq(jobs.id, input.jobId), eq(jobs.tenantId, tenantId)))
      .limit(1)
      .get(),
  ]);
  if (!story || !job) throw notFound("Interview story or job not found");
  const [event] = await db
    .insert(storyUsageEvents)
    .values({
      id: crypto.randomUUID(),
      tenantId,
      ...input,
      createdAt: new Date().toISOString(),
    })
    .returning();
  if (!event) throw new Error("Failed to record story usage");
  return event;
}

async function requireStoryAndTag(
  storyId: string,
  tagId: string,
  tenantId: string,
): Promise<void> {
  const [story, tag] = await Promise.all([
    db
      .select({ id: interviewStories.id })
      .from(interviewStories)
      .where(
        and(
          eq(interviewStories.id, storyId),
          eq(interviewStories.tenantId, tenantId),
        ),
      )
      .limit(1)
      .get(),
    db
      .select({ id: storyTags.id })
      .from(storyTags)
      .where(and(eq(storyTags.id, tagId), eq(storyTags.tenantId, tenantId)))
      .limit(1)
      .get(),
  ]);
  if (!story || !tag) throw notFound("Interview story or tag not found");
}

async function decorateStories(
  rows: (typeof interviewStories.$inferSelect)[],
): Promise<StoryBankStory[]> {
  if (rows.length === 0) return [];
  const tenantId = getActiveTenantId();
  const storyIds = rows.map((row) => row.id);
  const [tagRows, usageRows] = await Promise.all([
    db
      .select({
        storyId: storyTagAssignments.storyId,
        id: storyTags.id,
        name: storyTags.name,
      })
      .from(storyTagAssignments)
      .innerJoin(
        storyTags,
        and(
          eq(storyTags.id, storyTagAssignments.tagId),
          eq(storyTags.tenantId, storyTagAssignments.tenantId),
        ),
      )
      .where(
        and(
          eq(storyTagAssignments.tenantId, tenantId),
          inArray(storyTagAssignments.storyId, storyIds),
        ),
      ),
    db
      .select({
        storyId: storyUsageEvents.storyId,
        usageCount: sql<number>`count(*)`,
        lastUsedAt: sql<string | null>`max(${storyUsageEvents.createdAt})`,
      })
      .from(storyUsageEvents)
      .where(
        and(
          eq(storyUsageEvents.tenantId, tenantId),
          inArray(storyUsageEvents.storyId, storyIds),
        ),
      )
      .groupBy(storyUsageEvents.storyId),
  ]);
  const tagsByStory = new Map<string, StoryBankTag[]>();
  for (const row of tagRows)
    tagsByStory.set(row.storyId, [
      ...(tagsByStory.get(row.storyId) ?? []),
      { id: row.id, name: row.name },
    ]);
  const usageByStory = new Map(usageRows.map((row) => [row.storyId, row]));
  return rows.map((row) => {
    const usage = usageByStory.get(row.id);
    return {
      ...mapRowToStory(row),
      storyTags: tagsByStory.get(row.id) ?? [],
      usageCount: Number(usage?.usageCount ?? 0),
      lastUsedAt: usage?.lastUsedAt ?? null,
    };
  });
}

export function normalizeTagName(value: string): string {
  return value.trim().replace(/\s+/g, " ").toLocaleLowerCase();
}

function isUniqueConstraint(error: unknown): boolean {
  return error instanceof Error && /unique constraint/i.test(error.message);
}

export async function deleteInterviewStory(id: string): Promise<boolean> {
  const tenantId = getActiveTenantId();
  const result = await db
    .delete(interviewStories)
    .where(
      and(eq(interviewStories.id, id), eq(interviewStories.tenantId, tenantId)),
    )
    .returning();
  return result.length > 0;
}

function mapRowToStory(
  row: typeof interviewStories.$inferSelect,
): InterviewStory {
  return {
    id: row.id,
    tenantId: row.tenantId,
    title: row.title,
    situation: row.situation,
    task: row.task,
    action: row.action,
    result: row.result,
    reflection: row.reflection ?? null,
    skills: row.skills ?? null,
    tags: row.tags ?? null,
    isMasterStory: row.isMasterStory ?? false,
    createdAt: row.createdAt,
    updatedAt: row.updatedAt,
  };
}
