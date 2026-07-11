# OpenJobs Unified Platform: Full Implementation Plan

## Scope and baseline

This plan implements the approved unified-platform direction in bounded, test-driven waves. The implementation baseline is commit `6913a5a` (`chore: snapshot current OpenJobs implementation baseline`); it is a clean worktree snapshot, not a new product architecture. Wave 0 must make that snapshot green before any feature work lands.

The implementation remains a single OpenJobs application backed by the existing SQLite/Drizzle schema and tenant context. It extends existing `jobs`, `stageEvents`, `interviewStories`, `designResumeDocuments`, `jobDocuments`, and settings rather than creating competing application, profile, resume, or CSV/JSON stores. Every new persisted record, filesystem path, queue claim, cache key, API query, and artifact is tenant-scoped.

Explicitly out of scope for this implementation:

- PostgreSQL, MinIO/object storage, Temporal, microservices, or a Claude runtime.
- CSV or JSON files as an operational source of truth.
- Automatic application submission; Deep Application stops at explicit human approval and recorded submission.
- Replacing the current resume renderer or duplicating Design Resume documents.

The only future-facing work is a documented seam: the durable queue has a storage/worker interface that a later PostgreSQL/pg-boss adapter can implement, and the artifact service has a storage interface that a later object-store adapter can implement. Neither migration is performed here.

## Current architecture inventory and decisions

| Concern | Existing source of truth / seam | Plan decision |
| --- | --- | --- |
| Job and application lifecycle | `orchestrator/src/server/db/schema.ts` (`jobs`, `stageEvents`, `tasks`, `interviews`), `services/applicationTracking.ts` | Preserve `jobs` as the application record and stage events as history; add normalized views/provenance tables only where existing fields cannot represent immutable facts. |
| CareerOps coverage | `orchestrator/src/shared/career-ops/feature-registry.ts`, `api/routes/career-ops.ts` | Move the four listed features from `partial` to `implemented` only after their contracts and UI are complete. |
| Profile and resume | `services/profile.ts`, `repositories/design-resume.ts`, `api/routes/profile.ts`, onboarding UI | Keep Design Resume/RxResume as resume sources; add a tenant career-profile contract that references, rather than copies, the chosen resume. |
| Stories | `interviewStories`, `repositories/interview-stories.ts`, `StoryBankPage.tsx` | Evolve the existing Story Bank. Normalize tags and usage/provenance; do not add a second proof-point store. |
| PDF files | `services/pdf-storage.ts`, `services/job-pdf-upload.ts`, renderer services | Keep tenant filesystem storage now; write immutable versioned paths for submitted artifacts rather than overwriting `resume_<jobId>.pdf`. |
| Background work | `infra/job-queue*.ts`, `services/auto-pdf-regeneration.ts` | Replace the production registry default with a SQLite durable queue. The in-memory adapter remains test-only. |
| Connector model | extractors registry and post-application providers | Define an internal, normalized connector contract and persisted sync/ingest records; connector implementations may adapt external APIs but do not depend on Claude or file imports. |

## Shared integration rules

1. All API endpoints use the existing `{ ok, data/error, meta.requestId }` contract, `asyncRoute`/`fail` helpers, Zod validation, sanitized error details, and `x-request-id` propagation.
2. Routes, services, workers, and outbox dispatch propagate `requestId`, `tenantId`, `jobId`, and `pipelineRunId` when available through `runWithRequestContext`; core paths use `infra/logger.ts` only.
3. New tables include `tenant_id`, foreign keys, tenant-aware indexes, and repository queries that filter by `getActiveTenantId()`. Files are under a tenant directory. Tests prove tenant A cannot read, mutate, claim, or receive tenant B data.
4. Schema declarations and `db/migrate.ts` are a serial integration boundary. Each serial migration must be backward-safe for the supported SQLite database and gain a migration test.
5. `shared/src/types/*`, `orchestrator/src/shared/career-ops/feature-registry.ts`, `orchestrator/src/server/api/routes.ts`, docs navigation, and any central client API barrel are shared integration boundaries. Define contracts first, then merge independent worktrees against that contract.

## Dependency and parallelization map

