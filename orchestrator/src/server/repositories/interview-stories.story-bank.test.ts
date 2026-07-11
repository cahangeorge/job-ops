import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { eq } from "drizzle-orm";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

describe.sequential("story bank repository", () => {
  const originalEnv = { ...process.env };
  let tempDir = "";
  let db: Awaited<typeof import("../db/index")>["db"];
  let schema: Awaited<typeof import("../db/index")>["schema"];
  let storiesRepo: Awaited<typeof import("./interview-stories")>;
  let runWithRequestContext: typeof import("@infra/request-context").runWithRequestContext;

  const inTenant = <T>(tenantId: string, fn: () => Promise<T>) =>
    runWithRequestContext({ requestId: `request-${tenantId}`, tenantId }, fn);

  beforeEach(async () => {
    vi.resetModules();
    tempDir = await mkdtemp(join(tmpdir(), "story-bank-repo-"));
    process.env = { ...originalEnv, DATA_DIR: tempDir, NODE_ENV: "test" };

    await import("../db/migrate");
    ({ db, schema } = await import("../db/index"));
    storiesRepo = await import("./interview-stories");
    ({ runWithRequestContext } = await import("@infra/request-context"));

    await db.insert(schema.tenants).values([
      { id: "tenant-a", name: "Tenant A", slug: "tenant-a" },
      { id: "tenant-b", name: "Tenant B", slug: "tenant-b" },
    ]);
    await db.insert(schema.jobs).values([
      {
        id: "job-a",
        tenantId: "tenant-a",
        source: "manual",
        title: "Tenant A role",
        employer: "Acme",
        jobUrl: "https://example.com/jobs/a",
      },
      {
        id: "job-b",
        tenantId: "tenant-b",
        source: "manual",
        title: "Tenant B role",
        employer: "Beta",
        jobUrl: "https://example.com/jobs/b",
      },
    ]);
  });

  afterEach(async () => {
    const { closeDb } = await import("../db/index");
    closeDb();
    await rm(tempDir, { recursive: true, force: true });
    process.env = { ...originalEnv };
  });

  it("normalizes tag names per tenant and returns tags and usage summaries with stories", async () => {
    const story = await inTenant("tenant-a", () =>
      storiesRepo.createInterviewStory({
        title: "Launch recovery",
        situation: "Traffic spike",
        task: "Recover safely",
        action: "Throttled work",
        result: "Recovered",
        reflection: null,
        skills: null,
        tags: null,
        isMasterStory: false,
      }),
    );
    const tag = await inTenant("tenant-a", () =>
      storiesRepo.createStoryTag("  Leadership  "),
    );

    await expect(
      inTenant("tenant-a", () => storiesRepo.createStoryTag("leadership")),
    ).rejects.toMatchObject({
      code: "CONFLICT",
    });
    await inTenant("tenant-a", () =>
      storiesRepo.assignStoryTag(story.id, tag.id),
    );
    await inTenant("tenant-a", () =>
      storiesRepo.assignStoryUsage({
        storyId: story.id,
        jobId: "job-a",
        usageKind: "draft",
        provenance: '{"source":"story-bank-test"}',
      }),
    );

    const stories = await inTenant("tenant-a", () =>
      storiesRepo.getAllInterviewStories(),
    );

    expect(stories).toEqual([
      expect.objectContaining({
        id: story.id,
        storyTags: [{ id: tag.id, name: "leadership" }],
        usageCount: 1,
        lastUsedAt: expect.any(String),
      }),
    ]);
  });

  it("does not expose or relate cross-tenant stories, tags, jobs, or usage events", async () => {
    const [storyA, storyB] = await Promise.all([
      inTenant("tenant-a", () =>
        storiesRepo.createInterviewStory(storyInput("A")),
      ),
      inTenant("tenant-b", () =>
        storiesRepo.createInterviewStory(storyInput("B")),
      ),
    ]);
    const tagA = await inTenant("tenant-a", () =>
      storiesRepo.createStoryTag("delivery"),
    );

    await expect(
      inTenant("tenant-a", () =>
        storiesRepo.assignStoryTag(storyB.id, tagA.id),
      ),
    ).rejects.toMatchObject({
      code: "NOT_FOUND",
    });
    await expect(
      inTenant("tenant-a", () =>
        storiesRepo.assignStoryUsage({
          storyId: storyA.id,
          jobId: "job-b",
          usageKind: "interview_prep",
          provenance: '{"source":"cross-tenant-test"}',
        }),
      ),
    ).rejects.toMatchObject({ code: "NOT_FOUND" });
    expect(
      await inTenant("tenant-a", () =>
        storiesRepo.getInterviewStoryById(storyB.id),
      ),
    ).toBeNull();
  });

  it("filters stories by assigned tag and leaves usage events append-only", async () => {
    const [leadership, delivery] = await inTenant("tenant-a", async () => [
      await storiesRepo.createStoryTag("leadership"),
      await storiesRepo.createStoryTag("delivery"),
    ]);
    const matching = await inTenant("tenant-a", () =>
      storiesRepo.createInterviewStory(storyInput("Match")),
    );
    const excluded = await inTenant("tenant-a", () =>
      storiesRepo.createInterviewStory(storyInput("Excluded")),
    );
    await inTenant("tenant-a", () =>
      storiesRepo.assignStoryTag(matching.id, leadership.id),
    );
    await inTenant("tenant-a", () =>
      storiesRepo.assignStoryTag(excluded.id, delivery.id),
    );

    const filtered = await inTenant("tenant-a", () =>
      storiesRepo.getAllInterviewStories({ tagIds: [leadership.id] }),
    );
    expect(filtered.map((story) => story.id)).toEqual([matching.id]);

    const event = await inTenant("tenant-a", () =>
      storiesRepo.assignStoryUsage({
        storyId: matching.id,
        jobId: "job-a",
        usageKind: "submitted_application",
        provenance: '{"source":"submission-test"}',
      }),
    );
    await expect(
      db
        .update(schema.storyUsageEvents)
        .set({ provenance: "mutated" })
        .where(eq(schema.storyUsageEvents.id, event.id)),
    ).rejects.toThrow("append-only");
  });
});

function storyInput(title: string) {
  return {
    title,
    situation: "Situation",
    task: "Task",
    action: "Action",
    result: "Result",
    reflection: null,
    skills: null,
    tags: null,
    isMasterStory: false,
  };
}
