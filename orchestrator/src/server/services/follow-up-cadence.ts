import type { ApplicationStage, JobFollowUpUrgency, JobStatus, JobNote } from "@shared/types";
import { FOLLOW_UP_NOTE_TITLE_PREFIX } from "@shared/types";

const DAY_MS = 24 * 60 * 60 * 1000;

export type FollowUpCadenceInput = {
  status: JobStatus;
  appliedAt: number | null;
  lastActivityAt?: number | null;
  lastFollowUpAt: number | null;
  followUpCount: number;
  stage?: ApplicationStage | null;
};

export type FollowUpCadenceResult = {
  urgency: JobFollowUpUrgency;
  nextFollowUpAt: number | null;
  followUpReason: string | null;
  daysSinceApplication: number | null;
};

type FollowUpNoteSummary = {
  followUpCount: number;
  lastFollowUpAt: number | null;
};

function toElapsedDays(fromEpochMs: number, toEpochMs: number): number {
  return Math.floor((toEpochMs - fromEpochMs) / DAY_MS);
}

function getThresholdDays(stage?: ApplicationStage | null): number {
  if (
    stage === "technical_interview" ||
    stage === "onsite" ||
    stage === "offer"
  ) {
    return 1;
  }
  if (
    stage === "recruiter_screen" ||
    stage === "assessment" ||
    stage === "hiring_manager_screen"
  ) {
    return 3;
  }
  return 7;
}

function getStageLabel(stage?: ApplicationStage | null): string {
  if (stage === "technical_interview") return "technical interview";
  if (stage === "recruiter_screen") return "recruiter screen";
  if (stage === "hiring_manager_screen") return "team match";
  if (stage === "assessment") return "assessment";
  if (stage === "onsite") return "final round";
  if (stage === "offer") return "offer";
  return "application";
}

export function isFollowUpNoteTitle(title: string): boolean {
  return title.trim().toLowerCase().startsWith(
    FOLLOW_UP_NOTE_TITLE_PREFIX.toLowerCase(),
  );
}

export function summarizeFollowUpNotes(
  notes: readonly Pick<JobNote, "title" | "updatedAt">[],
): FollowUpNoteSummary {
  let followUpCount = 0;
  let lastFollowUpAt: number | null = null;

  for (const note of notes) {
    if (!isFollowUpNoteTitle(note.title)) continue;
    followUpCount += 1;
    const updatedAt = Date.parse(note.updatedAt);
    if (Number.isFinite(updatedAt)) {
      lastFollowUpAt =
        lastFollowUpAt === null ? updatedAt : Math.max(lastFollowUpAt, updatedAt);
    }
  }

  return { followUpCount, lastFollowUpAt };
}

export function getFollowUpCadence(
  input: FollowUpCadenceInput,
  referenceAt = Date.now(),
): FollowUpCadenceResult {
  if (
    (input.status !== "applied" && input.status !== "in_progress") ||
    input.appliedAt === null
  ) {
    return {
      urgency: "none",
      nextFollowUpAt: null,
      followUpReason: null,
      daysSinceApplication: null,
    };
  }

  const daysSinceApplication = toElapsedDays(input.appliedAt, referenceAt);

  if (input.followUpCount >= 2) {
    return {
      urgency: "cold",
      nextFollowUpAt: null,
      followUpReason: "Two follow-up drafts are already saved. Deprioritize unless new signal arrives.",
      daysSinceApplication,
    };
  }

  const thresholdDays = getThresholdDays(input.stage);
  const baselineAt =
    input.lastFollowUpAt ??
    (input.status === "in_progress" ? input.lastActivityAt : null) ??
    input.appliedAt;
  const nextFollowUpAt = baselineAt + thresholdDays * DAY_MS;

  if (referenceAt >= nextFollowUpAt) {
    const stageLabel = getStageLabel(input.stage);
    return {
      urgency: input.status === "applied" ? "overdue" : "urgent",
      nextFollowUpAt: null,
      followUpReason:
        input.status === "applied"
          ? `Application is older than ${thresholdDays} days with no saved follow-up draft.`
          : `A ${stageLabel} follow-up is due after ${thresholdDays} day${thresholdDays === 1 ? "" : "s"}.`,
      daysSinceApplication,
    };
  }

  return {
    urgency: "waiting",
    nextFollowUpAt,
    followUpReason: `Wait until the current ${thresholdDays}-day follow-up window completes.`,
    daysSinceApplication,
  };
}
