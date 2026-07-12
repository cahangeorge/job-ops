/**
 * Database schema using Drizzle ORM with SQLite.
 */

import {
  APPLICATION_APPROVAL_DECISIONS,
  APPLICATION_DOSSIER_LIFECYCLE_STATES,
  APPLICATION_OUTCOMES,
  APPLICATION_STAGES,
  APPLICATION_TASK_TYPES,
  INTERVIEW_OUTCOMES,
  INTERVIEW_TYPES,
  JOB_CHAT_MESSAGE_ROLES,
  JOB_CHAT_MESSAGE_STATUSES,
  JOB_CHAT_RUN_STATUSES,
  POST_APPLICATION_INTEGRATION_STATUSES,
  POST_APPLICATION_MESSAGE_TYPES,
  POST_APPLICATION_PROCESSING_STATUSES,
  POST_APPLICATION_PROVIDERS,
  POST_APPLICATION_RELEVANCE_DECISIONS,
  POST_APPLICATION_SYNC_RUN_STATUSES,
  STORY_USAGE_KINDS,
  SUBMITTED_APPLICATION_QA_RESULTS,
} from "@shared/types";
import { APPLICATION_SNAPSHOT_MAX_CHARS } from "@shared/types/application-domain";
import { sql } from "drizzle-orm";
import {
  check,
  foreignKey,
  index,
  integer,
  real,
  sqliteTable,
  text,
  uniqueIndex,
} from "drizzle-orm/sqlite-core";

export const users = sqliteTable(
  "users",
  {
    id: text("id").primaryKey(),
    username: text("username").notNull(),
    displayName: text("display_name"),
    passwordHash: text("password_hash").notNull(),
    passwordSalt: text("password_salt").notNull(),
    isSystemAdmin: integer("is_system_admin", { mode: "boolean" })
      .notNull()
      .default(false),
    isDisabled: integer("is_disabled", { mode: "boolean" })
      .notNull()
      .default(false),
    createdAt: text("created_at").notNull().default(sql`(datetime('now'))`),
    updatedAt: text("updated_at").notNull().default(sql`(datetime('now'))`),
  },
  (table) => ({
    usernameUnique: uniqueIndex("idx_users_username_unique").on(table.username),
  }),
);

export const tenants = sqliteTable("tenants", {
  id: text("id").primaryKey(),
  name: text("name").notNull(),
  slug: text("slug").notNull().unique(),
  createdAt: text("created_at").notNull().default(sql`(datetime('now'))`),
  updatedAt: text("updated_at").notNull().default(sql`(datetime('now'))`),
});

