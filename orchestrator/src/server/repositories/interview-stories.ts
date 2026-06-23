import { eq, and, desc } from "drizzle-orm";
import { db, schema } from "../db/index";
import { getActiveTenantId } from "../tenancy/context";
import type { InterviewStory, CreateInterviewStoryInput, UpdateInterviewStoryInput } from "@shared/types";

const { interviewStories } = schema;

export async function getAllInterviewStories(): Promise<InterviewStory[]> {
  const tenantId = getActiveTenantId();
  const rows = await db
    .select()
    .from(interviewStories)
    .where(eq(interviewStories.tenantId, tenantId))
    .orderBy(desc(interviewStories.createdAt));
  return rows.map(mapRowToStory);
}

export async function getInterviewStoryById(id: string): Promise<InterviewStory | null> {
  const tenantId = getActiveTenantId();
  const row = await db
    .select()
    .from(interviewStories)
    .where(and(eq(interviewStories.id, id), eq(interviewStories.tenantId, tenantId)))
    .limit(1)
    .get();
  if (!row) return null;
  return mapRowToStory(row);
}

export async function createInterviewStory(input: CreateInterviewStoryInput): Promise<InterviewStory> {
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
  return created as InterviewStory;
}

export async function updateInterviewStory(id: string, input: UpdateInterviewStoryInput): Promise<InterviewStory | null> {
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
  if (input.isMasterStory !== undefined) setValues.isMasterStory = input.isMasterStory;

  await db
    .update(interviewStories)
    .set(setValues)
    .where(and(eq(interviewStories.id, id), eq(interviewStories.tenantId, tenantId)));

  return getInterviewStoryById(id);
}

export async function deleteInterviewStory(id: string): Promise<boolean> {
  const tenantId = getActiveTenantId();
  const result = await db
    .delete(interviewStories)
    .where(and(eq(interviewStories.id, id), eq(interviewStories.tenantId, tenantId)))
    .returning();
  return result.length > 0;
}

function mapRowToStory(row: typeof interviewStories.$inferSelect): InterviewStory {
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