```text
Wave 0 baseline
  └─ Wave 1 shared contracts (serial)
       ├─ 1A tracker parity ──────────────┐
       ├─ 1B CV proof/template ───────────┤
       ├─ 1C Story Bank reuse ────────────┤ → Wave 1 integration (serial)
       └─ 1D profile onboarding ──────────┘
            ├─ Wave 2 Deep Application
            ├─ Wave 3 learning/connectors
            └─ Wave 4 durable queue
                 └─ Wave 5 health, docs, hardening, final verification
```

Wave 1A–1D can use separate Codex worktrees after the shared contract/migration checkpoint. Waves 2, 3, and 4 can then proceed in parallel if each gets its own worktree and avoids shared registries, route mounting, `schema.ts`, `migrate.ts`, and docs navigation until serial integration. Each wave is a small sequence of independently shippable TDD tasks; no task should silently absorb another wave.

## Wave 0 — validate and finish the snapshot baseline (serial)

### 0.1 Reproduce the snapshot quality state

**Files inspected / likely touched only if a snapshot defect is found:**

- Existing snapshot changes named by `git show --stat 6913a5a` (especially `services/pattern-analysis.ts`, `api/routes/pipeline.ts`, `pipeline/orchestrator.ts`, `services/challenge-viewer.ts`, and their tests).
- Likely new only if needed: narrowly scoped `*.test.ts`/`*.test.tsx` adjacent to the defective snapshot source.

**TDD steps:**

1. Record Node version and clean status; run the snapshot’s focused tests first: browser launch, pattern analysis, pipeline route/cancellation, challenge viewer, model selection, settings, and the updated UI tests.
2. If a test or type/build check fails, first write/adjust the smallest regression test that describes the snapshot expectation, make the smallest correction, and rerun the focused test.
3. Run the full CI-parity command list below. If `better-sqlite3` reports a Node ABI mismatch, run the documented rebuild once and rerun the failed test; do not mask or skip failures.

**Acceptance criteria:**

- `HEAD` is reproducibly green on Node 22 (or the exact local deviation is diagnosed and Node 22 is green).
- Snapshot changes retain their intended behavior: pattern-analysis CV intelligence, pipeline cancellation/challenge behavior, browser launch fallback, settings/model selection, and touched UI paths.
- No production feature work is combined with baseline repair.

## Wave 1 — complete the four partial CareerOps capabilities

### 1.0 Define shared contracts and migration ownership (serial)

**Existing files:**

- `shared/src/types/jobs.ts`, `shared/src/types/index.ts`
- `orchestrator/src/server/db/schema.ts`, `orchestrator/src/server/db/migrate.ts`, `orchestrator/src/server/db/migrate.test.ts`
- `orchestrator/src/shared/career-ops/feature-registry.ts` and its test
- `orchestrator/src/client/api/career-ops.ts`

**Likely new files:**

- `shared/src/types/career-profile.ts`
- `shared/src/types/deep-application.ts` (contract only; implementation in Wave 2)
- `shared/src/types/workflow.ts` (queue/outbox contract only; implementation in Wave 4)
- focused shared contract tests adjacent to each new type module.

**Tasks and acceptance criteria:**

- Specify canonical IDs, state enums, provenance fields, immutable-versus-mutable boundaries, and request/response payloads before parallel work begins. Contracts must reference `jobId`, Design Resume document/revision, Story Bank IDs, and tenant context rather than copying their data.
- Reserve schema table/column names and index names in the plan/contract. A single integrator owns the actual `schema.ts` plus `migrate.ts` edits; feature worktrees submit repository/service/UI changes against the agreed interfaces.
- Extend feature-registry tests so a feature cannot be marked `implemented` without an API/UI contract test.

### 1A Pipeline tracker parity (parallel after 1.0)

**Existing files:**

- `shared/src/types/jobs.ts`
- `orchestrator/src/server/services/applicationTracking.ts`
- `orchestrator/src/server/api/routes/jobs.ts`, `orchestrator/src/server/api/routes/pipeline.ts`
- `orchestrator/src/client/pages/InProgressBoardPage.tsx`, `TrackingInboxPage.tsx`, `OrchestratorPage.tsx`
- `orchestrator/src/client/components/LogEventModal.tsx`

**Likely new files:**