export const tenantMemberships = sqliteTable(
  "tenant_memberships",
  {
    id: text("id").primaryKey(),
    userId: text("user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    tenantId: text("tenant_id")
      .notNull()
      .references(() => tenants.id, { onDelete: "cascade" }),
    role: text("role", { enum: ["owner", "member"] })
      .notNull()
      .default("owner"),
    createdAt: text("created_at").notNull().default(sql`(datetime('now'))`),
    updatedAt: text("updated_at").notNull().default(sql`(datetime('now'))`),
  },
  (table) => ({
    userTenantUnique: uniqueIndex("idx_tenant_memberships_user_tenant").on(
      table.userId,
      table.tenantId,
    ),
    tenantIndex: index("idx_tenant_memberships_tenant_id").on(table.tenantId),
  }),
);

export const jobs = sqliteTable(
  "jobs",
  {
    id: text("id").primaryKey(),
    tenantId: text("tenant_id")
      .notNull()
      .default("tenant_default")
      .references(() => tenants.id, { onDelete: "cascade" }),

    // From crawler
    source: text("source").notNull().default("gradcracker"),
    sourceJobId: text("source_job_id"),
    jobUrlDirect: text("job_url_direct"),
    datePosted: text("date_posted"),
    title: text("title").notNull(),
    employer: text("employer").notNull(),
    employerUrl: text("employer_url"),
    jobUrl: text("job_url").notNull(),
    applicationLink: text("application_link"),
    disciplines: text("disciplines"),
    deadline: text("deadline"),
    salary: text("salary"),
    location: text("location"),
    locationEvidence: text("location_evidence"),
    degreeRequired: text("degree_required"),
    starting: text("starting"),
    jobDescription: text("job_description"),

    // JobSpy fields (nullable for other sources)
    jobType: text("job_type"),
    salarySource: text("salary_source"),
    salaryInterval: text("salary_interval"),
    salaryMinAmount: real("salary_min_amount"),
    salaryMaxAmount: real("salary_max_amount"),
    salaryCurrency: text("salary_currency"),
    isRemote: integer("is_remote", { mode: "boolean" }),
    jobLevel: text("job_level"),
    jobFunction: text("job_function"),
    listingType: text("listing_type"),
    emails: text("emails"),
    companyIndustry: text("company_industry"),
    companyLogo: text("company_logo"),
    companyUrlDirect: text("company_url_direct"),
    companyAddresses: text("company_addresses"),
    companyNumEmployees: text("company_num_employees"),
    companyRevenue: text("company_revenue"),
    companyDescription: text("company_description"),
    skills: text("skills"),
    experienceRange: text("experience_range"),
    companyRating: real("company_rating"),
    companyReviewsCount: integer("company_reviews_count"),
    vacancyCount: integer("vacancy_count"),
    workFromHomeType: text("work_from_home_type"),

    // Orchestrator enrichments
    status: text("status", {
      enum: [
        "discovered",
        "processing",
        "ready",
        "applied",
        "in_progress",
        "skipped",
        "expired",
      ],
    })
      .notNull()
      .default("discovered"),
    outcome: text("outcome", { enum: APPLICATION_OUTCOMES }),
    closedAt: integer("closed_at", { mode: "number" }),
    suitabilityScore: real("suitability_score"),
    suitabilityReason: text("suitability_reason"),
    jobBrief: text("job_brief"),
    tailoredSummary: text("tailored_summary"),
    tailoredHeadline: text("tailored_headline"),
    tailoredSkills: text("tailored_skills"),
    selectedProjectIds: text("selected_project_ids"),
    pdfPath: text("pdf_path"),
    pdfSource: text("pdf_source", { enum: ["generated", "uploaded"] }),
    pdfRegenerating: integer("pdf_regenerating", { mode: "boolean" })
      .notNull()
      .default(false),
    pdfFingerprint: text("pdf_fingerprint"),
    pdfGeneratedAt: text("pdf_generated_at"),
    tracerLinksEnabled: integer("tracer_links_enabled", { mode: "boolean" })
      .notNull()
      .default(false),
    sponsorMatchScore: real("sponsor_match_score"),
    sponsorMatchNames: text("sponsor_match_names"),
    postingLivenessStatus: text("posting_liveness_status")
      .notNull()
      .default("unknown"),
    postingLivenessCheckedAt: integer("posting_liveness_checked_at", {
      mode: "number",
    }),
    postingLivenessReason: text("posting_liveness_reason"),

    // Structured 6-block evaluation
    evaluationRoleSummary: text("evaluation_role_summary"),
    evaluationCvMatchScore: real("evaluation_cv_match_score"),
    evaluationCvMatchReason: text("evaluation_cv_match_reason"),
    evaluationLevelStrategy: text("evaluation_level_strategy"),
    evaluationCompResearch: text("evaluation_comp_research"),
    evaluationPersonalization: text("evaluation_personalization"),
    evaluationInterviewPrep: text("evaluation_interview_prep"),
    evaluationLegitimacyScore: real("evaluation_legitimacy_score"),
    evaluationLegitimacyReason: text("evaluation_legitimacy_reason"),
    evaluationOverallGrade: text("evaluation_overall_grade"),
    archetype: text("archetype"),
    isGhostJob: integer("is_ghost_job", { mode: "boolean" }).default(false),

    // Timestamps
    discoveredAt: text("discovered_at")
      .notNull()
      .default(sql`(datetime('now'))`),
    processedAt: text("processed_at"),
    readyAt: text("ready_at"),
    appliedAt: text("applied_at"),
    createdAt: text("created_at").notNull().default(sql`(datetime('now'))`),
    updatedAt: text("updated_at").notNull().default(sql`(datetime('now'))`),
  },
  (table) => ({
    tenantJobUrlUnique: uniqueIndex("idx_jobs_tenant_job_url_unique").on(
      table.tenantId,
      table.jobUrl,
    ),
    tenantStatusIndex: index("idx_jobs_tenant_status").on(
      table.tenantId,
      table.status,
    ),
    tenantDiscoveredAtIndex: index("idx_jobs_tenant_discovered_at").on(
      table.tenantId,
      table.discoveredAt,
    ),
  }),
);

export const interviewStories = sqliteTable("interview_stories", {
  id: text("id").primaryKey(),
  tenantId: text("tenant_id")
    .notNull()
    .default("tenant_default")
    .references(() => tenants.id, { onDelete: "cascade" }),
  title: text("title").notNull(),
  situation: text("situation").notNull(),
  task: text("task").notNull(),
  action: text("action").notNull(),
  result: text("result").notNull(),
  reflection: text("reflection"),
  skills: text("skills"),
  tags: text("tags"),
  isMasterStory: integer("is_master_story", { mode: "boolean" })
    .notNull()
    .default(false),
  createdAt: text("created_at").notNull().default(sql`(datetime('now'))`),
  updatedAt: text("updated_at").notNull().default(sql`(datetime('now'))`),
});

export const competencies = sqliteTable(
  "competencies",
  {
    id: text("id").primaryKey(),
    tenantId: text("tenant_id")
      .notNull()
      .references(() => tenants.id, { onDelete: "restrict" }),
    name: text("name").notNull(),
    createdAt: text("created_at").notNull().default(sql`(datetime('now'))`),
  },
  (table) => ({
    tenantIdUnique: uniqueIndex("idx_competencies_tenant_id_unique").on(
      table.tenantId,
      table.id,
    ),
    tenantNameUnique: uniqueIndex("idx_competencies_tenant_name_unique").on(
      table.tenantId,
      table.name,
    ),
  }),
);

export const competencyEvidence = sqliteTable(
  "competency_evidence",
  {
    id: text("id").primaryKey(),
    tenantId: text("tenant_id")
      .notNull()
      .references(() => tenants.id, { onDelete: "restrict" }),
    competencyId: text("competency_id").notNull(),
    sourceType: text("source_type").notNull(),
    sourceId: text("source_id").notNull(),
    sourceVersion: text("source_version").notNull().default(""),
    sourceRevision: text("source_revision").notNull().default(""),
    extractionMethod: text("extraction_method", {
      enum: ["manual", "deterministic"],
    }).notNull(),
    confidence: real("confidence").notNull(),
    evidenceExcerpt: text("evidence_excerpt").notNull(),
    evidenceHash: text("evidence_hash").notNull(),
    observationStage: text("observation_stage", {
      enum: APPLICATION_STAGES,
    }),
    observationOutcome: text("observation_outcome", {
      enum: APPLICATION_OUTCOMES,
    }),
    createdAt: text("created_at").notNull().default(sql`(datetime('now'))`),
  },
  (table) => ({
    competencyForeignKey: foreignKey({
      columns: [table.tenantId, table.competencyId],
      foreignColumns: [competencies.tenantId, competencies.id],
    }).onDelete("restrict"),
    tenantIdUnique: uniqueIndex("idx_competency_evidence_tenant_id_unique").on(
      table.tenantId,
      table.id,
    ),
    sourceVersionUnique: uniqueIndex(
      "idx_competency_evidence_tenant_source_version_unique",
    ).on(
      table.tenantId,
      table.competencyId,
      table.sourceType,
      table.sourceId,
      table.sourceVersion,
      table.sourceRevision,
      table.evidenceHash,
    ),
    tenantCompetencyIndex: index(
      "idx_competency_evidence_tenant_competency",
    ).on(table.tenantId, table.competencyId, table.createdAt),
  }),
);

export const applicationDossiers = sqliteTable(
  "application_dossiers",
  {
    id: text("id").primaryKey(),
    tenantId: text("tenant_id")
      .notNull()
      .references(() => tenants.id, { onDelete: "cascade" }),
    jobId: text("job_id").notNull(),
    lifecycleState: text("lifecycle_state", {
      enum: APPLICATION_DOSSIER_LIFECYCLE_STATES,
    }).notNull(),
    createdAt: text("created_at").notNull().default(sql`(datetime('now'))`),
    updatedAt: text("updated_at").notNull().default(sql`(datetime('now'))`),
  },
  (table) => ({
    jobForeignKey: foreignKey({
      columns: [table.tenantId, table.jobId],
      foreignColumns: [jobs.tenantId, jobs.id],
    }).onDelete("cascade"),
    tenantIdUnique: uniqueIndex("idx_application_dossiers_tenant_id_unique").on(
      table.tenantId,
      table.id,
    ),
    tenantIdJobUnique: uniqueIndex(
      "idx_application_dossiers_tenant_id_job_id_unique",
    ).on(table.tenantId, table.id, table.jobId),
    tenantJobUnique: uniqueIndex(
      "idx_application_dossiers_tenant_job_unique",
    ).on(table.tenantId, table.jobId),
    tenantLifecycleIndex: index("idx_application_dossiers_tenant_lifecycle").on(
      table.tenantId,
      table.lifecycleState,
    ),
  }),
);

export const applicationDraftRevisions = sqliteTable(
  "application_draft_revisions",
  {
    id: text("id").primaryKey(),
    tenantId: text("tenant_id")
      .notNull()
      .references(() => tenants.id, { onDelete: "restrict" }),
    dossierId: text("dossier_id").notNull(),
    jobId: text("job_id").notNull(),
    revisionNumber: integer("revision_number").notNull(),
    jobSnapshot: text("job_snapshot").notNull(),
    resumeSnapshot: text("resume_snapshot").notNull(),
    storySnapshot: text("story_snapshot").notNull(),
    contentSnapshot: text("content_snapshot").notNull(),
    provenance: text("provenance").notNull(),
    contentHash: text("content_hash").notNull(),
    createdAt: text("created_at").notNull().default(sql`(datetime('now'))`),
  },
  (table) => ({
    jobForeignKey: foreignKey({
      columns: [table.tenantId, table.jobId],
      foreignColumns: [jobs.tenantId, jobs.id],
    }).onDelete("restrict"),
    dossierForeignKey: foreignKey({
      columns: [table.tenantId, table.dossierId],
      foreignColumns: [applicationDossiers.tenantId, applicationDossiers.id],
    }).onDelete("restrict"),
    dossierJobForeignKey: foreignKey({
      columns: [table.tenantId, table.dossierId, table.jobId],
      foreignColumns: [
        applicationDossiers.tenantId,
        applicationDossiers.id,
        applicationDossiers.jobId,
      ],
    }).onDelete("restrict"),
    jobSnapshotLength: check(
      "application_draft_revisions_job_snapshot_max_length",
      sql`length(${table.jobSnapshot}) <= ${APPLICATION_SNAPSHOT_MAX_CHARS.job}`,
    ),
    resumeSnapshotLength: check(
      "application_draft_revisions_resume_snapshot_max_length",
      sql`length(${table.resumeSnapshot}) <= ${APPLICATION_SNAPSHOT_MAX_CHARS.resume}`,
    ),
    storySnapshotLength: check(
      "application_draft_revisions_story_snapshot_max_length",
      sql`length(${table.storySnapshot}) <= ${APPLICATION_SNAPSHOT_MAX_CHARS.story}`,
    ),
    contentSnapshotLength: check(
      "application_draft_revisions_content_snapshot_max_length",
      sql`length(${table.contentSnapshot}) <= ${APPLICATION_SNAPSHOT_MAX_CHARS.content}`,
    ),
    provenanceLength: check(
      "application_draft_revisions_provenance_max_length",
      sql`length(${table.provenance}) <= ${APPLICATION_SNAPSHOT_MAX_CHARS.provenance}`,
    ),
    tenantIdUnique: uniqueIndex(
      "idx_application_draft_revisions_tenant_id_unique",
    ).on(table.tenantId, table.id),
    tenantIdDossierJobUnique: uniqueIndex(
      "idx_application_draft_revisions_tenant_id_dossier_job_unique",
    ).on(table.tenantId, table.id, table.dossierId, table.jobId),
    dossierRevisionUnique: uniqueIndex(
      "idx_application_draft_revisions_tenant_dossier_revision_unique",
    ).on(table.tenantId, table.dossierId, table.revisionNumber),
    tenantJobIndex: index("idx_application_draft_revisions_tenant_job").on(
      table.tenantId,
      table.jobId,
      table.createdAt,
    ),
  }),
);

export const applicationApprovals = sqliteTable(
  "application_approvals",
  {
    id: text("id").primaryKey(),
    tenantId: text("tenant_id")
      .notNull()
      .references(() => tenants.id, { onDelete: "restrict" }),
    dossierId: text("dossier_id").notNull(),
    jobId: text("job_id").notNull(),
    decision: text("decision", {
      enum: APPLICATION_APPROVAL_DECISIONS,
    }).notNull(),
    approvedByUserId: text("approved_by_user_id")
      .notNull()
      .references(() => users.id, { onDelete: "restrict" }),
    policyVersion: text("policy_version").notNull(),
    requestId: text("request_id").notNull(),
    draftRevisionId: text("draft_revision_id"),
    submittedArtifactId: text("submitted_artifact_id"),
    reason: text("reason"),
    createdAt: text("created_at").notNull().default(sql`(datetime('now'))`),
  },
  (table) => ({
    jobForeignKey: foreignKey({
      columns: [table.tenantId, table.jobId],
      foreignColumns: [jobs.tenantId, jobs.id],
    }).onDelete("restrict"),
    dossierForeignKey: foreignKey({
      columns: [table.tenantId, table.dossierId],
      foreignColumns: [applicationDossiers.tenantId, applicationDossiers.id],
    }).onDelete("restrict"),
    dossierJobForeignKey: foreignKey({
      columns: [table.tenantId, table.dossierId, table.jobId],
      foreignColumns: [
        applicationDossiers.tenantId,
        applicationDossiers.id,
        applicationDossiers.jobId,
      ],
    }).onDelete("restrict"),
    tenantApproverForeignKey: foreignKey({
      columns: [table.tenantId, table.approvedByUserId],
      foreignColumns: [tenantMemberships.tenantId, tenantMemberships.userId],
    }).onDelete("restrict"),
    tenantIdUnique: uniqueIndex(
      "idx_application_approvals_tenant_id_unique",
    ).on(table.tenantId, table.id),
    tenantRequestUnique: uniqueIndex(
      "idx_application_approvals_tenant_request_unique",
    ).on(table.tenantId, table.requestId),
    tenantDossierIndex: index("idx_application_approvals_tenant_dossier").on(
      table.tenantId,
      table.dossierId,
      table.createdAt,
    ),
  }),
);

export const submittedApplicationArtifacts = sqliteTable(
  "submitted_application_artifacts",
  {
    id: text("id").primaryKey(),
    tenantId: text("tenant_id")
      .notNull()
      .references(() => tenants.id, { onDelete: "restrict" }),
    dossierId: text("dossier_id").notNull(),
    jobId: text("job_id").notNull(),
    draftRevisionId: text("draft_revision_id").notNull(),
    storagePath: text("storage_path").notNull(),
    sha256: text("sha256").notNull(),
    byteSize: integer("byte_size").notNull(),
    mediaType: text("media_type").notNull(),
    qaResult: text("qa_result", {
      enum: SUBMITTED_APPLICATION_QA_RESULTS,
    }).notNull(),
    createdAt: text("created_at").notNull().default(sql`(datetime('now'))`),
  },
  (table) => ({
    jobForeignKey: foreignKey({
      columns: [table.tenantId, table.jobId],
      foreignColumns: [jobs.tenantId, jobs.id],
    }).onDelete("restrict"),
    dossierJobForeignKey: foreignKey({
      columns: [table.tenantId, table.dossierId, table.jobId],
      foreignColumns: [
        applicationDossiers.tenantId,
        applicationDossiers.id,
        applicationDossiers.jobId,
      ],
    }).onDelete("restrict"),
    revisionForeignKey: foreignKey({
      columns: [table.tenantId, table.draftRevisionId],
      foreignColumns: [
        applicationDraftRevisions.tenantId,
        applicationDraftRevisions.id,
      ],
    }).onDelete("restrict"),
    revisionDossierJobForeignKey: foreignKey({
      columns: [
        table.tenantId,
        table.draftRevisionId,
        table.dossierId,
        table.jobId,
      ],
      foreignColumns: [
        applicationDraftRevisions.tenantId,
        applicationDraftRevisions.id,
        applicationDraftRevisions.dossierId,
        applicationDraftRevisions.jobId,
      ],
    }).onDelete("restrict"),
    tenantIdUnique: uniqueIndex(
      "idx_submitted_application_artifacts_tenant_id_unique",
    ).on(table.tenantId, table.id),
    storagePathUnique: uniqueIndex(
      "idx_submitted_application_artifacts_tenant_path_unique",
    ).on(table.tenantId, table.storagePath),
    dossierShaUnique: uniqueIndex(
      "idx_submitted_application_artifacts_tenant_dossier_sha_unique",
    ).on(table.tenantId, table.dossierId, table.sha256),
    dossierFinalizationUnique: uniqueIndex(
      "idx_submitted_application_artifacts_tenant_dossier_finalization_unique",
    ).on(table.tenantId, table.dossierId),
    tenantJobIndex: index("idx_submitted_application_artifacts_tenant_job").on(
      table.tenantId,
      table.jobId,
      table.createdAt,
    ),
  }),
);

export const jobPostingSnapshots = sqliteTable(
  "job_posting_snapshots",
  {
    id: text("id").primaryKey(),
    tenantId: text("tenant_id")
      .notNull()
      .references(() => tenants.id, { onDelete: "restrict" }),
    jobId: text("job_id").notNull(),
    normalizedText: text("normalized_text").notNull(),
    contentHash: text("content_hash").notNull(),
    sourceUrl: text("source_url").notNull(),
    retrievedAt: text("retrieved_at").notNull(),
    retrievalMetadata: text("retrieval_metadata").notNull(),
    createdAt: text("created_at").notNull().default(sql`(datetime('now'))`),
  },
  (table) => ({
    jobForeignKey: foreignKey({
      columns: [table.tenantId, table.jobId],
      foreignColumns: [jobs.tenantId, jobs.id],
    }).onDelete("restrict"),
    normalizedTextLength: check(
      "job_posting_snapshots_normalized_text_max_length",
      sql`length(${table.normalizedText}) <= ${APPLICATION_SNAPSHOT_MAX_CHARS.postingText}`,
    ),
    retrievalMetadataLength: check(
      "job_posting_snapshots_retrieval_metadata_max_length",
      sql`length(${table.retrievalMetadata}) <= ${APPLICATION_SNAPSHOT_MAX_CHARS.postingMetadata}`,
    ),
    tenantIdUnique: uniqueIndex(
      "idx_job_posting_snapshots_tenant_id_unique",
    ).on(table.tenantId, table.id),
    jobHashUnique: uniqueIndex(
      "idx_job_posting_snapshots_tenant_job_hash_unique",
    ).on(table.tenantId, table.jobId, table.contentHash),
    tenantJobRetrievedIndex: index(
      "idx_job_posting_snapshots_tenant_job_retrieved",
    ).on(table.tenantId, table.jobId, table.retrievedAt),
  }),
);

export const storyTags = sqliteTable(
  "story_tags",
  {
    id: text("id").primaryKey(),
    tenantId: text("tenant_id")
      .notNull()
      .references(() => tenants.id, { onDelete: "cascade" }),
    name: text("name").notNull(),
    createdAt: text("created_at").notNull().default(sql`(datetime('now'))`),
  },
  (table) => ({
    tenantIdUnique: uniqueIndex("idx_story_tags_tenant_id_unique").on(
      table.tenantId,
      table.id,
    ),
    tenantNameUnique: uniqueIndex("idx_story_tags_tenant_name_unique").on(
      table.tenantId,
      table.name,
    ),
  }),
);

export const storyTagAssignments = sqliteTable(
  "story_tag_assignments",
  {
    id: text("id").primaryKey(),
    tenantId: text("tenant_id")
      .notNull()
      .references(() => tenants.id, { onDelete: "cascade" }),
    storyId: text("story_id").notNull(),
    tagId: text("tag_id").notNull(),
    createdAt: text("created_at").notNull().default(sql`(datetime('now'))`),
  },
  (table) => ({
    storyForeignKey: foreignKey({
      columns: [table.tenantId, table.storyId],
      foreignColumns: [interviewStories.tenantId, interviewStories.id],
    }).onDelete("cascade"),
    tagForeignKey: foreignKey({
      columns: [table.tenantId, table.tagId],
      foreignColumns: [storyTags.tenantId, storyTags.id],
    }).onDelete("cascade"),
    tenantIdUnique: uniqueIndex(
      "idx_story_tag_assignments_tenant_id_unique",
    ).on(table.tenantId, table.id),
    storyTagUnique: uniqueIndex(
      "idx_story_tag_assignments_tenant_story_tag_unique",
    ).on(table.tenantId, table.storyId, table.tagId),
    tenantTagIndex: index("idx_story_tag_assignments_tenant_tag").on(
      table.tenantId,
      table.tagId,
    ),
  }),
);

export const storyUsageEvents = sqliteTable(
  "story_usage_events",
  {
    id: text("id").primaryKey(),
    tenantId: text("tenant_id")
      .notNull()
      .references(() => tenants.id, { onDelete: "restrict" }),
    storyId: text("story_id").notNull(),
    jobId: text("job_id").notNull(),
    usageKind: text("usage_kind", { enum: STORY_USAGE_KINDS }).notNull(),
    provenance: text("provenance").notNull(),
    createdAt: text("created_at").notNull().default(sql`(datetime('now'))`),
  },
  (table) => ({
    storyForeignKey: foreignKey({
      columns: [table.tenantId, table.storyId],
      foreignColumns: [interviewStories.tenantId, interviewStories.id],
    }).onDelete("restrict"),
    jobForeignKey: foreignKey({
      columns: [table.tenantId, table.jobId],
      foreignColumns: [jobs.tenantId, jobs.id],
    }).onDelete("restrict"),
    provenanceLength: check(
      "story_usage_events_provenance_max_length",
      sql`length(${table.provenance}) <= ${APPLICATION_SNAPSHOT_MAX_CHARS.provenance}`,
    ),
    tenantIdUnique: uniqueIndex("idx_story_usage_events_tenant_id_unique").on(
      table.tenantId,
      table.id,
    ),
    tenantStoryIndex: index("idx_story_usage_events_tenant_story").on(
      table.tenantId,
      table.storyId,
      table.createdAt,
    ),
  }),
);

export const careerProfileOverlays = sqliteTable("career_profile_overlays", {
  tenantId: text("tenant_id")
    .primaryKey()
    .references(() => tenants.id, { onDelete: "cascade" }),
  preferences: text("preferences").notNull(),
  targets: text("targets").notNull(),
  constraints: text("constraints").notNull(),
  provenance: text("provenance").notNull(),
  createdAt: text("created_at").notNull().default(sql`(datetime('now'))`),
  updatedAt: text("updated_at").notNull().default(sql`(datetime('now'))`),
});

export const stageEvents = sqliteTable("stage_events", {
  id: text("id").primaryKey(),
  tenantId: text("tenant_id")
    .notNull()
    .default("tenant_default")
    .references(() => tenants.id, { onDelete: "cascade" }),
  applicationId: text("application_id")
    .notNull()
    .references(() => jobs.id, { onDelete: "cascade" }),
  title: text("title").notNull(),
  groupId: text("group_id"),
  fromStage: text("from_stage", { enum: APPLICATION_STAGES }),
  toStage: text("to_stage", { enum: APPLICATION_STAGES }).notNull(),
  occurredAt: integer("occurred_at", { mode: "number" }).notNull(),
  metadata: text("metadata", { mode: "json" }),
  outcome: text("outcome", { enum: APPLICATION_OUTCOMES }),
});

export const tasks = sqliteTable("tasks", {
  id: text("id").primaryKey(),
  tenantId: text("tenant_id")
    .notNull()
    .default("tenant_default")
    .references(() => tenants.id, { onDelete: "cascade" }),
  applicationId: text("application_id")
    .notNull()
    .references(() => jobs.id, { onDelete: "cascade" }),
  type: text("type", { enum: APPLICATION_TASK_TYPES }).notNull(),
  title: text("title").notNull(),
  dueDate: integer("due_date", { mode: "number" }),
  isCompleted: integer("is_completed", { mode: "boolean" })
    .notNull()
    .default(false),
  notes: text("notes"),
});

export const jobNotes = sqliteTable(
  "job_notes",
  {
    id: text("id").primaryKey(),
    tenantId: text("tenant_id")
      .notNull()
      .default("tenant_default")
      .references(() => tenants.id, { onDelete: "cascade" }),
    jobId: text("job_id")
      .notNull()
      .references(() => jobs.id, { onDelete: "cascade" }),
    title: text("title").notNull(),
    content: text("content").notNull(),
    createdAt: text("created_at").notNull().default(sql`(datetime('now'))`),
    updatedAt: text("updated_at").notNull().default(sql`(datetime('now'))`),
  },
  (table) => ({
    jobUpdatedIndex: index("idx_job_notes_job_updated").on(
      table.jobId,
      table.updatedAt,
    ),
  }),
);

export const interviews = sqliteTable("interviews", {
  id: text("id").primaryKey(),
  tenantId: text("tenant_id")
    .notNull()
    .default("tenant_default")
    .references(() => tenants.id, { onDelete: "cascade" }),
  applicationId: text("application_id")
    .notNull()
    .references(() => jobs.id, { onDelete: "cascade" }),
  scheduledAt: integer("scheduled_at", { mode: "number" }).notNull(),
  durationMins: integer("duration_mins"),
  type: text("type", { enum: INTERVIEW_TYPES }).notNull(),
  outcome: text("outcome", { enum: INTERVIEW_OUTCOMES }),
});

export const pipelineRuns = sqliteTable("pipeline_runs", {
  id: text("id").primaryKey(),
  tenantId: text("tenant_id")
    .notNull()
    .default("tenant_default")
    .references(() => tenants.id, { onDelete: "cascade" }),
  startedAt: text("started_at").notNull().default(sql`(datetime('now'))`),
  completedAt: text("completed_at"),
  status: text("status", {
    enum: ["running", "completed", "failed", "cancelled"],
  })
    .notNull()
    .default("running"),
  jobsDiscovered: integer("jobs_discovered").notNull().default(0),
  jobsProcessed: integer("jobs_processed").notNull().default(0),
  errorMessage: text("error_message"),
  configSnapshot: text("config_snapshot"),
  requestedConfig: text("requested_config", { mode: "json" }),
  effectiveConfig: text("effective_config", { mode: "json" }),
  resultSummary: text("result_summary", { mode: "json" }),
});

export const pipelineSearchPresets = sqliteTable(
  "pipeline_search_presets",
  {
    id: text("id").primaryKey(),
    tenantId: text("tenant_id")
      .notNull()
      .default("tenant_default")
      .references(() => tenants.id, { onDelete: "cascade" }),
    userId: text("user_id").notNull(),
    name: text("name").notNull(),
    config: text("config", { mode: "json" }).notNull(),
    lastUsedAt: text("last_used_at"),
    createdAt: text("created_at").notNull().default(sql`(datetime('now'))`),
    updatedAt: text("updated_at").notNull().default(sql`(datetime('now'))`),
  },
  (table) => ({
    tenantUserNameUnique: uniqueIndex(
      "idx_pipeline_search_presets_tenant_user_name_unique",
    ).on(table.tenantId, table.userId, table.name),
    tenantUserUpdatedIndex: index(
      "idx_pipeline_search_presets_tenant_user_updated",
    ).on(table.tenantId, table.userId, table.updatedAt),
  }),
);

export const jobChatThreads = sqliteTable(
  "job_chat_threads",
  {
    id: text("id").primaryKey(),
    tenantId: text("tenant_id")
      .notNull()
      .default("tenant_default")
      .references(() => tenants.id, { onDelete: "cascade" }),
    jobId: text("job_id")
      .notNull()
      .references(() => jobs.id, { onDelete: "cascade" }),
    title: text("title"),
    createdAt: text("created_at").notNull().default(sql`(datetime('now'))`),
    updatedAt: text("updated_at").notNull().default(sql`(datetime('now'))`),
    lastMessageAt: text("last_message_at"),
    activeRootMessageId: text("active_root_message_id"),
    selectedNoteIds: text("selected_note_ids").notNull().default("[]"),
    selectedEmailIds: text("selected_email_ids").notNull().default("[]"),
    selectedDocumentIds: text("selected_document_ids").notNull().default("[]"),
  },
  (table) => ({
    jobUpdatedIndex: index("idx_job_chat_threads_job_updated").on(
      table.jobId,
      table.updatedAt,
    ),
  }),
);

export const jobChatMessages = sqliteTable(
  "job_chat_messages",
  {
    id: text("id").primaryKey(),
    tenantId: text("tenant_id")
      .notNull()
      .default("tenant_default")
      .references(() => tenants.id, { onDelete: "cascade" }),
    threadId: text("thread_id")
      .notNull()
      .references(() => jobChatThreads.id, { onDelete: "cascade" }),
    jobId: text("job_id")
      .notNull()
      .references(() => jobs.id, { onDelete: "cascade" }),
    role: text("role", { enum: JOB_CHAT_MESSAGE_ROLES }).notNull(),
    content: text("content").notNull().default(""),
    status: text("status", { enum: JOB_CHAT_MESSAGE_STATUSES })
      .notNull()
      .default("partial"),
    tokensIn: integer("tokens_in"),
    tokensOut: integer("tokens_out"),
    version: integer("version").notNull().default(1),
    replacesMessageId: text("replaces_message_id"),
    parentMessageId: text("parent_message_id"),
    activeChildId: text("active_child_id"),
    attachments: text("attachments").notNull().default("[]"),
    createdAt: text("created_at").notNull().default(sql`(datetime('now'))`),
    updatedAt: text("updated_at").notNull().default(sql`(datetime('now'))`),
  },
  (table) => ({
    threadCreatedIndex: index("idx_job_chat_messages_thread_created").on(
      table.threadId,
      table.createdAt,
    ),
  }),
);

export const jobChatRuns = sqliteTable(
  "job_chat_runs",
  {
    id: text("id").primaryKey(),
    tenantId: text("tenant_id")
      .notNull()
      .default("tenant_default")
      .references(() => tenants.id, { onDelete: "cascade" }),
    threadId: text("thread_id")
      .notNull()
      .references(() => jobChatThreads.id, { onDelete: "cascade" }),
    jobId: text("job_id")
      .notNull()
      .references(() => jobs.id, { onDelete: "cascade" }),
    status: text("status", { enum: JOB_CHAT_RUN_STATUSES })
      .notNull()
      .default("running"),
    model: text("model"),
    provider: text("provider"),
    errorCode: text("error_code"),
    errorMessage: text("error_message"),
    startedAt: integer("started_at", { mode: "number" }).notNull(),
    completedAt: integer("completed_at", { mode: "number" }),
    requestId: text("request_id"),
    createdAt: text("created_at").notNull().default(sql`(datetime('now'))`),
    updatedAt: text("updated_at").notNull().default(sql`(datetime('now'))`),
  },
  (table) => ({
    threadStatusIndex: index("idx_job_chat_runs_thread_status").on(
      table.threadId,
      table.status,
    ),
  }),
);

export const settings = sqliteTable(
  "settings",
  {
    tenantId: text("tenant_id")
      .notNull()
      .default("tenant_default")
      .references(() => tenants.id, { onDelete: "cascade" }),
    key: text("key").notNull(),
    value: text("value").notNull(),
    createdAt: text("created_at").notNull().default(sql`(datetime('now'))`),
    updatedAt: text("updated_at").notNull().default(sql`(datetime('now'))`),
  },
  (table) => ({
    tenantKeyUnique: uniqueIndex("idx_settings_tenant_key_unique").on(
      table.tenantId,
      table.key,
    ),
  }),
);

export const watchlistJobStates = sqliteTable(
  "watchlist_job_states",
  {
    id: text("id").primaryKey(),
    tenantId: text("tenant_id")
      .notNull()
      .default("tenant_default")
      .references(() => tenants.id, { onDelete: "cascade" }),
    userId: text("user_id").notNull(),
    source: text("source").notNull(),
    sourceJobId: text("source_job_id").notNull(),
    state: text("state", { enum: ["ignored", "moved_to_workspace"] })
      .notNull()
      .default("ignored"),
    createdAt: text("created_at").notNull().default(sql`(datetime('now'))`),
    updatedAt: text("updated_at").notNull().default(sql`(datetime('now'))`),
  },
  (table) => ({
    tenantUserSourceJobUnique: uniqueIndex(
      "idx_watchlist_job_states_tenant_user_source_job_unique",
    ).on(table.tenantId, table.userId, table.source, table.sourceJobId),
    tenantUserStateIndex: index(
      "idx_watchlist_job_states_tenant_user_state",
    ).on(table.tenantId, table.userId, table.state),
  }),
);

export const watchlistChecks = sqliteTable(
  "watchlist_checks",
  {
    id: text("id").primaryKey(),
    tenantId: text("tenant_id")
      .notNull()
      .default("tenant_default")
      .references(() => tenants.id, { onDelete: "cascade" }),
    userId: text("user_id").notNull(),
    lastCheckedAt: text("last_checked_at").notNull(),
    createdAt: text("created_at").notNull().default(sql`(datetime('now'))`),
    updatedAt: text("updated_at").notNull().default(sql`(datetime('now'))`),
  },
  (table) => ({
    tenantUserUnique: uniqueIndex("idx_watchlist_checks_tenant_user_unique").on(
      table.tenantId,
      table.userId,
    ),
  }),
);

export const watchlistSeenJobs = sqliteTable(
  "watchlist_seen_jobs",
  {
    id: text("id").primaryKey(),
    tenantId: text("tenant_id")
      .notNull()
      .default("tenant_default")
      .references(() => tenants.id, { onDelete: "cascade" }),
    userId: text("user_id").notNull(),
    source: text("source").notNull(),
    sourceJobId: text("source_job_id").notNull(),
    firstSeenAt: text("first_seen_at").notNull(),
    lastSeenAt: text("last_seen_at").notNull(),
    createdAt: text("created_at").notNull().default(sql`(datetime('now'))`),
    updatedAt: text("updated_at").notNull().default(sql`(datetime('now'))`),
  },
  (table) => ({
    tenantUserSourceJobUnique: uniqueIndex(
      "idx_watchlist_seen_jobs_tenant_user_source_job_unique",
    ).on(table.tenantId, table.userId, table.source, table.sourceJobId),
    tenantUserLastSeenIndex: index(
      "idx_watchlist_seen_jobs_tenant_user_last_seen",
    ).on(table.tenantId, table.userId, table.lastSeenAt),
  }),
);

export const watchlistSelectedSources = sqliteTable(
  "watchlist_selected_sources",
  {
    id: text("id").primaryKey(),
    tenantId: text("tenant_id")
      .notNull()
      .default("tenant_default")
      .references(() => tenants.id, { onDelete: "cascade" }),
    userId: text("user_id").notNull(),
    catalogSourceId: text("catalog_source_id"),
    label: text("label").notNull(),
    careersUrl: text("careers_url").notNull(),
    cxsJobsUrl: text("cxs_jobs_url"),
    sourceType: text("source_type").notNull(),
    isCustom: integer("is_custom", { mode: "boolean" })
      .notNull()
      .default(false),
    sortOrder: integer("sort_order").notNull().default(0),
    createdAt: text("created_at").notNull().default(sql`(datetime('now'))`),
    updatedAt: text("updated_at").notNull().default(sql`(datetime('now'))`),
  },
  (table) => ({
    tenantUserSortOrderUnique: uniqueIndex(
      "idx_watchlist_selected_sources_tenant_user_sort_order",
    ).on(table.tenantId, table.userId, table.sortOrder),
    tenantUserCareersUrlUnique: uniqueIndex(
      "idx_watchlist_selected_sources_tenant_user_careers_url",
    ).on(table.tenantId, table.userId, table.careersUrl),
    tenantUserIndex: index("idx_watchlist_selected_sources_tenant_user").on(
      table.tenantId,
      table.userId,
    ),
  }),
);

export const analyticsInstallState = sqliteTable("analytics_install_state", {
  id: text("id").primaryKey(),
  distinctId: text("distinct_id").notNull(),
  installedAt: text("installed_at").notNull(),
  rawEventReplayVersion: integer("raw_event_replay_version")
    .notNull()
    .default(0),
  rawEventReplayCompletedAt: text("raw_event_replay_completed_at"),
  createdAt: text("created_at").notNull().default(sql`(datetime('now'))`),
  updatedAt: text("updated_at").notNull().default(sql`(datetime('now'))`),
});

export const analyticsMilestones = sqliteTable(
  "analytics_milestones",
  {
    milestone: text("milestone").primaryKey(),
    firstSeenAt: integer("first_seen_at", { mode: "number" }).notNull(),
    firstSessionId: text("first_session_id"),
    reportedAt: text("reported_at"),
    createdAt: text("created_at").notNull().default(sql`(datetime('now'))`),
    updatedAt: text("updated_at").notNull().default(sql`(datetime('now'))`),
  },
  (table) => ({
    firstSeenAtIndex: index("idx_analytics_milestones_first_seen_at").on(
      table.firstSeenAt,
    ),
  }),
);

export const analyticsServerEventReplays = sqliteTable(
  "analytics_server_event_replays",
  {
    eventKey: text("event_key").primaryKey(),
    eventName: text("event_name").notNull(),
    occurredAt: integer("occurred_at", { mode: "number" }).notNull(),
    payload: text("payload", { mode: "json" }).notNull(),
    claimedAt: integer("claimed_at", { mode: "number" }),
    reportedAt: integer("reported_at", { mode: "number" }),
    createdAt: text("created_at").notNull().default(sql`(datetime('now'))`),
    updatedAt: text("updated_at").notNull().default(sql`(datetime('now'))`),
  },
  (table) => ({
    eventNameIndex: index("idx_analytics_server_event_replays_event_name").on(
      table.eventName,
    ),
    occurredAtIndex: index("idx_analytics_server_event_replays_occurred_at").on(
      table.occurredAt,
    ),
  }),
);

export const authSessions = sqliteTable(
  "auth_sessions",
  {
    id: text("id").primaryKey(),
    tenantId: text("tenant_id").references(() => tenants.id, {
      onDelete: "cascade",
    }),
    subject: text("subject").notNull(),
    userId: text("user_id").references(() => users.id, { onDelete: "cascade" }),
    expiresAt: integer("expires_at", { mode: "number" }).notNull(),
    revokedAt: integer("revoked_at", { mode: "number" }),
    createdAt: text("created_at").notNull().default(sql`(datetime('now'))`),
    updatedAt: text("updated_at").notNull().default(sql`(datetime('now'))`),
  },
  (table) => ({
    expiresAtIndex: index("idx_auth_sessions_expires_at").on(table.expiresAt),
    revokedAtIndex: index("idx_auth_sessions_revoked_at").on(table.revokedAt),
  }),
);

export const designResumeDocuments = sqliteTable("design_resume_documents", {
  id: text("id").primaryKey(),
  tenantId: text("tenant_id")
    .notNull()
    .default("tenant_default")
    .references(() => tenants.id, { onDelete: "cascade" }),
  title: text("title").notNull(),
  resumeJson: text("resume_json", { mode: "json" }).notNull(),
  revision: integer("revision").notNull().default(1),
  sourceResumeId: text("source_resume_id"),
  sourceMode: text("source_mode"),
  importedAt: text("imported_at"),
  createdAt: text("created_at").notNull().default(sql`(datetime('now'))`),
  updatedAt: text("updated_at").notNull().default(sql`(datetime('now'))`),
});

export const designResumeAssets = sqliteTable(
  "design_resume_assets",
  {
    id: text("id").primaryKey(),
    tenantId: text("tenant_id")
      .notNull()
      .default("tenant_default")
      .references(() => tenants.id, { onDelete: "cascade" }),
    documentId: text("document_id")
      .notNull()
      .references(() => designResumeDocuments.id, { onDelete: "cascade" }),
    kind: text("kind", { enum: ["picture"] })
      .notNull()
      .default("picture"),
    originalName: text("original_name").notNull(),
    mimeType: text("mime_type").notNull(),
    byteSize: integer("byte_size").notNull(),
    storagePath: text("storage_path").notNull(),
    createdAt: text("created_at").notNull().default(sql`(datetime('now'))`),
    updatedAt: text("updated_at").notNull().default(sql`(datetime('now'))`),
  },
  (table) => ({
    documentIndex: index("idx_design_resume_assets_document_id").on(
      table.documentId,
    ),
  }),
);

export const jobDocuments = sqliteTable(
  "job_documents",
  {
    id: text("id").primaryKey(),
    tenantId: text("tenant_id")
      .notNull()
      .default("tenant_default")
      .references(() => tenants.id, { onDelete: "cascade" }),
    jobId: text("job_id")
      .notNull()
      .references(() => jobs.id, { onDelete: "cascade" }),
    fileName: text("file_name").notNull(),
    mediaType: text("media_type"),
    byteSize: integer("byte_size").notNull(),
    storagePath: text("storage_path").notNull(),
    createdAt: text("created_at").notNull().default(sql`(datetime('now'))`),
    updatedAt: text("updated_at").notNull().default(sql`(datetime('now'))`),
  },
  (table) => ({
    jobIndex: index("idx_job_documents_job_id").on(table.jobId),
    tenantJobIndex: index("idx_job_documents_tenant_job_id").on(
      table.tenantId,
      table.jobId,
    ),
  }),
);

export const postApplicationIntegrations = sqliteTable(
  "post_application_integrations",
  {
    id: text("id").primaryKey(),
    tenantId: text("tenant_id")
      .notNull()
      .default("tenant_default")
      .references(() => tenants.id, { onDelete: "cascade" }),
    provider: text("provider", { enum: POST_APPLICATION_PROVIDERS }).notNull(),
    accountKey: text("account_key").notNull().default("default"),
    displayName: text("display_name"),
    status: text("status", { enum: POST_APPLICATION_INTEGRATION_STATUSES })
      .notNull()
      .default("disconnected"),
    credentials: text("credentials", { mode: "json" }),
    lastConnectedAt: integer("last_connected_at", { mode: "number" }),
    lastSyncedAt: integer("last_synced_at", { mode: "number" }),
    lastError: text("last_error"),
    createdAt: text("created_at").notNull().default(sql`(datetime('now'))`),
    updatedAt: text("updated_at").notNull().default(sql`(datetime('now'))`),
  },
  (table) => ({
    providerAccountUnique: uniqueIndex(
      "idx_post_app_integrations_tenant_provider_account_unique",
    ).on(table.tenantId, table.provider, table.accountKey),
  }),
);

export const postApplicationSyncRuns = sqliteTable(
  "post_application_sync_runs",
  {
    id: text("id").primaryKey(),
    tenantId: text("tenant_id")
      .notNull()
      .default("tenant_default")
      .references(() => tenants.id, { onDelete: "cascade" }),
    provider: text("provider", { enum: POST_APPLICATION_PROVIDERS }).notNull(),
    accountKey: text("account_key").notNull().default("default"),
    integrationId: text("integration_id").references(
      () => postApplicationIntegrations.id,
      { onDelete: "set null" },
    ),
    status: text("status", { enum: POST_APPLICATION_SYNC_RUN_STATUSES })
      .notNull()
      .default("running"),
    startedAt: integer("started_at", { mode: "number" }).notNull(),
    completedAt: integer("completed_at", { mode: "number" }),
    messagesDiscovered: integer("messages_discovered").notNull().default(0),
    messagesRelevant: integer("messages_relevant").notNull().default(0),
    messagesClassified: integer("messages_classified").notNull().default(0),
    messagesMatched: integer("messages_matched").notNull().default(0),
    messagesApproved: integer("messages_approved").notNull().default(0),
    messagesDenied: integer("messages_denied").notNull().default(0),
    messagesErrored: integer("messages_errored").notNull().default(0),
    errorCode: text("error_code"),
    errorMessage: text("error_message"),
    createdAt: text("created_at").notNull().default(sql`(datetime('now'))`),
    updatedAt: text("updated_at").notNull().default(sql`(datetime('now'))`),
  },
  (table) => ({
    providerAccountStartedAtIndex: index(
      "idx_post_app_sync_runs_provider_account_started_at",
    ).on(table.provider, table.accountKey, table.startedAt),
  }),
);

export const postApplicationMessages = sqliteTable(
  "post_application_messages",
  {
    id: text("id").primaryKey(),
    tenantId: text("tenant_id")
      .notNull()
      .default("tenant_default")
      .references(() => tenants.id, { onDelete: "cascade" }),
    provider: text("provider", { enum: POST_APPLICATION_PROVIDERS }).notNull(),
    accountKey: text("account_key").notNull().default("default"),
    integrationId: text("integration_id").references(
      () => postApplicationIntegrations.id,
      { onDelete: "set null" },
    ),
    syncRunId: text("sync_run_id").references(
      () => postApplicationSyncRuns.id,
      {
        onDelete: "set null",
      },
    ),
    externalMessageId: text("external_message_id").notNull(),
    externalThreadId: text("external_thread_id"),
    fromAddress: text("from_address").notNull().default(""),
    fromDomain: text("from_domain"),
    senderName: text("sender_name"),
    subject: text("subject").notNull().default(""),
    receivedAt: integer("received_at", { mode: "number" }).notNull(),
    snippet: text("snippet").notNull().default(""),
    classificationLabel: text("classification_label"),
    classificationConfidence: real("classification_confidence"),
    classificationPayload: text("classification_payload", { mode: "json" }),
    relevanceLlmScore: real("relevance_llm_score"),
    relevanceDecision: text("relevance_decision", {
      enum: POST_APPLICATION_RELEVANCE_DECISIONS,
    })
      .notNull()
      .default("needs_llm"),
    matchConfidence: integer("match_confidence"),
    messageType: text("message_type", {
      enum: POST_APPLICATION_MESSAGE_TYPES,
    })
      .notNull()
      .default("other"),
    stageEventPayload: text("stage_event_payload", { mode: "json" }),
    processingStatus: text("processing_status", {
      enum: POST_APPLICATION_PROCESSING_STATUSES,
    })
      .notNull()
      .default("pending_user"),
    matchedJobId: text("matched_job_id").references(() => jobs.id, {
      onDelete: "set null",
    }),
    decidedAt: integer("decided_at", { mode: "number" }),
    decidedBy: text("decided_by"),
    errorCode: text("error_code"),
    errorMessage: text("error_message"),
    createdAt: text("created_at").notNull().default(sql`(datetime('now'))`),
    updatedAt: text("updated_at").notNull().default(sql`(datetime('now'))`),
  },
  (table) => ({
    providerAccountExternalMessageUnique: uniqueIndex(
      "idx_post_app_messages_tenant_provider_account_external_unique",
    ).on(
      table.tenantId,
      table.provider,
      table.accountKey,
      table.externalMessageId,
    ),
    providerAccountReviewStatusIndex: index(
      "idx_post_app_messages_provider_account_processing_status",
    ).on(table.provider, table.accountKey, table.processingStatus),
  }),
);

export const tracerLinks = sqliteTable(
  "tracer_links",
  {
    id: text("id").primaryKey(),
    tenantId: text("tenant_id")
      .notNull()
      .default("tenant_default")
      .references(() => tenants.id, { onDelete: "cascade" }),
    token: text("token").notNull().unique(),
    jobId: text("job_id")
      .notNull()
      .references(() => jobs.id, { onDelete: "cascade" }),
    sourcePath: text("source_path").notNull(),
    sourceLabel: text("source_label").notNull(),
    destinationUrl: text("destination_url").notNull(),
    destinationUrlHash: text("destination_url_hash").notNull(),
    isActive: integer("is_active", { mode: "boolean" }).notNull().default(true),
    createdAt: text("created_at").notNull().default(sql`(datetime('now'))`),
    updatedAt: text("updated_at").notNull().default(sql`(datetime('now'))`),
  },
  (table) => ({
    jobPathDestinationUnique: uniqueIndex(
      "idx_tracer_links_tenant_job_source_destination_unique",
    ).on(
      table.tenantId,
      table.jobId,
      table.sourcePath,
      table.destinationUrlHash,
    ),
    jobIndex: index("idx_tracer_links_job_id").on(table.jobId),
  }),
);

export const tracerClickEvents = sqliteTable(
  "tracer_click_events",
  {
    id: text("id").primaryKey(),
    tenantId: text("tenant_id")
      .notNull()
      .default("tenant_default")
      .references(() => tenants.id, { onDelete: "cascade" }),
    tracerLinkId: text("tracer_link_id")
      .notNull()
      .references(() => tracerLinks.id, { onDelete: "cascade" }),
    clickedAt: integer("clicked_at", { mode: "number" }).notNull(),
    requestId: text("request_id"),
    isLikelyBot: integer("is_likely_bot", { mode: "boolean" })
      .notNull()
      .default(false),
    deviceType: text("device_type").notNull().default("unknown"),
    uaFamily: text("ua_family").notNull().default("unknown"),
    osFamily: text("os_family").notNull().default("unknown"),
    referrerHost: text("referrer_host"),
    ipHash: text("ip_hash"),
    uniqueFingerprintHash: text("unique_fingerprint_hash"),
  },
  (table) => ({
    tracerLinkIndex: index("idx_tracer_click_events_tracer_link_id").on(
      table.tracerLinkId,
    ),
    clickedAtIndex: index("idx_tracer_click_events_clicked_at").on(
      table.clickedAt,
    ),
    botIndex: index("idx_tracer_click_events_is_likely_bot").on(
      table.isLikelyBot,
    ),
    uniqueFingerprintIndex: index(
      "idx_tracer_click_events_unique_fingerprint_hash",
    ).on(table.uniqueFingerprintHash),
  }),
);

export type UserRow = typeof users.$inferSelect;
export type NewUserRow = typeof users.$inferInsert;
export type TenantRow = typeof tenants.$inferSelect;
export type NewTenantRow = typeof tenants.$inferInsert;
export type TenantMembershipRow = typeof tenantMemberships.$inferSelect;
export type NewTenantMembershipRow = typeof tenantMemberships.$inferInsert;
export type JobRow = typeof jobs.$inferSelect;
export type NewJobRow = typeof jobs.$inferInsert;
export type ApplicationDossierRow = typeof applicationDossiers.$inferSelect;
export type NewApplicationDossierRow = typeof applicationDossiers.$inferInsert;
export type ApplicationDraftRevisionRow =
  typeof applicationDraftRevisions.$inferSelect;
export type NewApplicationDraftRevisionRow =
  typeof applicationDraftRevisions.$inferInsert;
export type ApplicationApprovalRow = typeof applicationApprovals.$inferSelect;
export type NewApplicationApprovalRow =
  typeof applicationApprovals.$inferInsert;
export type SubmittedApplicationArtifactRow =
  typeof submittedApplicationArtifacts.$inferSelect;
export type NewSubmittedApplicationArtifactRow =
  typeof submittedApplicationArtifacts.$inferInsert;
export type JobPostingSnapshotRow = typeof jobPostingSnapshots.$inferSelect;
export type NewJobPostingSnapshotRow = typeof jobPostingSnapshots.$inferInsert;
export type StoryTagRow = typeof storyTags.$inferSelect;
export type NewStoryTagRow = typeof storyTags.$inferInsert;
export type StoryTagAssignmentRow = typeof storyTagAssignments.$inferSelect;
export type NewStoryTagAssignmentRow = typeof storyTagAssignments.$inferInsert;
export type StoryUsageEventRow = typeof storyUsageEvents.$inferSelect;
export type NewStoryUsageEventRow = typeof storyUsageEvents.$inferInsert;
export type CareerProfileOverlayRow = typeof careerProfileOverlays.$inferSelect;
export type NewCareerProfileOverlayRow =
  typeof careerProfileOverlays.$inferInsert;
export type StageEventRow = typeof stageEvents.$inferSelect;
export type NewStageEventRow = typeof stageEvents.$inferInsert;
export type TaskRow = typeof tasks.$inferSelect;
export type NewTaskRow = typeof tasks.$inferInsert;
export type JobNoteRow = typeof jobNotes.$inferSelect;
export type NewJobNoteRow = typeof jobNotes.$inferInsert;
export type JobDocumentRow = typeof jobDocuments.$inferSelect;
export type NewJobDocumentRow = typeof jobDocuments.$inferInsert;
export type InterviewRow = typeof interviews.$inferSelect;
export type NewInterviewRow = typeof interviews.$inferInsert;
export type PipelineRunRow = typeof pipelineRuns.$inferSelect;
export type NewPipelineRunRow = typeof pipelineRuns.$inferInsert;
export type PipelineSearchPresetRow = typeof pipelineSearchPresets.$inferSelect;
export type NewPipelineSearchPresetRow =
  typeof pipelineSearchPresets.$inferInsert;
export type JobChatThreadRow = typeof jobChatThreads.$inferSelect;
export type NewJobChatThreadRow = typeof jobChatThreads.$inferInsert;
export type JobChatMessageRow = typeof jobChatMessages.$inferSelect;
export type NewJobChatMessageRow = typeof jobChatMessages.$inferInsert;
export type JobChatRunRow = typeof jobChatRuns.$inferSelect;
export type NewJobChatRunRow = typeof jobChatRuns.$inferInsert;
export type SettingsRow = typeof settings.$inferSelect;
export type NewSettingsRow = typeof settings.$inferInsert;
export type AnalyticsInstallStateRow =
  typeof analyticsInstallState.$inferSelect;
export type NewAnalyticsInstallStateRow =
  typeof analyticsInstallState.$inferInsert;
export type AnalyticsMilestoneRow = typeof analyticsMilestones.$inferSelect;
export type NewAnalyticsMilestoneRow = typeof analyticsMilestones.$inferInsert;
export type AnalyticsServerEventReplayRow =
  typeof analyticsServerEventReplays.$inferSelect;
export type NewAnalyticsServerEventReplayRow =
  typeof analyticsServerEventReplays.$inferInsert;
export type DesignResumeDocumentRow = typeof designResumeDocuments.$inferSelect;
export type NewDesignResumeDocumentRow =
  typeof designResumeDocuments.$inferInsert;
export type DesignResumeAssetRow = typeof designResumeAssets.$inferSelect;
export type NewDesignResumeAssetRow = typeof designResumeAssets.$inferInsert;
export type PostApplicationIntegrationRow =
  typeof postApplicationIntegrations.$inferSelect;
export type NewPostApplicationIntegrationRow =
  typeof postApplicationIntegrations.$inferInsert;
export type PostApplicationSyncRunRow =
  typeof postApplicationSyncRuns.$inferSelect;
export type NewPostApplicationSyncRunRow =
  typeof postApplicationSyncRuns.$inferInsert;
export type PostApplicationMessageRow =
  typeof postApplicationMessages.$inferSelect;
export type NewPostApplicationMessageRow =
  typeof postApplicationMessages.$inferInsert;
export type TracerLinkRow = typeof tracerLinks.$inferSelect;
export type NewTracerLinkRow = typeof tracerLinks.$inferInsert;
export type TracerClickEventRow = typeof tracerClickEvents.$inferSelect;
export type NewTracerClickEventRow = typeof tracerClickEvents.$inferInsert;
