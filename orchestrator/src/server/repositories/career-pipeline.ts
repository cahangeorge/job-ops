import { db, schema } from "@server/db";
import {
  getFollowUpCadence,
  summarizeFollowUpNotes,
} from "@server/services/follow-up-cadence";
import { getActiveTenantId } from "@server/tenancy/context";
import {
  type ApplicationStage,
  CAREER_PIPELINE_STAGES,
  type CareerPipelineCard,
  type CareerPipelineJob,
  type CareerPipelineProjection,
  type CareerPipelineStage,
  INTERVIEW_TYPES,
  type InterviewType,
  type JobStatus,
  STAGE_LABELS,
} from "@shared/types";
import { and, eq, inArray, lt, notExists, or, sql } from "drizzle-orm";
import { alias } from "drizzle-orm/sqlite-core";

const STALE_AFTER_SECONDS = 14 * 24 * 60 * 60;

export type CareerPipelineSort = "updated" | "title" | "company";

export type CareerPipelineProjectionOptions = {
  now?: number;
  stages?: CareerPipelineStage[];
  sort?: CareerPipelineSort;
};

function toPipelineStage(stage: ApplicationStage): CareerPipelineStage {
  return stage === "applied" ? "recruiter_screen" : stage;
}

function activityTimestamp(card: CareerPipelineCard): number | null {
  if (card.latestEvent) return card.latestEvent.occurredAt;
  const fallback = card.job.appliedAt ?? card.job.discoveredAt;
  const timestamp = Date.parse(fallback);
  return Number.isFinite(timestamp) ? Math.floor(timestamp / 1000) : null;
}

function compareCards(sort: CareerPipelineSort) {
  return (left: CareerPipelineCard, right: CareerPipelineCard) => {
    if (sort === "title") {
      return (
        left.job.title.localeCompare(right.job.title) ||
        left.job.id.localeCompare(right.job.id)
      );
    }
    if (sort === "company") {
      return (
        left.job.employer.localeCompare(right.job.employer) ||
        left.job.title.localeCompare(right.job.title) ||
        left.job.id.localeCompare(right.job.id)
      );
    }

    return (
      (activityTimestamp(right) ?? Number.NEGATIVE_INFINITY) -
        (activityTimestamp(left) ?? Number.NEGATIVE_INFINITY) ||
      left.job.id.localeCompare(right.job.id)
    );
  };
}

type PipelineJobRow = {
  id: string;
  title: string;
  employer: string;
  status: JobStatus;
  outcome: CareerPipelineJob["outcome"];
  appliedAt: string | null;
  discoveredAt: string;
  updatedAt: string;
  latestEvent: {
    id: string;
    title: string;
    toStage: ApplicationStage;
    occurredAt: number;
  } | null;
};

function toPipelineJob(job: PipelineJobRow): CareerPipelineJob {
  return {
    id: job.id,
    title: job.title,
    employer: job.employer,
    outcome: job.outcome,
    appliedAt: job.appliedAt,
    discoveredAt: job.discoveredAt,
  };
}

function isInterviewType(value: string): value is InterviewType {
  return INTERVIEW_TYPES.some((type) => type === value);
}