- `orchestrator/src/server/services/pipeline-tracker.ts` and `.test.ts`
- `orchestrator/src/client/pages/PipelineTrackerPage.tsx` and `.test.tsx`
- `orchestrator/src/client/pages/pipeline-tracker/*` (columns, filters, report view) and focused tests.

**TDD tasks:**

1. Add failing service/API tests for a tenant-scoped tracker projection built from existing jobs, stage events, tasks, notes, PDF freshness, and reports—not a new tracker table.
2. Implement the projection and filter/sort contract with explicit columns for application stage, next task/follow-up, last activity, report/evaluation availability, PDF state, and submission/artifact state once Wave 2 exists.
3. Add the tracker page and a link from the existing navigation; test empty, mixed-stage, overdue, and cross-tenant cases.

**Acceptance criteria:**

- Each displayed tracker column has a documented source mapping and respects the existing stage-history ordering.
- Stage updates and follow-up tasks immediately affect tracker projections without duplicate application state.
- Tenant A cannot obtain tenant B tracker rows by ID, filter, or report reference.

### 1B Tailored CV proof-point/template contract (parallel after 1.0)

**Existing files:**

- `orchestrator/src/server/services/design-resume/*`
- `orchestrator/src/server/repositories/design-resume.ts`
- `orchestrator/src/server/services/pdf-tailoring.ts`, `services/pdf.ts`
- `orchestrator/src/client/components/design-resume/*`, `client/components/tailoring/*`
- `shared/src/design-resume-jake.ts`, `shared/src/prompt-template-definitions.ts`

**Likely new files:**

- `orchestrator/src/server/services/cv-proof-points.ts` and `.test.ts`
- `orchestrator/src/server/services/cv-template-contract.ts` and `.test.ts`
- `orchestrator/src/client/components/tailoring/ProofPointPicker.tsx` and `.test.tsx`
- `orchestrator/src/client/components/design-resume/TemplateContractPanel.tsx` and `.test.tsx`.

**TDD tasks:**

1. Define failing contract tests for selecting reusable Story Bank proof points, required evidence/provenance, and template variables derived from the selected Design Resume revision and job snapshot.
2. Implement a service that produces a typed tailoring input/output contract; it must reject nonexistent/foreign-tenant story or resume IDs and preserve the original source IDs/revisions.
3. Add a UI that makes template selection and proof-point inclusion explicit, previewable, and editable before any PDF generation.

**Acceptance criteria:**

- A tailored CV records the selected proof-point IDs and Design Resume template/revision; it never duplicates a full base resume or uses an untracked free-form template as source of truth.
- A deleted or changed mutable Story Bank entry cannot rewrite a previously approved/submitted artifact (Wave 2 freezes rendered evidence).
- Template validation returns contract-compliant 400/422 errors with sanitized details and has renderer-level tests for missing variables.

### 1C Story Bank reuse, tags, and analytics (parallel after 1.0)

**Existing files:**

- `interview_stories` in `db/schema.ts`
- `repositories/interview-stories.ts`, `api/routes/interview-stories-router.ts`
- `client/pages/StoryBankPage.tsx`
- `services/interview-prep.ts`, `api/routes/interview-prep.ts`

**Likely new files:**

- `orchestrator/src/server/repositories/story-tags.ts`
- `orchestrator/src/server/repositories/story-usage.ts`
- `orchestrator/src/server/services/story-bank.ts` and `.test.ts`
- `orchestrator/src/server/api/routes/story-bank.ts` and `.test.ts`
- `orchestrator/src/client/pages/story-bank/StoryAnalyticsPanel.tsx` and `.test.tsx`
- `orchestrator/src/client/pages/story-bank/StoryTagEditor.tsx` and `.test.tsx`.

**TDD tasks:**

1. Add schema/repository tests for normalized story tags and immutable usage events (story ID, consumer type, job/interview-prep context, timestamp, and snapshot/version reference).
2. Extend story create/update/search APIs with normalized tag filtering, suggested tags/skills based on existing stories and job requirements, and aggregate analytics; retain the current STAR+R record as the canonical story.
3. Add Story Bank filtering, tag management, usage history, and reuse analytics UI; wire interview preparation to create a usage event when a story is selected/generated.

