import { createHash } from "node:crypto";
import { APPLICATION_SNAPSHOT_MAX_CHARS } from "@shared/types/application-domain";
import type Database from "better-sqlite3";

export type VersionedMigration = {
  version: number;
  sql: string;
};

export const VERSIONED_MIGRATIONS: readonly VersionedMigration[] = [
  {
    version: 1,
    sql: "CREATE UNIQUE INDEX IF NOT EXISTS idx_jobs_tenant_id_id_unique ON jobs(tenant_id, id)",
  },
  {
    version: 2,
    sql: `
      CREATE UNIQUE INDEX IF NOT EXISTS idx_tenant_memberships_tenant_user_unique
        ON tenant_memberships(tenant_id, user_id);
      CREATE UNIQUE INDEX IF NOT EXISTS idx_interview_stories_tenant_id_unique
        ON interview_stories(tenant_id, id);

      CREATE TABLE application_dossiers (
        id TEXT PRIMARY KEY,
        tenant_id TEXT NOT NULL,
        job_id TEXT NOT NULL,
        lifecycle_state TEXT NOT NULL CHECK(lifecycle_state IN ('draft', 'pending_approval', 'approved', 'submitted', 'withdrawn', 'closed')),
        created_at TEXT NOT NULL DEFAULT (datetime('now')),
        updated_at TEXT NOT NULL DEFAULT (datetime('now')),
        FOREIGN KEY (tenant_id) REFERENCES tenants(id) ON DELETE CASCADE,
        FOREIGN KEY (tenant_id, job_id) REFERENCES jobs(tenant_id, id) ON DELETE CASCADE,
        UNIQUE(tenant_id, id),
        UNIQUE(tenant_id, id, job_id),
        UNIQUE(tenant_id, job_id)
      );
      CREATE INDEX idx_application_dossiers_tenant_lifecycle
        ON application_dossiers(tenant_id, lifecycle_state);

      CREATE TABLE application_draft_revisions (
        id TEXT PRIMARY KEY,
        tenant_id TEXT NOT NULL,
        dossier_id TEXT NOT NULL,
        job_id TEXT NOT NULL,
        revision_number INTEGER NOT NULL CHECK(revision_number > 0),
        job_snapshot TEXT NOT NULL,
        resume_snapshot TEXT NOT NULL,
        story_snapshot TEXT NOT NULL,
        content_snapshot TEXT NOT NULL,
        provenance TEXT NOT NULL,
        content_hash TEXT NOT NULL CHECK(length(content_hash) = 64),
        created_at TEXT NOT NULL DEFAULT (datetime('now')),
        FOREIGN KEY (tenant_id) REFERENCES tenants(id) ON DELETE CASCADE,
        FOREIGN KEY (tenant_id, job_id) REFERENCES jobs(tenant_id, id) ON DELETE CASCADE,
        FOREIGN KEY (tenant_id, dossier_id) REFERENCES application_dossiers(tenant_id, id) ON DELETE CASCADE,
        FOREIGN KEY (tenant_id, dossier_id, job_id) REFERENCES application_dossiers(tenant_id, id, job_id) ON DELETE CASCADE,
        UNIQUE(tenant_id, id),
        UNIQUE(tenant_id, id, dossier_id, job_id),
        UNIQUE(tenant_id, dossier_id, revision_number)
      );
      CREATE INDEX idx_application_draft_revisions_tenant_job
        ON application_draft_revisions(tenant_id, job_id, created_at);

      CREATE TABLE application_approvals (
        id TEXT PRIMARY KEY,
        tenant_id TEXT NOT NULL,
        dossier_id TEXT NOT NULL,
        job_id TEXT NOT NULL,
        decision TEXT NOT NULL CHECK(decision IN ('approved', 'rejected', 'changes_requested')),
        approved_by_user_id TEXT NOT NULL,
        policy_version TEXT NOT NULL,
        request_id TEXT NOT NULL,
        reason TEXT,
        created_at TEXT NOT NULL DEFAULT (datetime('now')),
        FOREIGN KEY (tenant_id) REFERENCES tenants(id) ON DELETE CASCADE,
        FOREIGN KEY (tenant_id, job_id) REFERENCES jobs(tenant_id, id) ON DELETE CASCADE,
        FOREIGN KEY (tenant_id, dossier_id) REFERENCES application_dossiers(tenant_id, id) ON DELETE CASCADE,
        FOREIGN KEY (tenant_id, dossier_id, job_id) REFERENCES application_dossiers(tenant_id, id, job_id) ON DELETE CASCADE,
        FOREIGN KEY (approved_by_user_id) REFERENCES users(id) ON DELETE RESTRICT,
        FOREIGN KEY (tenant_id, approved_by_user_id) REFERENCES tenant_memberships(tenant_id, user_id) ON DELETE RESTRICT,
        UNIQUE(tenant_id, id)
      );
      CREATE INDEX idx_application_approvals_tenant_dossier
        ON application_approvals(tenant_id, dossier_id, created_at);

      CREATE TABLE submitted_application_artifacts (
        id TEXT PRIMARY KEY,
        tenant_id TEXT NOT NULL,
        dossier_id TEXT NOT NULL,
        job_id TEXT NOT NULL,
        draft_revision_id TEXT NOT NULL,
        storage_path TEXT NOT NULL CHECK(storage_path GLOB 'data/submitted-applications/*'),
        sha256 TEXT NOT NULL CHECK(length(sha256) = 64),
        byte_size INTEGER NOT NULL CHECK(byte_size >= 0),
        media_type TEXT NOT NULL CHECK(length(trim(media_type)) > 0),
        qa_result TEXT NOT NULL CHECK(qa_result IN ('pending', 'passed', 'failed', 'not_run')),
        created_at TEXT NOT NULL DEFAULT (datetime('now')),
        FOREIGN KEY (tenant_id) REFERENCES tenants(id) ON DELETE CASCADE,
        FOREIGN KEY (tenant_id, job_id) REFERENCES jobs(tenant_id, id) ON DELETE CASCADE,
        FOREIGN KEY (tenant_id, dossier_id, job_id) REFERENCES application_dossiers(tenant_id, id, job_id) ON DELETE CASCADE,
        FOREIGN KEY (tenant_id, draft_revision_id) REFERENCES application_draft_revisions(tenant_id, id) ON DELETE RESTRICT,
        FOREIGN KEY (tenant_id, draft_revision_id, dossier_id, job_id) REFERENCES application_draft_revisions(tenant_id, id, dossier_id, job_id) ON DELETE RESTRICT,
        UNIQUE(tenant_id, id),
        UNIQUE(tenant_id, storage_path),
        UNIQUE(tenant_id, dossier_id, sha256)
      );
      CREATE INDEX idx_submitted_application_artifacts_tenant_job
        ON submitted_application_artifacts(tenant_id, job_id, created_at);

      CREATE TABLE job_posting_snapshots (
        id TEXT PRIMARY KEY,
        tenant_id TEXT NOT NULL,
        job_id TEXT NOT NULL,
        normalized_text TEXT NOT NULL,
        content_hash TEXT NOT NULL CHECK(length(content_hash) = 64),
        source_url TEXT NOT NULL CHECK(length(trim(source_url)) > 0),
        retrieved_at TEXT NOT NULL,
        retrieval_metadata TEXT NOT NULL,
        created_at TEXT NOT NULL DEFAULT (datetime('now')),
        FOREIGN KEY (tenant_id) REFERENCES tenants(id) ON DELETE CASCADE,
        FOREIGN KEY (tenant_id, job_id) REFERENCES jobs(tenant_id, id) ON DELETE CASCADE,
        UNIQUE(tenant_id, id),
        UNIQUE(tenant_id, job_id, content_hash)
      );
      CREATE INDEX idx_job_posting_snapshots_tenant_job_retrieved
        ON job_posting_snapshots(tenant_id, job_id, retrieved_at);

      CREATE TABLE story_tags (
        id TEXT PRIMARY KEY,
        tenant_id TEXT NOT NULL,
        name TEXT NOT NULL CHECK(length(trim(name)) > 0),
        created_at TEXT NOT NULL DEFAULT (datetime('now')),
        FOREIGN KEY (tenant_id) REFERENCES tenants(id) ON DELETE CASCADE,
        UNIQUE(tenant_id, id),
        UNIQUE(tenant_id, name)
      );

      CREATE TABLE story_tag_assignments (
        id TEXT PRIMARY KEY,
        tenant_id TEXT NOT NULL,
        story_id TEXT NOT NULL,
        tag_id TEXT NOT NULL,
        created_at TEXT NOT NULL DEFAULT (datetime('now')),
        FOREIGN KEY (tenant_id) REFERENCES tenants(id) ON DELETE CASCADE,
        FOREIGN KEY (tenant_id, story_id) REFERENCES interview_stories(tenant_id, id) ON DELETE CASCADE,
        FOREIGN KEY (tenant_id, tag_id) REFERENCES story_tags(tenant_id, id) ON DELETE CASCADE,
        UNIQUE(tenant_id, id),
        UNIQUE(tenant_id, story_id, tag_id)
      );
      CREATE INDEX idx_story_tag_assignments_tenant_tag
        ON story_tag_assignments(tenant_id, tag_id);

      CREATE TABLE story_usage_events (
        id TEXT PRIMARY KEY,
        tenant_id TEXT NOT NULL,
        story_id TEXT NOT NULL,
        job_id TEXT NOT NULL,
        usage_kind TEXT NOT NULL CHECK(usage_kind IN ('draft', 'submitted_application', 'interview_prep')),
        provenance TEXT NOT NULL,
        created_at TEXT NOT NULL DEFAULT (datetime('now')),
        FOREIGN KEY (tenant_id) REFERENCES tenants(id) ON DELETE CASCADE,
        FOREIGN KEY (tenant_id, story_id) REFERENCES interview_stories(tenant_id, id) ON DELETE RESTRICT,
        FOREIGN KEY (tenant_id, job_id) REFERENCES jobs(tenant_id, id) ON DELETE CASCADE,
        UNIQUE(tenant_id, id)
      );
      CREATE INDEX idx_story_usage_events_tenant_story
        ON story_usage_events(tenant_id, story_id, created_at);

      CREATE TABLE career_profile_overlays (
        tenant_id TEXT PRIMARY KEY,
        preferences TEXT NOT NULL,
        targets TEXT NOT NULL,
        constraints TEXT NOT NULL,
        provenance TEXT NOT NULL,
        created_at TEXT NOT NULL DEFAULT (datetime('now')),
        updated_at TEXT NOT NULL DEFAULT (datetime('now')),
        FOREIGN KEY (tenant_id) REFERENCES tenants(id) ON DELETE CASCADE
      );

      CREATE TRIGGER application_draft_revisions_no_update
        BEFORE UPDATE ON application_draft_revisions BEGIN SELECT RAISE(ABORT, 'application_draft_revisions is append-only'); END;
      CREATE TRIGGER application_draft_revisions_no_delete
        BEFORE DELETE ON application_draft_revisions BEGIN SELECT RAISE(ABORT, 'application_draft_revisions is append-only'); END;
      CREATE TRIGGER application_approvals_no_update
        BEFORE UPDATE ON application_approvals BEGIN SELECT RAISE(ABORT, 'application_approvals is append-only'); END;
      CREATE TRIGGER application_approvals_no_delete
        BEFORE DELETE ON application_approvals BEGIN SELECT RAISE(ABORT, 'application_approvals is append-only'); END;
      CREATE TRIGGER submitted_application_artifacts_no_update
        BEFORE UPDATE ON submitted_application_artifacts BEGIN SELECT RAISE(ABORT, 'submitted_application_artifacts is append-only'); END;
      CREATE TRIGGER submitted_application_artifacts_no_delete
        BEFORE DELETE ON submitted_application_artifacts BEGIN SELECT RAISE(ABORT, 'submitted_application_artifacts is append-only'); END;
      CREATE TRIGGER submitted_application_artifacts_no_working_pdf_alias
        BEFORE INSERT ON submitted_application_artifacts
        WHEN EXISTS (
          SELECT 1 FROM jobs
          WHERE jobs.tenant_id = NEW.tenant_id
            AND jobs.id = NEW.job_id
            AND jobs.pdf_path = NEW.storage_path
        )
        BEGIN SELECT RAISE(ABORT, 'submitted application artifact cannot alias working pdf_path'); END;
      CREATE TRIGGER job_posting_snapshots_no_update
        BEFORE UPDATE ON job_posting_snapshots BEGIN SELECT RAISE(ABORT, 'job_posting_snapshots is append-only'); END;
      CREATE TRIGGER job_posting_snapshots_no_delete
        BEFORE DELETE ON job_posting_snapshots BEGIN SELECT RAISE(ABORT, 'job_posting_snapshots is append-only'); END;
    `,
  },
  {
    // Never edit a released migration: existing databases verify its checksum.
    version: 3,
    sql: `
      CREATE TABLE application_draft_revisions_new (
        id TEXT PRIMARY KEY,
        tenant_id TEXT NOT NULL,
        dossier_id TEXT NOT NULL,
        job_id TEXT NOT NULL,
        revision_number INTEGER NOT NULL CHECK(revision_number > 0),
        job_snapshot TEXT NOT NULL,
        resume_snapshot TEXT NOT NULL,
        story_snapshot TEXT NOT NULL,
        content_snapshot TEXT NOT NULL,
        provenance TEXT NOT NULL,
        content_hash TEXT NOT NULL,
        created_at TEXT NOT NULL DEFAULT (datetime('now')),
        CHECK(length(job_snapshot) <= ${APPLICATION_SNAPSHOT_MAX_CHARS.job} AND json_valid(job_snapshot)),
        CHECK(length(resume_snapshot) <= ${APPLICATION_SNAPSHOT_MAX_CHARS.resume} AND json_valid(resume_snapshot)),
        CHECK(length(story_snapshot) <= ${APPLICATION_SNAPSHOT_MAX_CHARS.story} AND json_valid(story_snapshot)),
        CHECK(length(content_snapshot) <= ${APPLICATION_SNAPSHOT_MAX_CHARS.content} AND json_valid(content_snapshot)),
        CHECK(length(provenance) <= ${APPLICATION_SNAPSHOT_MAX_CHARS.provenance} AND json_valid(provenance)),
        CHECK(length(content_hash) = 64 AND content_hash NOT GLOB '*[^0-9a-f]*'),
        FOREIGN KEY (tenant_id) REFERENCES tenants(id) ON DELETE RESTRICT,
        FOREIGN KEY (tenant_id, job_id) REFERENCES jobs(tenant_id, id) ON DELETE RESTRICT,
        FOREIGN KEY (tenant_id, dossier_id) REFERENCES application_dossiers(tenant_id, id) ON DELETE RESTRICT,
        FOREIGN KEY (tenant_id, dossier_id, job_id) REFERENCES application_dossiers(tenant_id, id, job_id) ON DELETE RESTRICT,
        UNIQUE(tenant_id, id),
        UNIQUE(tenant_id, id, dossier_id, job_id),
        UNIQUE(tenant_id, dossier_id, revision_number)
      );
      INSERT INTO application_draft_revisions_new
        SELECT * FROM application_draft_revisions;

      CREATE TABLE application_approvals_new (
        id TEXT PRIMARY KEY,
        tenant_id TEXT NOT NULL,
        dossier_id TEXT NOT NULL,
        job_id TEXT NOT NULL,
        decision TEXT NOT NULL CHECK(decision IN ('approved', 'rejected', 'changes_requested')),
        approved_by_user_id TEXT NOT NULL,
        policy_version TEXT NOT NULL,
        request_id TEXT NOT NULL,
        reason TEXT,
        created_at TEXT NOT NULL DEFAULT (datetime('now')),
        FOREIGN KEY (tenant_id) REFERENCES tenants(id) ON DELETE RESTRICT,
        FOREIGN KEY (tenant_id, job_id) REFERENCES jobs(tenant_id, id) ON DELETE RESTRICT,
        FOREIGN KEY (tenant_id, dossier_id) REFERENCES application_dossiers(tenant_id, id) ON DELETE RESTRICT,
        FOREIGN KEY (tenant_id, dossier_id, job_id) REFERENCES application_dossiers(tenant_id, id, job_id) ON DELETE RESTRICT,
        FOREIGN KEY (approved_by_user_id) REFERENCES users(id) ON DELETE RESTRICT,
        FOREIGN KEY (tenant_id, approved_by_user_id) REFERENCES tenant_memberships(tenant_id, user_id) ON DELETE RESTRICT,
        UNIQUE(tenant_id, id)
      );
      INSERT INTO application_approvals_new SELECT * FROM application_approvals;

      CREATE TABLE submitted_application_artifacts_staging AS
        SELECT * FROM submitted_application_artifacts;
      DROP TABLE submitted_application_artifacts;

      CREATE TABLE job_posting_snapshots_new (
        id TEXT PRIMARY KEY,
        tenant_id TEXT NOT NULL,
        job_id TEXT NOT NULL,
        normalized_text TEXT NOT NULL,
        content_hash TEXT NOT NULL,
        source_url TEXT NOT NULL CHECK(length(trim(source_url)) > 0),
        retrieved_at TEXT NOT NULL,
        retrieval_metadata TEXT NOT NULL,
        created_at TEXT NOT NULL DEFAULT (datetime('now')),
        CHECK(length(normalized_text) <= ${APPLICATION_SNAPSHOT_MAX_CHARS.postingText}),
        CHECK(length(content_hash) = 64 AND content_hash NOT GLOB '*[^0-9a-f]*'),
        CHECK(length(retrieval_metadata) <= ${APPLICATION_SNAPSHOT_MAX_CHARS.postingMetadata} AND json_valid(retrieval_metadata)),
        FOREIGN KEY (tenant_id) REFERENCES tenants(id) ON DELETE RESTRICT,
        FOREIGN KEY (tenant_id, job_id) REFERENCES jobs(tenant_id, id) ON DELETE RESTRICT,
        UNIQUE(tenant_id, id),
        UNIQUE(tenant_id, job_id, content_hash)
      );
      INSERT INTO job_posting_snapshots_new SELECT * FROM job_posting_snapshots;

      CREATE TABLE story_usage_events_new (
        id TEXT PRIMARY KEY,
        tenant_id TEXT NOT NULL,
        story_id TEXT NOT NULL,
        job_id TEXT NOT NULL,
        usage_kind TEXT NOT NULL CHECK(usage_kind IN ('draft', 'submitted_application', 'interview_prep')),
        provenance TEXT NOT NULL,
        created_at TEXT NOT NULL DEFAULT (datetime('now')),
        CHECK(length(provenance) <= ${APPLICATION_SNAPSHOT_MAX_CHARS.provenance} AND json_valid(provenance)),
        FOREIGN KEY (tenant_id) REFERENCES tenants(id) ON DELETE RESTRICT,
        FOREIGN KEY (tenant_id, story_id) REFERENCES interview_stories(tenant_id, id) ON DELETE RESTRICT,
        FOREIGN KEY (tenant_id, job_id) REFERENCES jobs(tenant_id, id) ON DELETE RESTRICT,
        UNIQUE(tenant_id, id)
      );
      INSERT INTO story_usage_events_new SELECT * FROM story_usage_events;

      DROP TABLE application_draft_revisions;
      DROP TABLE application_approvals;
      DROP TABLE job_posting_snapshots;
      DROP TABLE story_usage_events;
      ALTER TABLE application_draft_revisions_new RENAME TO application_draft_revisions;
      ALTER TABLE application_approvals_new RENAME TO application_approvals;
      CREATE TABLE submitted_application_artifacts_new (
        id TEXT PRIMARY KEY,
        tenant_id TEXT NOT NULL,
        dossier_id TEXT NOT NULL,
        job_id TEXT NOT NULL,
        draft_revision_id TEXT NOT NULL,
        storage_path TEXT NOT NULL,
        sha256 TEXT NOT NULL,
        byte_size INTEGER NOT NULL,
        media_type TEXT NOT NULL,
        qa_result TEXT NOT NULL CHECK(qa_result IN ('pending', 'passed', 'failed', 'not_run')),
        created_at TEXT NOT NULL DEFAULT (datetime('now')),
        CHECK(storage_path GLOB 'data/submitted-applications/*'
          AND length(storage_path) > length('data/submitted-applications/')
          AND instr(storage_path, '..') = 0
          AND instr(storage_path, '//') = 0),
        CHECK(length(sha256) = 64 AND sha256 NOT GLOB '*[^0-9a-f]*'),
        CHECK(byte_size >= 0 AND byte_size <= 104857600),
        CHECK(length(trim(media_type)) > 0
          AND instr(trim(media_type), ' ') = 0
          AND instr(media_type, '/') > 1
          AND instr(media_type, '/') < length(media_type)),
        FOREIGN KEY (tenant_id) REFERENCES tenants(id) ON DELETE RESTRICT,
        FOREIGN KEY (tenant_id, job_id) REFERENCES jobs(tenant_id, id) ON DELETE RESTRICT,
        FOREIGN KEY (tenant_id, dossier_id, job_id) REFERENCES application_dossiers(tenant_id, id, job_id) ON DELETE RESTRICT,
        FOREIGN KEY (tenant_id, draft_revision_id) REFERENCES application_draft_revisions(tenant_id, id) ON DELETE RESTRICT,
        FOREIGN KEY (tenant_id, draft_revision_id, dossier_id, job_id) REFERENCES application_draft_revisions(tenant_id, id, dossier_id, job_id) ON DELETE RESTRICT,
        UNIQUE(tenant_id, id),
        UNIQUE(tenant_id, storage_path),
        UNIQUE(tenant_id, dossier_id, sha256)
      );
      INSERT INTO submitted_application_artifacts_new
        SELECT * FROM submitted_application_artifacts_staging;
      DROP TABLE submitted_application_artifacts_staging;
      ALTER TABLE submitted_application_artifacts_new RENAME TO submitted_application_artifacts;
      ALTER TABLE job_posting_snapshots_new RENAME TO job_posting_snapshots;
      ALTER TABLE story_usage_events_new RENAME TO story_usage_events;

      CREATE INDEX idx_application_draft_revisions_tenant_job
        ON application_draft_revisions(tenant_id, job_id, created_at);
      CREATE INDEX idx_application_approvals_tenant_dossier
        ON application_approvals(tenant_id, dossier_id, created_at);
      CREATE INDEX idx_submitted_application_artifacts_tenant_job
        ON submitted_application_artifacts(tenant_id, job_id, created_at);
      CREATE INDEX idx_job_posting_snapshots_tenant_job_retrieved
        ON job_posting_snapshots(tenant_id, job_id, retrieved_at);
      CREATE INDEX idx_story_usage_events_tenant_story
        ON story_usage_events(tenant_id, story_id, created_at);
      CREATE UNIQUE INDEX idx_submitted_application_artifacts_tenant_dossier_finalization_unique
        ON submitted_application_artifacts(tenant_id, dossier_id);
      CREATE UNIQUE INDEX idx_application_approvals_tenant_request_unique
        ON application_approvals(tenant_id, request_id);

      CREATE TRIGGER application_draft_revisions_no_update
        BEFORE UPDATE ON application_draft_revisions BEGIN SELECT RAISE(ABORT, 'application_draft_revisions is append-only'); END;
      CREATE TRIGGER application_draft_revisions_no_delete
        BEFORE DELETE ON application_draft_revisions BEGIN SELECT RAISE(ABORT, 'application_draft_revisions is append-only'); END;
      CREATE TRIGGER application_draft_revisions_validate_hash_insert
        BEFORE INSERT ON application_draft_revisions
        WHEN length(NEW.content_hash) != 64
          OR lower(NEW.content_hash) GLOB '*[^0-9a-f]*'
        BEGIN SELECT RAISE(ABORT, 'application draft content_hash must be a SHA-256 hex digest'); END;
      CREATE TRIGGER submitted_application_artifacts_validate_insert
        BEFORE INSERT ON submitted_application_artifacts
        WHEN length(NEW.sha256) != 64
          OR lower(NEW.sha256) GLOB '*[^0-9a-f]*'
          OR NEW.byte_size > 104857600
          OR length(NEW.storage_path) <= length('data/submitted-applications/')
          OR instr(NEW.storage_path, '..') > 0
          OR instr(NEW.storage_path, '//') > 0
          OR instr(trim(NEW.media_type), ' ') > 0
          OR instr(NEW.media_type, '/') <= 1
          OR instr(NEW.media_type, '/') = length(NEW.media_type)
        BEGIN SELECT RAISE(ABORT, 'submitted application artifact validation failed'); END;
      CREATE TRIGGER submitted_application_artifacts_no_update
        BEFORE UPDATE ON submitted_application_artifacts BEGIN SELECT RAISE(ABORT, 'submitted_application_artifacts is append-only'); END;
      CREATE TRIGGER submitted_application_artifacts_no_delete
        BEFORE DELETE ON submitted_application_artifacts BEGIN SELECT RAISE(ABORT, 'submitted_application_artifacts is append-only'); END;
      CREATE TRIGGER submitted_application_artifacts_no_working_pdf_alias
        BEFORE INSERT ON submitted_application_artifacts
        WHEN EXISTS (
          SELECT 1 FROM jobs
          WHERE jobs.tenant_id = NEW.tenant_id
            AND jobs.id = NEW.job_id
            AND jobs.pdf_path = NEW.storage_path
        )
        BEGIN SELECT RAISE(ABORT, 'submitted application artifact cannot alias working pdf_path'); END;

      CREATE TRIGGER application_approvals_no_update
        BEFORE UPDATE ON application_approvals BEGIN SELECT RAISE(ABORT, 'application_approvals is append-only'); END;
      CREATE TRIGGER application_approvals_no_delete
        BEFORE DELETE ON application_approvals BEGIN SELECT RAISE(ABORT, 'application_approvals is append-only'); END;
      CREATE TRIGGER job_posting_snapshots_validate_insert
        BEFORE INSERT ON job_posting_snapshots
        WHEN length(NEW.content_hash) != 64
          OR lower(NEW.content_hash) GLOB '*[^0-9a-f]*'
        BEGIN SELECT RAISE(ABORT, 'job posting snapshot must have a SHA-256 hash'); END;
      CREATE TRIGGER job_posting_snapshots_no_update
        BEFORE UPDATE ON job_posting_snapshots BEGIN SELECT RAISE(ABORT, 'job_posting_snapshots is append-only'); END;
      CREATE TRIGGER job_posting_snapshots_no_delete
        BEFORE DELETE ON job_posting_snapshots BEGIN SELECT RAISE(ABORT, 'job_posting_snapshots is append-only'); END;

      CREATE TRIGGER story_usage_events_no_update
        BEFORE UPDATE ON story_usage_events BEGIN SELECT RAISE(ABORT, 'story_usage_events is append-only'); END;
      CREATE TRIGGER story_usage_events_no_delete
        BEFORE DELETE ON story_usage_events BEGIN SELECT RAISE(ABORT, 'story_usage_events is append-only'); END;
    `,
  },
  {
    version: 4,
    sql: `
      ALTER TABLE application_approvals ADD COLUMN draft_revision_id TEXT;
      ALTER TABLE application_approvals ADD COLUMN submitted_artifact_id TEXT;
      CREATE INDEX idx_application_approvals_tenant_artifact
        ON application_approvals(tenant_id, submitted_artifact_id);
    `,
  },
  {
    version: 5,
    sql: `
      CREATE TABLE competencies (
        id TEXT PRIMARY KEY,
        tenant_id TEXT NOT NULL,
        name TEXT NOT NULL CHECK(length(trim(name)) > 0 AND length(name) <= 128),
        created_at TEXT NOT NULL DEFAULT (datetime('now')),
        FOREIGN KEY (tenant_id) REFERENCES tenants(id) ON DELETE RESTRICT,
        UNIQUE(tenant_id, id),
        UNIQUE(tenant_id, name)
      );

      CREATE TABLE competency_evidence (
        id TEXT PRIMARY KEY,
        tenant_id TEXT NOT NULL,
        competency_id TEXT NOT NULL,
        source_type TEXT NOT NULL CHECK(source_type IN ('job_posting_snapshot', 'story_bank', 'tailored_cv_candidate', 'reviewer_finding', 'dossier_revision', 'stage_event', 'submitted_artifact', 'manual')),
        source_id TEXT NOT NULL CHECK(length(trim(source_id)) > 0 AND length(source_id) <= 128),
        source_version TEXT NOT NULL DEFAULT '' CHECK(length(source_version) <= 128),
        source_revision TEXT NOT NULL DEFAULT '' CHECK(length(source_revision) <= 128),
        extraction_method TEXT NOT NULL CHECK(extraction_method IN ('manual', 'deterministic')),
        confidence REAL NOT NULL CHECK(confidence >= 0 AND confidence <= 1),
        evidence_excerpt TEXT NOT NULL CHECK(length(trim(evidence_excerpt)) > 0 AND length(evidence_excerpt) <= 2000),
        evidence_hash TEXT NOT NULL CHECK(length(evidence_hash) = 64 AND evidence_hash NOT GLOB '*[^0-9a-f]*'),
        observation_stage TEXT CHECK(observation_stage IS NULL OR observation_stage IN ('applied', 'recruiter_screen', 'assessment', 'hiring_manager_screen', 'technical_interview', 'onsite', 'offer', 'closed')),
        observation_outcome TEXT CHECK(observation_outcome IS NULL OR observation_outcome IN ('offer_accepted', 'offer_declined', 'rejected', 'withdrawn', 'no_response', 'ghosted')),
        created_at TEXT NOT NULL DEFAULT (datetime('now')),
        CHECK((observation_stage IS NULL) = (observation_outcome IS NULL)),
        CHECK(source_type <> 'stage_event' OR (observation_stage IS NOT NULL AND observation_outcome IS NOT NULL)),
        FOREIGN KEY (tenant_id) REFERENCES tenants(id) ON DELETE RESTRICT,
        FOREIGN KEY (tenant_id, competency_id) REFERENCES competencies(tenant_id, id) ON DELETE RESTRICT,
        UNIQUE(tenant_id, id),
        UNIQUE(tenant_id, competency_id, source_type, source_id, source_version, source_revision, evidence_hash)
      );
      CREATE INDEX idx_competency_evidence_tenant_competency
        ON competency_evidence(tenant_id, competency_id, created_at);
      CREATE TRIGGER competency_evidence_no_update
        BEFORE UPDATE ON competency_evidence BEGIN SELECT RAISE(ABORT, 'competency_evidence is append-only'); END;
      CREATE TRIGGER competency_evidence_no_delete
        BEFORE DELETE ON competency_evidence BEGIN SELECT RAISE(ABORT, 'competency_evidence is append-only'); END;
    `,
  },
];