export async function getCareerPipelineProjection(
  options: CareerPipelineProjectionOptions = {},
): Promise<CareerPipelineProjection> {
  const tenantId = getActiveTenantId();
  const now = options.now ?? Math.floor(Date.now() / 1000);
  const sort = options.sort ?? "updated";
  const stageFilter = new Set(options.stages ?? CAREER_PIPELINE_STAGES);
  const columns = CAREER_PIPELINE_STAGES.filter((stage) =>
    stageFilter.has(stage),
  ).map((stage) => ({
    stage,
    label: STAGE_LABELS[stage],
    cards: [] as CareerPipelineCard[],
  }));

  const laterEvents = alias(schema.stageEvents, "later_pipeline_events");
  const pipelineJobs = await db
    .select({
      id: schema.jobs.id,
      title: schema.jobs.title,
      employer: schema.jobs.employer,
      status: schema.jobs.status,
      outcome: schema.jobs.outcome,
      appliedAt: schema.jobs.appliedAt,
      discoveredAt: schema.jobs.discoveredAt,
      updatedAt: schema.jobs.updatedAt,
      latestEventId: schema.stageEvents.id,
      latestEventTitle: schema.stageEvents.title,
      latestEventStage: schema.stageEvents.toStage,
      latestEventOccurredAt: schema.stageEvents.occurredAt,
    })
    .from(schema.jobs)
    .leftJoin(
      schema.stageEvents,
      and(
        eq(schema.stageEvents.tenantId, tenantId),
        eq(schema.stageEvents.applicationId, schema.jobs.id),
        notExists(
          db
            .select({ id: laterEvents.id })
            .from(laterEvents)
            .where(
              and(
                eq(laterEvents.tenantId, tenantId),
                eq(laterEvents.applicationId, schema.stageEvents.applicationId),
                or(
                  sql`${laterEvents.occurredAt} > ${schema.stageEvents.occurredAt}`,
                  and(
                    eq(laterEvents.occurredAt, schema.stageEvents.occurredAt),
                    sql`${laterEvents.id} > ${schema.stageEvents.id}`,
                  ),
                ),
              ),
            ),
        ),
      ),
    )
    .where(
      and(
        eq(schema.jobs.tenantId, tenantId),
        inArray(schema.jobs.status, ["applied", "in_progress"]),
      ),
    );

  const jobs: PipelineJobRow[] = pipelineJobs
    .map((job) => ({
      id: job.id,
      title: job.title,
      employer: job.employer,
      status: job.status as JobStatus,
      outcome: job.outcome as CareerPipelineJob["outcome"],
      appliedAt: job.appliedAt,
      discoveredAt: job.discoveredAt,
      updatedAt: job.updatedAt,
      latestEvent: job.latestEventId
        ? {
            id: job.latestEventId,
            title: job.latestEventTitle ?? "",
            toStage: job.latestEventStage as ApplicationStage,
            occurredAt: job.latestEventOccurredAt ?? 0,
          }
        : null,
    }))
    .filter((job) =>
      stageFilter.has(toPipelineStage(job.latestEvent?.toStage ?? "applied")),
    );
  const jobIds = jobs.map((job) => job.id);

  if (jobIds.length === 0) return { columns };

  const laterTasks = alias(schema.tasks, "later_pipeline_tasks");
  const laterInterviews = alias(schema.interviews, "later_pipeline_interviews");

  const [taskSummaries, nextActions, noteSummaries, nextInterviews] =
    await Promise.all([
      db
        .select({
          applicationId: schema.tasks.applicationId,
          pending: sql<number>`count(*)`,
          overdue: sql<number>`sum(case when ${schema.tasks.dueDate} is not null and ${schema.tasks.dueDate} < ${now} then 1 else 0 end)`,
          followUp: sql<number>`max(case when ${schema.tasks.type} = 'follow_up' and ${schema.tasks.dueDate} is not null and ${schema.tasks.dueDate} <= ${now} then 1 else 0 end)`,
        })
        .from(schema.tasks)
        .where(
          and(
            eq(schema.tasks.tenantId, tenantId),
            inArray(schema.tasks.applicationId, jobIds),
            eq(schema.tasks.isCompleted, false),
          ),
        )
        .groupBy(schema.tasks.applicationId),
      db
        .select({
          applicationId: schema.tasks.applicationId,
          id: schema.tasks.id,
          title: schema.tasks.title,
          dueDate: schema.tasks.dueDate,
        })
        .from(schema.tasks)
        .where(
          and(
            eq(schema.tasks.tenantId, tenantId),
            inArray(schema.tasks.applicationId, jobIds),
            eq(schema.tasks.isCompleted, false),
            notExists(
              db
                .select({ id: laterTasks.id })
                .from(laterTasks)
                .where(
                  and(
                    eq(laterTasks.tenantId, tenantId),
                    eq(laterTasks.applicationId, schema.tasks.applicationId),
                    eq(laterTasks.isCompleted, false),
                    or(
                      sql`case when ${laterTasks.dueDate} is null then 1 else 0 end < case when ${schema.tasks.dueDate} is null then 1 else 0 end`,
                      and(
                        sql`case when ${laterTasks.dueDate} is null then 1 else 0 end = case when ${schema.tasks.dueDate} is null then 1 else 0 end`,
                        sql`coalesce(${laterTasks.dueDate}, 0) < coalesce(${schema.tasks.dueDate}, 0)`,
                      ),
                      and(
                        sql`case when ${laterTasks.dueDate} is null then 1 else 0 end = case when ${schema.tasks.dueDate} is null then 1 else 0 end`,
                        sql`coalesce(${laterTasks.dueDate}, 0) = coalesce(${schema.tasks.dueDate}, 0)`,
                        lt(laterTasks.id, schema.tasks.id),
                      ),
                    ),
                  ),
                ),
            ),
          ),
        ),
      db
        .select({
          jobId: schema.jobNotes.jobId,
          title: schema.jobNotes.title,
          updatedAt: schema.jobNotes.updatedAt,
        })
        .from(schema.jobNotes)
        .where(
          and(
            eq(schema.jobNotes.tenantId, tenantId),
            inArray(schema.jobNotes.jobId, jobIds),
          ),
        ),
      db
        .select({
          applicationId: schema.interviews.applicationId,
          id: schema.interviews.id,
          scheduledAt: schema.interviews.scheduledAt,
          durationMins: schema.interviews.durationMins,
          type: schema.interviews.type,
        })
        .from(schema.interviews)
        .where(
          and(
            eq(schema.interviews.tenantId, tenantId),
            inArray(schema.interviews.applicationId, jobIds),
            sql`${schema.interviews.scheduledAt} >= ${now}`,
            sql`coalesce(${schema.interviews.outcome}, '') <> 'cancelled'`,
            notExists(
              db
                .select({ id: laterInterviews.id })
                .from(laterInterviews)
                .where(
                  and(
                    eq(laterInterviews.tenantId, tenantId),
                    eq(
                      laterInterviews.applicationId,
                      schema.interviews.applicationId,
                    ),
                    sql`${laterInterviews.scheduledAt} >= ${now}`,
                    sql`coalesce(${laterInterviews.outcome}, '') <> 'cancelled'`,
                    or(
                      lt(
                        laterInterviews.scheduledAt,
                        schema.interviews.scheduledAt,
                      ),
                      and(
                        eq(
                          laterInterviews.scheduledAt,
                          schema.interviews.scheduledAt,
                        ),
                        lt(laterInterviews.id, schema.interviews.id),
                      ),
                    ),
                  ),
                ),
            ),
          ),
        ),
    ]);

  const taskSummaryByJob = new Map<
    string,
    {
      pending: number;
      overdue: number;
      followUp: boolean;
      nextAction: (typeof nextActions)[number] | null;
    }
  >();
  for (const summary of taskSummaries) {
    taskSummaryByJob.set(summary.applicationId, {
      pending: summary.pending,
      overdue: summary.overdue,
      followUp: summary.followUp > 0,
      nextAction: null,
    });
  }
  for (const nextAction of nextActions) {
    const summary = taskSummaryByJob.get(nextAction.applicationId);
    if (summary) summary.nextAction = nextAction;
  }

  const notesByJob = new Map<
    string,
    Array<{ title: string; updatedAt: string }>
  >();
  for (const note of noteSummaries) {
    const notes = notesByJob.get(note.jobId);
    if (notes) {
      notes.push(note);
    } else {
      notesByJob.set(note.jobId, [note]);
    }
  }

  const nextInterviewByJob = new Map<string, (typeof nextInterviews)[number]>();
  for (const interview of nextInterviews) {
    nextInterviewByJob.set(interview.applicationId, interview);
  }

  for (const job of jobs) {
    const latestEvent = job.latestEvent;
    const stage = toPipelineStage(latestEvent?.toStage ?? "applied");

    const taskSummary = taskSummaryByJob.get(job.id) ?? {
      pending: 0,
      overdue: 0,
      followUp: false,
      nextAction: null,
    };
    const notes = notesByJob.get(job.id) ?? [];
    const followUpSummary = summarizeFollowUpNotes(notes);
    const followUpUrgency = getFollowUpCadence({
      status: job.status,
      appliedAt: job.appliedAt ? Date.parse(job.appliedAt) : null,
      lastActivityAt: Date.parse(job.updatedAt),
      lastFollowUpAt: followUpSummary.lastFollowUpAt,
      followUpCount: followUpSummary.followUpCount,
    }).urgency;
    const nextInterview = nextInterviewByJob.get(job.id);
    const fallbackTimestamp = Date.parse(job.appliedAt ?? job.discoveredAt);
    const latestActivityAt =
      latestEvent?.occurredAt ??
      (Number.isFinite(fallbackTimestamp)
        ? Math.floor(fallbackTimestamp / 1000)
        : now);
    const card: CareerPipelineCard = {
      job: { ...toPipelineJob(job), followUpUrgency },
      stage,
      latestEvent: latestEvent
        ? {
            id: latestEvent.id,
            title: latestEvent.title,
            toStage: latestEvent.toStage as ApplicationStage,
            occurredAt: latestEvent.occurredAt,
          }
        : null,
      pendingTaskCount: taskSummary.pending,
      overdueTaskCount: taskSummary.overdue,
      noteCount: notes.length,
      latestNoteAt: notes.reduce<string | null>(
        (latestAt, note) =>
          latestAt === null || note.updatedAt > latestAt
            ? note.updatedAt
            : latestAt,
        null,
      ),
      nextAction: taskSummary.nextAction
        ? {
            id: taskSummary.nextAction.id,
            title: taskSummary.nextAction.title,
            dueDate: taskSummary.nextAction.dueDate,
          }
        : null,
      nextInterview: nextInterview
        ? {
            id: nextInterview.id,
            scheduledAt: nextInterview.scheduledAt,
            durationMins: nextInterview.durationMins,
            type: isInterviewType(nextInterview.type)
              ? nextInterview.type
              : "recruiter_screen",
          }
        : null,
      isStale: now - latestActivityAt >= STALE_AFTER_SECONDS,
      staleDays: Math.max(0, Math.floor((now - latestActivityAt) / 86_400)),
      needsFollowUp: taskSummary.followUp,
    };
    columns.find((column) => column.stage === stage)?.cards.push(card);
  }

  for (const column of columns) {
    column.cards.sort(compareCards(sort));
  }

  return { columns };
}