**Acceptance criteria:**

- Tag filtering and analytics are deterministic, tenant-scoped, and do not expose the contents or tag vocabulary of another tenant.
- Usage analytics distinguish selection/reuse from mere creation and preserve enough provenance to answer where a story was used.
- Existing story CRUD and interview-prep flows remain compatible.

### 1D Career profile onboarding contract (parallel after 1.0)

**Existing files:**

- `api/routes/onboarding.ts`, `api/routes/profile.ts`
- `client/pages/OnboardingPage.tsx`, `client/pages/onboarding/*`
- `client/lib/onboarding.ts`, `hooks/useOnboardingRequirement.ts`
- `services/profile.ts`, `repositories/settings.ts`, `shared/src/settings-schema.ts`

**Likely new files:**

- `orchestrator/src/server/repositories/career-profile.ts`
- `orchestrator/src/server/services/career-profile.ts` and `.test.ts`
- `orchestrator/src/server/api/routes/career-profile.ts` and `.test.ts`
- `orchestrator/src/client/pages/onboarding/components/CareerProfileStep.tsx` and `.test.tsx`
- `orchestrator/src/client/pages/CareerProfilePage.tsx` and `.test.tsx`.

**TDD tasks:**

1. Define Zod schema and failing API tests for target roles, location/remote preferences, salary range/currency, deal-breakers, career narrative, proof-point references, and selected resume document/revision.
2. Persist a single tenant-scoped career profile, with redacted logs and strict access checks; migrate existing onboarding values where equivalents already exist rather than duplicating them.
3. Integrate the contract as a resumable onboarding step and editable profile page; onboarding completeness must report specific missing requirements without exposing secrets.

**Acceptance criteria:**

- A complete profile is sufficient for downstream tailoring/Deep Application context without requiring CSV/YAML input.
- Resume/profile caching is tenant-keyed or eliminated; changing tenant/profile cannot leak one profile into another prompt or response.
- The coverage registry marks all four Wave 1 features `implemented` only after their tests and routes/pages are wired.

### Wave 1 checkpoint (serial integration)

- Integrate migrations once, update shared types/routes/navigation/feature registry once, and resolve conflicts before starting dependent waves.
- Run focused tests for each sub-wave plus `npm --workspace orchestrator run check:types` and `npm --workspace orchestrator run build:client`.
- Manually verify one tenant’s onboarding → Story Bank → tailored CV → tracker flow and a second tenant’s isolation in the API test harness.

## Wave 2 — Deep Application mode (depends on Wave 1 integration)

### 2.1 Model the application dossier, snapshots, approvals, and submitted artifacts (serial migration)

**Existing files:**

- `db/schema.ts`, `db/migrate.ts`, `repositories/jobs.ts`
- `services/applicationTracking.ts`, `services/job-pdf-upload.ts`, `services/pdf-storage.ts`, `services/pdf-fingerprint.ts`
- `api/routes/jobs.ts`, `api/routes/design-resume.ts`

**Likely new files:**

- `orchestrator/src/server/repositories/application-dossiers.ts`
- `orchestrator/src/server/repositories/application-artifacts.ts`
- `orchestrator/src/server/services/job-posting-snapshot.ts` and `.test.ts`
- `orchestrator/src/server/services/application-artifacts.ts` and `.test.ts`
- `orchestrator/src/server/services/deep-application.ts` and `.test.ts`
- `orchestrator/src/server/api/routes/deep-application.ts` and `.test.ts`
- `orchestrator/src/server/services/pdf-qa.ts` and `.test.ts`
- `orchestrator/src/server/services/artifact-storage.ts` (filesystem implementation plus future object-storage interface).

**Data design:**