function checksum(sql: string): string {
  return createHash("sha256").update(sql).digest("hex");
}

export function runVersionedMigrations(
  database: Database.Database,
  migrations: readonly VersionedMigration[] = VERSIONED_MIGRATIONS,
): void {
  const versions = new Set<number>();
  let previousVersion = 0;
  for (const migration of migrations) {
    if (!Number.isSafeInteger(migration.version) || migration.version <= 0) {
      throw new Error(`Invalid migration version: ${migration.version}`);
    }
    if (versions.has(migration.version)) {
      throw new Error(`Duplicate migration version: ${migration.version}`);
    }
    if (migration.version <= previousVersion) {
      throw new Error("Migration versions must be strictly increasing");
    }
    versions.add(migration.version);
    previousVersion = migration.version;
  }

  database.exec(`CREATE TABLE IF NOT EXISTS schema_migrations (
    version INTEGER PRIMARY KEY,
    checksum TEXT NOT NULL,
    applied_at TEXT NOT NULL DEFAULT (datetime('now'))
  )`);

  const appliedMigration = database.prepare(
    "SELECT checksum FROM schema_migrations WHERE version = ?",
  );
  const recordMigration = database.prepare(
    "INSERT INTO schema_migrations(version, checksum) VALUES (?, ?)",
  );
  const appliedMigrations = database
    .prepare("SELECT version, checksum FROM schema_migrations ORDER BY version")
    .all() as Array<{ version: number; checksum: string }>;
  for (const applied of appliedMigrations) {
    const migration = migrations.find(
      (candidate) => candidate.version === applied.version,
    );
    if (!migration) {
      throw new Error(
        `Missing migration history for version ${applied.version}`,
      );
    }
    if (applied.checksum !== checksum(migration.sql)) {
      throw new Error(
        `Checksum drift for migration version ${applied.version}`,
      );
    }
  }

  for (const migration of migrations) {
    const migrationChecksum = checksum(migration.sql);
    const applied = appliedMigration.get(migration.version) as
      | { checksum: string }
      | undefined;
    if (applied) {
      if (applied.checksum !== migrationChecksum) {
        throw new Error(
          `Checksum drift for migration version ${migration.version}`,
        );
      }
      continue;
    }

    database.transaction(() => {
      database.exec(migration.sql);
      recordMigration.run(migration.version, migrationChecksum);
    })();
  }
}
