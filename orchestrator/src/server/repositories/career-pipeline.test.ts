import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

describe.sequential("career pipeline projection repository", () => {
  const originalEnv = { ...process.env };
  let tempDir: string;
  let closeDb: (() => void) | null = null;

  beforeEach(async () => {
    tempDir = await mkdtemp(join(tmpdir(), "job-ops-pipeline-projection-"));
    vi.resetModules();
    process.env = { ...originalEnv, DATA_DIR: tempDir, NODE_ENV: "test" };
    await import("@server/db/migrate");
    ({ closeDb } = await import("@server/db"));
  });

  afterEach(async () => {
    closeDb?.();
    closeDb = null;
    process.env = { ...originalEnv };
    await rm(tempDir, { recursive: true, force: true });
  });

  it("projects canonical activity into stable board columns", async () => {
    const { db, schema } = await import("@server/db");
    const { runWithRequestContext } = await import(
      "@server/infra/request-context"
    );
    const { getCareerPipelineProjection } = await import("./career-pipeline");

    await db.insert(schema.jobs).values([
      {
        id: "job-alpha",
        tenantId: "tenant_default",
        source: "manual",
        title: "Alpha Engineer",
        employer: "Acme",
        jobUrl: "https://example.com/alpha",
        status: "in_progress",
        appliedAt: "2023-10-01T00:00:00.000Z",
        discoveredAt: "2023-10-01T00:00:00.000Z",
        createdAt: "2023-10-01T00:00:00.000Z",
        updatedAt: "2023-10-01T00:00:00.000Z",
      },
      {
        id: "job-beta",
        tenantId: "tenant_default",
        source: "manual",
        title: "Beta Engineer",
        employer: "Beta Co",
        jobUrl: "https://example.com/beta",
        status: "in_progress",
        appliedAt: "2023-11-01T00:00:00.000Z",
        discoveredAt: "2023-11-01T00:00:00.000Z",
        createdAt: "2023-11-01T00:00:00.000Z",
        updatedAt: "2023-11-01T00:00:00.000Z",
      },
    ]);
    await db.insert(schema.stageEvents).values([
      {
        id: "event-alpha-earlier",
        tenantId: "tenant_default",
        applicationId: "job-alpha",
        title: "Recruiter screen",
        fromStage: "applied",
        toStage: "recruiter_screen",
        occurredAt: 1_700_000_000,
      },
      {
        id: "event-alpha-latest",
        tenantId: "tenant_default",
        applicationId: "job-alpha",
        title: "Technical interview",
        fromStage: "recruiter_screen",
        toStage: "technical_interview",
        occurredAt: 1_700_100_000,
      },
      {
        id: "event-beta",
        tenantId: "tenant_default",
        applicationId: "job-beta",
        title: "Assessment",
        fromStage: "applied",
        toStage: "assessment",
        occurredAt: 1_700_100_000,
      },
    ]);
    await db.insert(schema.tasks).values([
      {
        id: "task-alpha-follow-up",
        tenantId: "tenant_default",
        applicationId: "job-alpha",
        type: "follow_up",
        title: "Send follow-up",
        dueDate: 1_700_090_000,
        isCompleted: false,
      },
      {
        id: "task-alpha-complete",
        tenantId: "tenant_default",
        applicationId: "job-alpha",
        type: "prep",
        title: "Completed prep",
        dueDate: null,
        isCompleted: true,
      },
    ]);
    await db.insert(schema.jobNotes).values({
      id: "note-alpha",
      tenantId: "tenant_default",
      jobId: "job-alpha",
      title: "Call notes",
      content: "Strong conversation",
      createdAt: "2023-11-01T00:00:00.000Z",
      updatedAt: "2023-11-01T00:00:00.000Z",
    });
    await db.insert(schema.interviews).values([
      {
        id: "interview-alpha-past",
        tenantId: "tenant_default",
        applicationId: "job-alpha",
        scheduledAt: 1_700_000_000,
        durationMins: 30,
        type: "technical",
        outcome: "pass",
      },
      {
        id: "interview-alpha-next",
        tenantId: "tenant_default",
        applicationId: "job-alpha",
        scheduledAt: 1_700_200_000,
        durationMins: 60,
        type: "onsite",
        outcome: "pending",
      },
    ]);

    const projection = await runWithRequestContext(
      { requestId: "projection-default", tenantId: "tenant_default" },
      () => getCareerPipelineProjection({ now: 1_700_110_000 }),
    );

    expect(projection.columns.map((column) => column.stage)).toEqual([
      "recruiter_screen",
      "assessment",
      "hiring_manager_screen",
      "technical_interview",
      "onsite",
      "offer",
      "closed",
    ]);
    expect(
      projection.columns.find(
        (column) => column.stage === "technical_interview",
      )?.cards[0],
    ).toMatchObject({
      job: {
        id: "job-alpha",
        title: "Alpha Engineer",
        followUpUrgency: "urgent",
      },
      stage: "technical_interview",
      latestEvent: {
        id: "event-alpha-latest",
        occurredAt: 1_700_100_000,
      },
      pendingTaskCount: 1,
      noteCount: 1,
      nextInterview: { id: "interview-alpha-next", scheduledAt: 1_700_200_000 },
      isStale: false,
      needsFollowUp: true,
    });
    expect(
      projection.columns
        .find((column) => column.stage === "assessment")
        ?.cards.map((card) => card.job.id),
    ).toEqual(["job-beta"]);
  });

  it("does not include canonical records from another tenant", async () => {
    const { db, schema } = await import("@server/db");
    const { runWithRequestContext } = await import(
      "@server/infra/request-context"
    );
    const { getCareerPipelineProjection } = await import("./career-pipeline");

    await db.insert(schema.tenants).values({
      id: "tenant-alt",
      name: "Alt workspace",
      slug: "alt-workspace",
    });
    await db.insert(schema.jobs).values([
      {
        id: "job-default",
        tenantId: "tenant_default",
        source: "manual",
        title: "Default role",
        employer: "Acme",
        jobUrl: "https://example.com/default",
        status: "in_progress",
      },
      {
        id: "job-alt",
        tenantId: "tenant-alt",
        source: "manual",
        title: "Alt role",
        employer: "Other Co",
        jobUrl: "https://example.com/alt",
        status: "in_progress",
      },
    ]);
    await db.insert(schema.tasks).values({
      id: "task-alt",
      tenantId: "tenant-alt",
      applicationId: "job-alt",
      type: "follow_up",
      title: "Private follow-up",
      isCompleted: false,
    });

    const projection = await runWithRequestContext(
      { requestId: "projection-default", tenantId: "tenant_default" },
      () => getCareerPipelineProjection({ now: 1_700_000_000 }),
    );

    expect(
      projection.columns
        .flatMap((column) => column.cards)
        .map((card) => card.job.id),
    ).toEqual(["job-default"]);
  });

  it("does not treat an undated pending follow-up task as due", async () => {
    const { db, schema } = await import("@server/db");
    const { runWithRequestContext } = await import(
      "@server/infra/request-context"
    );
    const { getCareerPipelineProjection } = await import("./career-pipeline");

    await db.insert(schema.jobs).values({
      id: "job-applied",
      tenantId: "tenant_default",
      source: "manual",
      title: "Applied role",
      employer: "Acme",
      jobUrl: "https://example.com/applied",
      status: "applied",
    });
    await db.insert(schema.tasks).values({
      id: "task-applied-prep",
      tenantId: "tenant_default",
      applicationId: "job-applied",
      type: "follow_up",
      title: "Research company",
      dueDate: null,
      isCompleted: false,
    });

    const projection = await runWithRequestContext(
      { requestId: "projection-applied", tenantId: "tenant_default" },
      () => getCareerPipelineProjection({ now: 1_700_000_000 }),
    );

    expect(
      projection.columns.find((column) => column.stage === "recruiter_screen")
        ?.cards,
    ).toEqual([
      expect.objectContaining({
        job: expect.objectContaining({ id: "job-applied" }),
        stage: "recruiter_screen",
        needsFollowUp: false,
      }),
    ]);
  });

  it("selects one stable next action when pending tasks have NULL due dates", async () => {
    const { db, schema } = await import("@server/db");
    const { runWithRequestContext } = await import(
      "@server/infra/request-context"
    );
    const { getCareerPipelineProjection } = await import("./career-pipeline");

    await db.insert(schema.jobs).values([
      {
        id: "job-null-dates",
        tenantId: "tenant_default",
        source: "manual",
        title: "Undated tasks",
        employer: "Acme",
        jobUrl: "https://example.com/undated",
        status: "in_progress",
      },
      {
        id: "job-dated-first",
        tenantId: "tenant_default",
        source: "manual",
        title: "Dated task",
        employer: "Acme",
        jobUrl: "https://example.com/dated",
        status: "in_progress",
      },
    ]);
    await db.insert(schema.tasks).values([
      {
        id: "task-null-a",
        tenantId: "tenant_default",
        applicationId: "job-null-dates",
        type: "prep",
        title: "First undated task",
        dueDate: null,
        isCompleted: false,
      },
      {
        id: "task-null-b",
        tenantId: "tenant_default",
        applicationId: "job-null-dates",
        type: "prep",
        title: "Second undated task",
        dueDate: null,
        isCompleted: false,
      },
      {
        id: "task-dated-later",
        tenantId: "tenant_default",
        applicationId: "job-dated-first",
        type: "prep",
        title: "Later dated task",
        dueDate: 1_700_000_100,
        isCompleted: false,
      },
      {
        id: "task-dated-earlier",
        tenantId: "tenant_default",
        applicationId: "job-dated-first",
        type: "prep",
        title: "Earlier dated task",
        dueDate: 1_700_000_000,
        isCompleted: false,
      },
      {
        id: "task-dated-null",
        tenantId: "tenant_default",
        applicationId: "job-dated-first",
        type: "prep",
        title: "Undated task",
        dueDate: null,
        isCompleted: false,
      },
    ]);

    const getNextActions = async () =>
      runWithRequestContext(
        { requestId: "projection-next-action", tenantId: "tenant_default" },
        async () => {
          const projection = await getCareerPipelineProjection({
            now: 1_700_000_000,
          });
          return Object.fromEntries(
            projection.columns
              .flatMap((column) => column.cards)
              .map((card) => [card.job.id, card.nextAction?.id]),
          );
        },
      );

    await expect(
      Promise.all(Array.from({ length: 5 }, getNextActions)),
    ).resolves.toEqual(
      Array.from({ length: 5 }, () => ({
        "job-null-dates": "task-null-a",
        "job-dated-first": "task-dated-earlier",
      })),
    );
  });

  it("filters eligible job IDs before projecting bounded activity summaries", async () => {
    const { db, schema } = await import("@server/db");
    const { runWithRequestContext } = await import(
      "@server/infra/request-context"
    );
    const { getCareerPipelineProjection } = await import("./career-pipeline");

    await db.insert(schema.jobs).values([
      {
        id: "job-assessment",
        tenantId: "tenant_default",
        source: "manual",
        title: "Assessment role",
        employer: "Acme",
        jobUrl: "https://example.com/assessment",
        status: "in_progress",
      },
      {
        id: "job-offer-history",
        tenantId: "tenant_default",
        source: "manual",
        title: "Offer role",
        employer: "Beta",
        jobUrl: "https://example.com/offer",
        status: "in_progress",
      },
    ]);
    await db.insert(schema.stageEvents).values([
      {
        id: "assessment-event",
        tenantId: "tenant_default",
        applicationId: "job-assessment",
        title: "Assessment",
        toStage: "assessment",
        occurredAt: 1_700_000_000,
      },
      ...Array.from({ length: 80 }, (_, index) => ({
        id: `offer-history-${index}`,
        tenantId: "tenant_default",
        applicationId: "job-offer-history",
        title: `Offer history ${index}`,
        toStage: "offer" as const,
        occurredAt: 1_700_000_100 + index,
      })),
    ]);
    await db.insert(schema.tasks).values(
      Array.from({ length: 80 }, (_, index) => ({
        id: `offer-task-${index}`,
        tenantId: "tenant_default",
        applicationId: "job-offer-history",
        type: "prep" as const,
        title: `Large history task ${index}`,
        dueDate: 1_700_001_000 + index,
        isCompleted: false,
      })),
    );
    await db.insert(schema.jobNotes).values(
      Array.from({ length: 80 }, (_, index) => ({
        id: `offer-note-${index}`,
        tenantId: "tenant_default",
        jobId: "job-offer-history",
        title: `Large history note ${index}`,
        content: "x".repeat(10_000),
        createdAt: "2023-11-01T00:00:00.000Z",
        updatedAt: "2023-11-01T00:00:00.000Z",
      })),
    );
    await db.insert(schema.interviews).values(
      Array.from({ length: 80 }, (_, index) => ({
        id: `offer-interview-${index}`,
        tenantId: "tenant_default",
        applicationId: "job-offer-history",
        scheduledAt: 1_700_002_000 + index,
        durationMins: 30,
        type: "technical" as const,
        outcome: "pending" as const,
      })),
    );

    const preparedStatements: string[] = [];
    const originalPrepare = db.$client.prepare.bind(db.$client);
    const prepareSpy = vi
      .spyOn(db.$client, "prepare")
      .mockImplementation((statement) => {
        preparedStatements.push(statement);
        return originalPrepare(statement);
      });

    const projection = await runWithRequestContext(
      { requestId: "projection-stage-filter", tenantId: "tenant_default" },
      () =>
        getCareerPipelineProjection({
          now: 1_700_000_000,
          stages: ["assessment"],
        }),
    );
    prepareSpy.mockRestore();

    expect(projection.columns).toHaveLength(1);
    expect(projection.columns[0].cards.map((card) => card.job.id)).toEqual([
      "job-assessment",
    ]);
    const activitySql = preparedStatements
      .filter((statement) => /\b(tasks|job_notes|interviews)\b/.test(statement))
      .join("\n");
    expect(activitySql).toContain("count(*)");
    expect(activitySql).not.toContain("job_notes`.`content");
    expect(activitySql).not.toContain("stage_events`.`metadata");
  });
});