- `application_dossiers`: one mutable working dossier per tenant/job, with state and current draft revision; unique `(tenant_id, job_id)`.
- `application_draft_revisions`: append-only drafter/reviewer outputs with input provenance (career profile revision, Design Resume ID/revision, proof-point/story IDs and captured excerpts, job posting snapshot ID, model/provider metadata, request ID). The human can edit a draft, but every submitted state points to a frozen revision.
- `job_posting_snapshots`: append-only, tenant/job-scoped normalized posting capture (source URL, retrieval time, content hash, selected whitelisted fields, sanitized rendered text); no raw unbounded upstream dump.
- `application_approvals`: append-only approval/rejection events. A submission requires a human actor and exact draft revision/artifact IDs; machine drafter/reviewer identities cannot submit.
- `submitted_artifacts`: immutable file metadata/hash/path/version and QA report. A submitted artifact uses a unique versioned tenant path such as `pdfs/<tenant>/submitted/<job>/<artifact>.pdf`; current working PDFs may remain replaceable.

**TDD tasks:**

1. Add failing repository/migration tests for state transitions `drafting → reviewer_pending → human_review → approved → submitted` (and recoverable rejected/revision states), immutable revision/artifact rows, and tenant isolation.
2. Implement job-posting snapshot capture at Deep Application start/review, using minimal whitelisted data and a deterministic hash. Reuse current `jobs` fields as the live view; snapshots preserve historical evidence.
3. Implement drafter and reviewer services behind the existing LLM service abstraction, with bounded prompt contexts from Wave 1 contracts and clear reviewer findings. Neither service can mark an application submitted.
4. Implement artifact storage/write-once semantics and hashes. Prevent update/delete/overwrite routes for submitted artifacts; permit creation of a new revision/artifact only.
5. Implement PDF visual QA (render pages to images and detect renderer/readability failures) and ATS text-layer QA (extract text, assert non-empty/selectable text, compare required target terms/sections with explicit warnings). QA produces a versioned report and blocks approval only for hard failures; warnings require human acknowledgement.

**Acceptance criteria:**

- Human approval is an explicit authenticated action tied to one reviewer-approved draft revision and one QA-passing artifact; no route or worker can bypass it.
- Submitted artifact bytes, SHA-256, file path, generated timestamp, source job snapshot hash, profile/template revision, and approval actor/timestamp are immutable and retrievable only in the owning tenant.
- A changed job posting, profile, story, template, or working PDF creates a new draft/artifact candidate; it does not alter what was submitted.
- PDF QA has fixtures for valid text PDFs, image-only/missing text layer, renderer failure, and visual overflow/blank-page detection; reports are sanitized and bounded.

### 2.2 Build the human application workspace (parallel with 2.1 service implementation after contracts settle)

**Existing files:**

- `client/pages/JobPage.tsx`, `client/pages/job-page/*`
- `client/components/tailoring/*`, `components/design-resume/DesignResumePdfPreview.tsx`
- `client/api/career-ops.ts`, `client/lib/private-pdf.ts`

**Likely new files:**

- `orchestrator/src/client/pages/DeepApplicationPage.tsx` and `.test.tsx`
- `orchestrator/src/client/pages/deep-application/DossierTimeline.tsx` and `.test.tsx`
- `orchestrator/src/client/pages/deep-application/ReviewerFindings.tsx` and `.test.tsx`
- `orchestrator/src/client/pages/deep-application/ArtifactQaPanel.tsx` and `.test.tsx`
- `orchestrator/src/client/api/deep-application.ts` and `.test.ts`.

**Acceptance criteria:**

- The workspace clearly labels mutable drafts versus immutable submitted artifacts, displays posting/profile/proof-point provenance, and requires a human confirmation before recording submission.
- Review findings, QA failures/warnings, and stale-source changes are actionable and accessible; the user can neither accidentally overwrite a submitted artifact nor mistake a working PDF for the submitted copy.
- Component tests cover draft/reviewer/human states and a browser verification covers approval and artifact retrieval.

## Wave 3 — outcome learning, competency provenance, and normalized connectors (depends on Waves 1–2 contracts)

### 3.1 Outcome learning and competency provenance

**Existing files:**

- `services/pattern-analysis.ts`, `api/routes/pattern-analysis.ts`
- `services/applicationTracking.ts`, `repositories/jobs.ts`
- `shared/src/types/jobs.ts`, `client/pages/PatternAnalysisPage.tsx`

**Likely new files:**

