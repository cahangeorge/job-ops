export const APPLICATION_DOSSIER_LIFECYCLE_STATES = [
  "draft",
  "pending_approval",
  "approved",
  "submitted",
  "withdrawn",
  "closed",
] as const;

export type ApplicationDossierLifecycleState =
  (typeof APPLICATION_DOSSIER_LIFECYCLE_STATES)[number];

export const APPLICATION_APPROVAL_DECISIONS = [
  "approved",
  "rejected",
  "changes_requested",
] as const;

export type ApplicationApprovalDecision =
  (typeof APPLICATION_APPROVAL_DECISIONS)[number];

export const SUBMITTED_APPLICATION_QA_RESULTS = [
  "pending",
  "passed",
  "failed",
  "not_run",
] as const;

export type SubmittedApplicationQaResult =
  (typeof SUBMITTED_APPLICATION_QA_RESULTS)[number];

export const STORY_USAGE_KINDS = [
  "draft",
  "submitted_application",
  "interview_prep",
] as const;

export type StoryUsageKind = (typeof STORY_USAGE_KINDS)[number];

/** Boundary limits for services that persist immutable application snapshots. */
export const APPLICATION_SNAPSHOT_MAX_CHARS = {
  job: 100_000,
  resume: 500_000,
  story: 250_000,
  content: 500_000,
  provenance: 20_000,
  postingText: 1_000_000,
  postingMetadata: 20_000,
} as const;

export type ApplicationSnapshotField =
  keyof typeof APPLICATION_SNAPSHOT_MAX_CHARS;

/** Tenant-scoped application aggregate; live job data remains outside this record. */
export interface ApplicationDossier {
  id: string;
  tenantId: string;
  jobId: string;
  lifecycleState: ApplicationDossierLifecycleState;
  createdAt: string;
  updatedAt: string;
}

/** Immutable record of the inputs and generated content for one application draft. */
export interface ApplicationDraftRevision {
  id: string;
  tenantId: string;
  dossierId: string;
  jobId: string;
  revisionNumber: number;
  jobSnapshot: string;
  resumeSnapshot: string;
  storySnapshot: string;
  contentSnapshot: string;
  provenance: string;
  contentHash: string;
  createdAt: string;
}

/** Append-only human decision including the policy and correlated request. */
export interface ApplicationApproval {
  id: string;
  tenantId: string;
  dossierId: string;
  jobId: string;
  decision: ApplicationApprovalDecision;
  approvedByUserId: string;
  policyVersion: string;
  requestId: string;
  reason: string | null;
  createdAt: string;
}

/** Immutable stored artifact produced by finalizing one draft revision. */
export interface SubmittedApplicationArtifact {
  id: string;
  tenantId: string;
  dossierId: string;
  jobId: string;
  draftRevisionId: string;
  storagePath: string;
  sha256: string;
  byteSize: number;
  mediaType: string;
  qaResult: SubmittedApplicationQaResult;
  createdAt: string;
}

/** Immutable retrieval of the live job posting at a specific point in time. */
export interface JobPostingSnapshot {
  id: string;
  tenantId: string;
  jobId: string;
  normalizedText: string;
  contentHash: string;
  sourceUrl: string;
  retrievedAt: string;
  retrievalMetadata: string;
  createdAt: string;
}

export interface ImmutableApplicationDraftSnapshots {
  jobSnapshot: string;
  resumeSnapshot: string;
  storySnapshot: string;
  contentSnapshot: string;
  provenance: string;
  contentHash: string;
}

export interface CreateApplicationDraftRevisionInput
  extends ImmutableApplicationDraftSnapshots {
  dossierId: string;
  jobId: string;
  revisionNumber: number;
}

export interface CreateJobPostingSnapshotInput {
  jobId: string;
  normalizedText: string;
  contentHash: string;
  sourceUrl: string;
  retrievedAt: string;
  retrievalMetadata: string;
}
