import { logger } from "@infra/logger";
import * as storiesRepo from "../repositories/stories";

// ─── Story CRUD ───────────────────────────────────────────────────────────────

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
}) {
  return storiesRepo.createStory(args);
}

export async function getStory(storyId: string) {
  return storiesRepo.getStory(storyId);
}

export async function updateStory(
  storyId: string,
  data: Partial<{
    title: string;
    content: string;
    tags: string[];
    skills: string[];
    situation: string;
    task: string;
    action: string;
    result: string;
    reflection: string;
  }>,
) {
  return storiesRepo.updateStory(storyId, data);
}

export async function deleteStory(storyId: string) {
  return storiesRepo.deleteStory(storyId);
}

export async function listStories(userId: string) {
  return storiesRepo.listStoriesForUser(userId);
}

export async function searchStories(args: {
  userId: string;
  query?: string;
  tags?: string[];
  skills?: string[];
}) {
  return storiesRepo.searchStories(args);
}

// ─── Story Extraction from Evaluations ────────────────────────────────────────

export async function extractStoriesFromEvaluation(args: {
  evaluationId: string;
  userId: string;
  blockFData: Record<string, unknown>;
}): Promise<number> {
  const mappedStories = args.blockFData.mappedStories as Array<{
    jobRequirement: string;
    storyId?: string;
    starPlusR: Record<string, string>;
    relevanceScore: number;
  }>;

  if (!Array.isArray(mappedStories)) {
    logger.warn("No mapped stories in Block F data", {
      evaluationId: args.evaluationId,
    });
    return 0;
  }

  let created = 0;
  for (const mapped of mappedStories) {
    // If the story already exists (has a storyId), just create the mapping
    if (mapped.storyId) {
      const existing = await storiesRepo.getStory(mapped.storyId);
      if (existing) {
        await storiesRepo.createStoryMapping({
          evaluationId: args.evaluationId,
          storyId: mapped.storyId,
          jobRequirement: mapped.jobRequirement,
          relevanceScore: mapped.relevanceScore,
          starPlusR: mapped.starPlusR,
        });
        continue;
      }
    }

    // Create a new story from the STAR+R data
    const star = mapped.starPlusR;
    const story = await storiesRepo.createStory({
      userId: args.userId,
      title: mapped.jobRequirement,
      content: `Situation: ${star.situation || ""}\nTask: ${star.task || ""}\nAction: ${star.action || ""}\nResult: ${star.result || ""}\nReflection: ${star.reflection || ""}`,
      tags: [],
      skills: [],
      situation: star.situation,
      task: star.task,
      action: star.action,
      result: star.result,
      reflection: star.reflection,
    });

    await storiesRepo.createStoryMapping({
      evaluationId: args.evaluationId,
      storyId: story.id,
      jobRequirement: mapped.jobRequirement,
      relevanceScore: mapped.relevanceScore,
      starPlusR: mapped.starPlusR,
    });

    created++;
  }

  logger.info("Extracted stories from evaluation", {
    evaluationId: args.evaluationId,
    created,
    total: mappedStories.length,
  });

  return created;
}