- `orchestrator/src/server/repositories/competencies.ts`
- `orchestrator/src/server/repositories/competency-evidence.ts`
- `orchestrator/src/server/services/outcome-learning.ts` and `.test.ts`
- `orchestrator/src/server/services/competency-provenance.ts` and `.test.ts`
- `orchestrator/src/server/api/routes/outcome-learning.ts` and `.test.ts`
- `orchestrator/src/client/pages/OutcomeLearningPage.tsx` and `.test.tsx`.

**TDD tasks:**

1. Add normalized competencies and immutable evidence links to the existing sources: job snapshots, Story Bank proof points, tailored CV revisions, reviewer findings, stage/outcome events, and submitted artifacts. Store source type/ID/version, extraction method, confidence, and timestamps; do not store an untraceable derived keyword alone.
2. Build learning aggregates from normalized, tenant-scoped records: stage/outcome conversion by competency, target role/source, resume template, and story usage. Mark low-sample observations as insufficient rather than implying causation.
3. Extend current pattern analysis with explainable links to evidence and user-facing recommendations; preserve the existing report contract while adding versioned fields additively.

**Acceptance criteria:**

- Every competency recommendation shows its originating records and versioned evidence; changing a source creates new evidence rather than rewriting history.
- Learning reports are descriptive, sample-aware, tenant-scoped, and never treat LLM output as ground truth without provenance.
- Existing pattern analysis tests and consumers remain backward compatible.

### 3.2 Normalized connector contract (parallel after 3.1 contract)

**Existing files:**

- `orchestrator/src/server/extractors/registry.ts`, `discovery.ts`
- `orchestrator/src/server/repositories/post-application-*.ts`
- `orchestrator/src/server/services/post-application/*`
- `shared/src/types/extractors.ts`, `shared/src/types/post-application.ts`

**Likely new files:**

- `shared/src/types/connectors.ts`
- `orchestrator/src/server/connectors/types.ts`
- `orchestrator/src/server/connectors/registry.ts` and `.test.ts`
- `orchestrator/src/server/connectors/normalizers.ts` and `.test.ts`
- `orchestrator/src/server/repositories/connector-sync-runs.ts`
- `orchestrator/src/server/api/routes/connectors.ts` and `.test.ts`
- adapter tests alongside existing extractor/post-application providers.

**Design:**

- Borrow only the useful shape of ai-job-search: a normalized internal job/application/event/credential-capability boundary. Do not import its runtime, use Claude, shell out to it, or adopt its files as data stores.
- Connector adapters return typed normalized records and cursor/checkpoint metadata. Raw provider payloads are minimized, sanitized, and either discarded or stored only as bounded provenance allowed by the schema; canonical jobs/stage events remain the source of truth.
- Connector credentials remain in the existing protected integration/settings pathways and are never logged or returned. Sync runs and idempotency keys are persisted and tenant-scoped.

**Acceptance criteria:**

- A connector can be registered and health-checked through one typed interface, with declared capabilities, validation, pagination/cursor behavior, error classification, and idempotency key semantics.
- Existing extractors and post-application providers gain adapters incrementally with no behavior regression; a fixture-backed adapter test proves normalizing duplicate input yields a single canonical record/event.
- No CSV/JSON import is a canonical store and no Claude-specific provider/runtime/dependency is introduced.

## Wave 4 — durable workflow queue (parallel after Wave 1; serial migration integration)

### 4.1 Replace the production in-memory queue with SQLite persistence

**Existing files:**

- `infra/job-queue.ts`, `job-queue-memory.ts`, `job-queue-registry.ts` and tests
- `services/auto-pdf-regeneration.ts` and tests
- `db/schema.ts`, `db/migrate.ts`, `db/migrate.test.ts`
- `infra/logger.ts`, `infra/request-context.ts`

**Likely new files:**

- `orchestrator/src/server/infra/job-queue-sqlite.ts` and `.test.ts`
- `orchestrator/src/server/infra/job-queue-worker.ts` and `.test.ts`
- `orchestrator/src/server/repositories/workflow-tasks.ts`
- `orchestrator/src/server/repositories/workflow-outbox.ts`
- `orchestrator/src/server/services/workflow-dispatcher.ts` and `.test.ts`
- `orchestrator/src/server/infra/workflow-errors.ts` and `.test.ts`
- `docs-site/docs/reference/durable-workflows.md` (final content in Wave 5).

**Data/behavior contract:**

- Persist `workflow_tasks`, `workflow_task_attempts`, `workflow_dead_letters`, and `workflow_outbox` in SQLite with tenant ID, queue/type, versioned JSON payload, idempotency/dedupe key, state, priority, available/lease/heartbeat timestamps, attempt count/max attempts, request context, sanitized last-error summary, and audit timestamps. Add unique/index constraints for active idempotency keys and ready-task claims.
- `enqueue` is atomic with its domain transaction through the outbox where a domain change emits work. The dispatcher writes/claims tasks from the outbox; retries do not create duplicate effects.
- Claims use an atomic SQLite transaction with a lease. Startup and periodic recovery requeue expired leases. Retry uses bounded exponential backoff plus jitter and only retryable error classes. Terminal failures move an immutable attempt summary to DLQ; operators can inspect/requeue with a new auditable attempt, never edit history.
- The `JobQueue` contract evolves to explicit `claim`, `complete`, and `fail`/retry outcomes while preserving a thin compatibility adapter until the auto-PDF caller is migrated. In-memory is test-only and cannot be selected in production startup.
- Define a storage/worker adapter interface with capability requirements that a later pg-boss/Postgres implementation can satisfy. Document it; do not add a PostgreSQL package, connection, migration, or runtime switch.

**TDD tasks:**

1. Write failing queue contract tests shared by memory and SQLite adapters: tenant-scoped idempotency, delayed availability, priority/order, atomic exclusive claims, acknowledgement, lease expiry recovery, retry schedule, terminal DLQ, and context propagation.
2. Add migration tests that upgrade an existing database without data loss and verify indexes/uniqueness.
3. Implement SQLite adapter, registry startup default, worker lifecycle, structured metrics/log events, then migrate auto-PDF regeneration as the first production consumer.
4. Add outbox tests that simulate a process failure between domain write and dispatch, duplicate dispatch, and retry after restart.

**Acceptance criteria:**

- Restarting OpenJobs does not lose accepted auto-PDF work; a task is processed at least once but its idempotency contract prevents duplicate business effects.
- A worker cannot claim a task from another tenant or process one task concurrently twice while the lease is valid.
- Retry/backoff/DLQ decisions are observable without leaking payload PII; dead-letter replay requires an explicit operator action and produces an audit event.
- No active production code instantiates `InMemoryJobQueue`; tests can still inject it deliberately.

## Wave 5 — runtime capability health, documentation, security/privacy, tenant tests, and release verification

### 5.1 Runtime capability health

**Existing files:**

- `services/extractor-health.ts`, `api/routes/extractor-health.ts`
- `extractors/registry.ts`, `infra/logger.ts`
- `client/pages/SettingsPage.tsx`, `client/pages/HomePage.tsx`

**Likely new files:**

- `orchestrator/src/server/services/runtime-capabilities.ts` and `.test.ts`
- `orchestrator/src/server/api/routes/runtime-capabilities.ts` and `.test.ts`
- `orchestrator/src/client/components/RuntimeCapabilityHealth.tsx` and `.test.tsx`.

**Acceptance criteria:**

- One read-only tenant-safe health response reports availability/version/configuration (not secret values) for renderer/PDF QA dependencies, durable queue worker, configured LLM capability, connectors, and extractors.
- It distinguishes unavailable, misconfigured, degraded, and healthy states; failures follow API contract/status mappings and contain request IDs.
- Health checks are bounded, cache only global non-sensitive facts or tenant-keyed results, and never run destructive work.

### 5.2 Documentation and security/privacy completion (serial)

**Existing files:**

- `docs-site/docs/features/careerops.md`, `features/orchestrator.md`, `features/design-resume.md`, `features/post-application-tracking.md`
- `docs-site/docs/workflows/find-jobs-and-apply-workflow.md`, `docs-site/sidebars.ts`
- `AGENTS.md`, `infra/sanitize.ts`, `infra/logger.ts`, `infra/http.ts`

**Likely new files:**

- `docs-site/docs/features/deep-application.md`
- `docs-site/docs/features/outcome-learning.md`
- `docs-site/docs/reference/durable-workflows.md`
- `docs-site/docs/reference/runtime-capability-health.md`
- `docs-site/docs/reference/data-provenance-and-retention.md`
- `docs-site/docs/decisions/` ADRs only if that directory is adopted by the documentation owner.

**Tasks and acceptance criteria:**

- Update user-facing docs with required frontmatter and the What/Why/How/Common problems/Related pages structure. State human-approval limits, immutable artifact behavior, stored provenance, retention/deletion behavior, queue retry/DLQ behavior, and SQLite-now/future-Postgres or object-store seams.
- Run a security review of every new route and external/LLM payload: Zod validation/limits, authorization and tenant filters, SSRF-safe snapshot/connector URLs, upload/PDF limits, path traversal prevention, sanitization/redaction, least-PII prompts, and safe error details.
- Add cross-tenant regression suites for profile, story tags/usage, tracker, dossier/approval/artifact, competency evidence, connectors, queue/outbox, and file retrieval. Add negative authorization tests and logging-redaction tests.

### 5.3 Final verification and release gate (serial)

Run from repository root, with no ignored failures:

```bash
./orchestrator/node_modules/.bin/biome ci .
npm run check:types:shared
npm --workspace orchestrator run check:types
npm --workspace gradcracker-extractor run check:types
npm --workspace ukvisajobs-extractor run check:types
npm --workspace orchestrator run build:client
npm --workspace orchestrator run test:run
```

Before the full suite, run the focused tests named in each wave, including:

```bash
npm --workspace orchestrator run test:run -- src/server/infra/job-queue-memory.test.ts src/server/infra/job-queue-registry.test.ts src/server/services/auto-pdf-regeneration.test.ts
npm --workspace orchestrator run test:run -- src/server/api/routes/career-ops.test.ts src/server/api/routes/pipeline.test.ts src/server/api/routes/onboarding.test.ts src/server/api/routes/tenant-isolation.test.ts
npm --workspace orchestrator run test:run -- src/server/services/pattern-analysis.test.ts src/server/services/pdf-fingerprint.test.ts src/server/services/resume-renderer/document.test.ts
```

Add and run the new focused test files as each wave creates them. If native SQLite tests report an ABI mismatch, run:

```bash
npm --workspace orchestrator rebuild better-sqlite3
```

Finally use Chrome DevTools against a locally running production-like build to verify: tenant-separated sign-in/session, onboarding completion, Story Bank tag/reuse flow, tracker columns, draft→reviewer→human approval, immutable artifact download, PDF preview/text QA state, outcome evidence drill-down, queue health/retry/DLQ visibility, and absence of console/network errors. Capture the exact browser checks and outcomes in the implementation PR, not by adding browser-test tooling unless a separate decision approves it.

## Risks and mitigations

| Risk | Mitigation |
| --- | --- |
| Parallel work collides in `schema.ts`, `migrate.ts`, shared types, routes, registry, or docs | Contract/migration owner integrates those files serially; feature worktrees use adapters and tests until integration. |
| SQLite concurrency makes task claiming unreliable | Use short transactional atomic claims, leases, indexes, recovery tests, and a single-process worker configuration now; retain a pg-boss-compatible interface for later. |
| LLM output invents or leaks candidate data | Minimize whitelisted inputs, record provenance, require reviewer plus human approval, sanitize logging, and never treat generated claims as verified evidence. |
| Submitted PDFs are accidentally overwritten | Separate immutable artifact paths/metadata from working `pdfPath`; block mutation APIs and test file/hash immutability. |
| Analytics imply causation from small data | Require sample thresholds, label results descriptive/insufficient, and expose evidence links. |
| Profile/story/artifact leakage across tenants | Tenant filters, composite indexes, tenant-keyed filesystem paths/queue keys, and explicit two-tenant regression tests in every affected wave. |

## Definition of done

The work is complete only when Wave 0 is green; all four CareerOps features are truthfully marked implemented; Deep Application has enforced human approval and immutable, QA-checked submitted artifacts; learning and connectors are provenance-backed and database-native; the active production queue is durable with retries/DLQ/outbox; runtime health, documentation, privacy/security review, tenant tests, full CI, and browser verification all pass. PostgreSQL, MinIO, Temporal, microservices, Claude runtime, and file-based sources of truth remain absent.
