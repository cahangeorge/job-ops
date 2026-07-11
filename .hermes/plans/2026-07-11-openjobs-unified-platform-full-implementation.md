# OpenJobs Unified Platform: Full Implementation Plan

## Scope and baseline

This plan implements the approved unified-platform direction in bounded, test-driven waves. The implementation baseline is commit `6913a5a` (`chore: snapshot current OpenJobs implementation baseline`); it is a clean worktree snapshot, not a new product architecture. Wave 0 must make that snapshot green before any feature work lands.

The implementation remains a single OpenJobs application backed by the existing SQLite/Drizzle schema and tenant context. It extends existing `jobs`, `stageEvents`, `interviewStories`, `designResumeDocuments`, `jobDocuments`, and settings rather than creating competing application, profile, resume, or CSV/JSON stores. Every new persisted record, filesystem path, queue claim, cache key, API query, and artifact is tenant-scoped.

Explicitly out of scope for this implementation:

- PostgreSQL, MinIO/object storage, Temporal, microservices, or a Claude runtime.
- CSV or JSON files as an operational source of truth.
- Automatic application submission; Deep Application stops at explicit human approval and recorded submission.
- Replacing the current resume renderer or duplicating Design Resume documents.

No speculative PostgreSQL/pg-boss or object-store interfaces are introduced. The plan uses the existing SQLite and tenant filesystem implementations. Any future replacement is limited to the already documented deployment seam and requires a separate decision, contract, and migration plan.

## Current architecture inventory and decisions

| Concern | Existing source of truth / seam | Plan decision |
| --- | --- | --- |
| Job and application lifecycle | `orchestrator/src/server/db/schema.ts` (`jobs`, `stageEvents`, `tasks`, `interviews`), `services/applicationTracking.ts` | Preserve `jobs` as the application record and stage events as history; add normalized views/provenance tables only where existing fields cannot represent immutable facts. |
| CareerOps coverage | `orchestrator/src/shared/career-ops/feature-registry.ts`, `api/routes/career-ops.ts` | Move the four listed features from `partial` to `implemented` only after the Deep Application foundation, their contracts, and their UI are complete. |
| Profile and resume | `services/profile.ts`, `repositories/design-resume.ts`, `api/routes/profile.ts`, onboarding UI | Keep Design Resume/RxResume as resume sources. Career profile is a tenant overlay of preferences and references, never a second canonical resume/profile copy. |
| Stories | `interviewStories`, `repositories/interview-stories.ts`, `StoryBankPage.tsx` | Story Bank remains canonical. Additive tags and usage/provenance reference it; no second proof-point store or copied story master. |
| PDF files | `services/pdf-storage.ts`, `services/job-pdf-upload.ts`, renderer services | Keep separate mutable working-PDF and immutable submitted-artifact stores under tenant filesystem paths; a submitted copy is never the working PDF. |
| Background work | `infra/job-queue*.ts`, `services/auto-pdf-regeneration.ts` | Replace the production registry default with a SQLite durable queue. The in-memory adapter remains test-only. |
| Connector model | existing post-application providers, sync runs, and integration/settings repositories | Extend those provider/sync models incrementally; do not create a parallel connector credential or sync store. Establish credential encryption/redaction boundaries before generalizing provider capabilities. |

## Shared integration rules

1. All API endpoints use the existing `{ ok, data/error, meta.requestId }` contract, `asyncRoute`/`fail` helpers, Zod validation, sanitized error details, and `x-request-id` propagation.
2. Routes, services, workers, and outbox dispatch propagate `requestId`, `tenantId`, `jobId`, and `pipelineRunId` when available through `runWithRequestContext`; core paths use `infra/logger.ts` only.
3. New tables include `tenant_id`, tenant-parent composite foreign keys or equivalent enforced constraints, tenant-aware indexes, and repository queries that filter by `getActiveTenantId()`. A child record may not reference a parent from another tenant. Files are under a tenant directory. Tests prove tenant A cannot read, mutate, claim, or receive tenant B data.
4. Before any feature schema change, Wave 0 installs a versioned migration runner with ordered migration IDs, an applied-migrations ledger, transaction/rollback behavior, checksum drift detection, and upgrade tests from representative existing databases. `schema.ts`, migration files, and the runner are owned by one serial contract/migration integrator.
5. Only that serial integrator edits shared files: `schema.ts`, migration runner/files, `shared/src/types/*`, `orchestrator/src/shared/career-ops/feature-registry.ts`, `orchestrator/src/server/api/routes.ts`, docs navigation, and central client API barrels. Feature worktrees consume the published contracts and do not touch those files.
6. Every new fetch, upload, connector, and LLM-prompt route implements its own SSRF allow/deny and redirect policy where URLs are accepted, Zod input caps (body, string, URL, pagination, and file limits), least-PII field allowlist, tenant authorization, and sanitized bounded errors at introduction time. These are acceptance criteria for the owning wave, not a deferred hardening pass.

## Dependency and parallelization map

```text
Wave 0 migration runner + tenant-parent integrity (serial owner)
  └─ Wave 1 shared contracts + Deep Application foundation (serial owner)
       ├─ 1A tracker projection ──────────┐
       ├─ 1B CV proof/template ───────────┤
       ├─ 1C Story Bank extensions ───────┤ → Wave 1 CareerOps integration/parity gate (serial owner)
       └─ 1D career-profile overlay ──────┘
            ├─ Wave 2 Deep Application completion
            ├─ Wave 3 learning/provider extension
            └─ Wave 4 durable queue: one outbox vertical, then expansion
                 └─ Wave 5 health, docs, final verification
```

Wave 1A–1D can use separate Codex worktrees only after the serial owner has published the migration, contracts, and Deep Application foundation. Waves 2, 3, and 4 can then proceed in parallel if each avoids every shared file listed above until serial integration. No parallel worker edits a migration, shared contract, route mount, registry, central API barrel, or docs navigation. Each wave is a small sequence of independently shippable TDD tasks; no task should silently absorb another wave.

## Wave 0 — install migration safety and validate the snapshot baseline (serial)

### 0.1 Add the versioned migration runner and tenant-parent integrity rules

**Existing files:**

- `orchestrator/src/server/db/schema.ts`, `orchestrator/src/server/db/migrate.ts`, `orchestrator/src/server/db/migrate.test.ts`
- database bootstrap/test helpers and existing tenant-scoped repositories.

**TDD steps:**

1. Write failing upgrade tests for a representative pre-plan SQLite database: ordered migration application, one applied-migration ledger row per version/checksum, idempotent rerun, transactional failure/rollback, and checksum mismatch refusal.
2. Implement the versioned runner before adding any feature tables or columns. It must apply only ordered, immutable migrations and leave the existing database usable after a failed migration.
3. Add failing integrity tests for every new parent/child pattern: same-tenant child creation succeeds; a cross-tenant parent ID fails at the database constraint or repository boundary; deleting/retiring a parent follows an explicit safe policy. Add composite tenant-parent foreign keys where SQLite supports them, otherwise document and test the equivalent enforced repository transaction.

**Acceptance criteria:**

- No Wave 1+ schema change lands without a numbered, checksummed migration and an upgrade test through this runner.
- Exact regression tests prove `application_draft_revisions`, approvals/artifacts, story usage/tags, workflow rows, and provider sync rows cannot reference a parent belonging to another tenant.
- The serial owner is the only author of schema, migration, and shared-contract edits; parallel workers receive immutable contracts.

### 0.2 Reproduce the snapshot quality state

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

## Wave 1 — establish Deep Application safety, then complete CareerOps parity

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
- Publish approved table/column/index names through the Wave 0 migration runner. The serial owner alone creates the migrations and shared types; feature worktrees submit repository/service/UI changes against the agreed interfaces.
- Extend feature-registry tests so a feature cannot be marked `implemented` without API/UI contract tests and the Deep Application foundation gate below. No CareerOps capability is marked `implemented` before that gate is integrated.

### 1.1 Deep Application foundation and submission invariant (serial, before CareerOps parity)

**Existing files:**

- `orchestrator/src/server/api/routes/jobs.ts`, `services/applicationTracking.ts`, job/status repositories and generic status-update routes
- authentication/request-context services; `services/job-pdf-upload.ts`, `services/pdf-storage.ts`, and Design Resume/Story Bank repositories.

**Tasks and acceptance criteria:**

1. Define the authoritative application state transition contract and one authenticated `HumanApplicationSubmissionService`. It requires active tenant context, authenticated `userId`, explicit policy decision/version, a reviewed immutable draft revision, a QA-passing submitted artifact, and a user confirmation. Approval persists the real `userId`, policy/version, decision time, and exact revision/artifact IDs; it must never accept a client-supplied actor identity.
2. Route both `POST /jobs/:id/apply` and every generic job/status update capable of entering an applied/submitted stage through this service. Remove or reject direct repository writes, route shortcuts, worker transitions, and legacy status mutations that could create a submitted/application stage without approval.
3. Define snapshot inputs before marking parity complete. At draft creation, capture immutable normalized job snapshot fields/hash; the exact Design Resume document revision/render source; selected Story Bank excerpts/versioned content and IDs; career-profile overlay revision; and template/proof-point selections. Later mutable Design Resume rows or Story Bank edits must create a new candidate, never rewrite prior evidence.
4. Split storage semantics now: working PDFs are mutable candidates in their existing working location; submitted bytes are copied to a write-once tenant path with metadata and SHA-256. Download authorization reads only submitted-artifact metadata/path, never a mutable working path.
5. Make text-layer QA mandatory for every submitted candidate: deterministic text extraction, non-empty/selectable text assertion, required-section/term checks, and SHA-256. Visual rendering QA is capability-gated: it runs and is recorded only when the deterministic renderer is available; its absence is an explicit capability result, not a hidden approval blocker. Renderer failures when available are hard failures.
6. Each new snapshot URL/fetch and LLM prompt route includes route-local SSRF validation (scheme, DNS/IP/private-network and redirect controls), bounded retrieval/body/input limits, whitelisted minimal fields, and redacted logs. Tests must exercise these controls in this wave.

**Exact acceptance tests:**

- `POST /jobs/:id/apply` returns a contract error when approval, authenticated actor, policy record, immutable revision, or QA-passing artifact is absent; it succeeds only through `HumanApplicationSubmissionService` and stores the session user’s actual `userId`.
- A generic status-update request and a direct worker/service attempt to set `applied`/`submitted` without the service are rejected; the job stage/history remains unchanged. The same transition with a valid approval succeeds exactly once.
- After draft creation, mutate the source Design Resume row and Story Bank entry, then retrieve the original revision/artifact: captured resume/story/job snapshot content and hashes are byte-for-byte unchanged; a new draft gets new snapshot IDs/hashes.
- A submitted download returns the immutable submitted bytes/hash after the working PDF is replaced; tenant B receives no artifact or snapshot metadata for tenant A.
- Image-only PDF, missing text layer, and hash mismatch fail mandatory QA. Visual QA is reported `unavailable` when no deterministic renderer capability is present and is exercised for blank/overflow renderer failures when that capability is enabled.
- Snapshot fetch rejects loopback, link-local/private, credentialed, and redirect-to-private URLs; over-limit payloads and prompts are rejected/truncated before retrieval/model invocation, and test logs contain neither raw resume/story text nor credentials.

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

1. Add failing service/API tests for a tenant-scoped tracker projection built from existing `jobs`, `stage_events`, tasks, notes, PDF freshness, and reports—not a new tracker table or competing lifecycle state.
2. Implement the projection and filter/sort contract with explicit columns for application stage, next task/follow-up, last activity, report/evaluation availability, PDF state, and submission/artifact state once Wave 2 exists.
3. Prefer extending `InProgressBoardPage`, `TrackingInboxPage`, and existing job-page surfaces with tracker columns/filters; create a dedicated page only if those surfaces cannot express the approved view. Test empty, mixed-stage, overdue, and cross-tenant cases.

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
- A deleted or changed mutable Story Bank entry cannot rewrite a previously approved/submitted artifact: Wave 1.1 snapshots rendered evidence before this capability can be marked implemented.
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
2. Persist a single tenant-scoped career-profile overlay, with redacted logs and strict access checks. It contains preferences, narrative, and references to canonical Design Resume and Story Bank records; migrate existing onboarding values where equivalents already exist rather than duplicating canonical profile/resume/story data.
3. Integrate the contract as a resumable onboarding step and editable profile page; onboarding completeness must report specific missing requirements without exposing secrets.

**Acceptance criteria:**

- A complete overlay is sufficient for downstream tailoring/Deep Application context without requiring CSV/YAML input, while Design Resume and Story Bank remain canonical.
- Resume/profile caching is tenant-keyed or eliminated; changing tenant/profile cannot leak one profile into another prompt or response.
- The coverage registry marks all four CareerOps features `implemented` only after their tests/routes/pages are wired and the Wave 1.1 submission invariant and snapshot tests are green.

### Wave 1 checkpoint (serial integration)

- The serial owner integrates migrations once, then shared types/routes/navigation/feature registry once, and resolves conflicts before starting dependent waves. No other worktree writes these files.
- Run focused tests for each sub-wave plus `npm --workspace orchestrator run check:types` and `npm --workspace orchestrator run build:client`.
- Manually verify one tenant’s onboarding → Story Bank → tailored CV → tracker flow and a second tenant’s isolation in the API test harness.

## Wave 2 — complete Deep Application mode (depends on Wave 1 integration)

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
- `orchestrator/src/server/services/artifact-storage.ts` (tenant filesystem implementation only).

**Data design:**

- `application_dossiers`: one mutable working dossier per tenant/job, with state and current draft revision; unique `(tenant_id, job_id)`.
- `application_draft_revisions`: append-only drafter/reviewer outputs with input provenance: career-profile overlay revision, immutable Design Resume rendered/source snapshot and hash, proof-point/story IDs plus captured excerpts/content hashes, job-posting snapshot ID, model/provider metadata, and request ID. The human can edit a draft, but every submitted state points to a frozen revision.
- `job_posting_snapshots`: append-only, tenant/job-scoped normalized posting capture (source URL, retrieval time, content hash, selected whitelisted fields, sanitized rendered text); no raw unbounded upstream dump.
- `application_approvals`: append-only approval/rejection events. A submission requires the authenticated human `userId`, persisted policy decision/version, and exact draft revision/artifact IDs; machine drafter/reviewer identities and client-provided actor IDs cannot submit.
- `submitted_artifacts`: immutable file metadata/hash/path/version and QA report. A submitted artifact uses a unique versioned tenant path such as `pdfs/<tenant>/submitted/<job>/<artifact>.pdf`; current working PDFs may remain replaceable.

**TDD tasks:**

1. Add failing repository/migration tests for state transitions `drafting → reviewer_pending → human_review → approved → submitted` (and recoverable rejected/revision states), immutable revision/artifact rows, and tenant isolation.
2. Implement job-posting snapshot capture at Deep Application start/review, using minimal whitelisted data and a deterministic hash. Reuse current `jobs` fields as the live view; snapshots preserve historical evidence.
3. Implement drafter and reviewer services behind the existing LLM service abstraction, with bounded least-PII prompt contexts, input caps, and clear reviewer findings. Neither service can mark an application submitted.
4. Implement filesystem artifact storage/write-once semantics and hashes. Prevent update/delete/overwrite routes for submitted artifacts; permit creation of a new revision/artifact only. Do not add an object-storage abstraction.
5. Implement mandatory ATS text-layer QA (extract text, assert non-empty/selectable text, validate hash, compare required target terms/sections with explicit warnings). Add visual QA only behind a deterministic runtime capability check: record `unavailable` when absent, execute and hard-fail renderer/readability issues when present. QA produces a versioned report; warnings require human acknowledgement.

**Acceptance criteria:**

- Human approval is an explicit authenticated action tied to one reviewer-approved draft revision and one QA-passing artifact; no route or worker can bypass it.
- Submitted artifact bytes, SHA-256, file path, generated timestamp, source job snapshot hash, profile/template revision, and approval actor/timestamp are immutable and retrievable only in the owning tenant.
- A changed job posting, profile, story, template, or working PDF creates a new draft/artifact candidate; it does not alter what was submitted.
- PDF QA has fixtures for valid text PDFs, image-only/missing text layer, and hash mismatch as mandatory checks, plus renderer failure/visual overflow/blank-page detection when the deterministic runtime capability is enabled; reports are sanitized and bounded.

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

## Wave 3 — outcome learning, competency provenance, and provider extension (depends on Waves 1–2 contracts)

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

### 3.2 Extend post-application providers and sync models (parallel after 3.1 contract)

**Existing files:**

- `orchestrator/src/server/extractors/registry.ts`, `discovery.ts`
- `orchestrator/src/server/repositories/post-application-*.ts`
- `orchestrator/src/server/services/post-application/*`
- `shared/src/types/extractors.ts`, `shared/src/types/post-application.ts`

**Likely new files:**

- additive types/repository methods alongside `shared/src/types/post-application.ts`, existing `repositories/post-application-*.ts`, and `services/post-application/*`
- provider adapter tests alongside existing extractor/post-application providers; no duplicate connector registry, credential store, or sync-run store.

**Design:**

- Extend the existing post-application provider and sync-run lifecycle with typed normalized records, cursor/checkpoint metadata, capabilities, validation, pagination, error classification, and idempotency semantics. Do not introduce a duplicate connector runtime/store.
- Raw provider payloads are minimized, sanitized, and discarded unless a bounded provenance field is explicitly required; canonical jobs/stage events remain the source of truth.
- Before generalizing any provider, document and test the credential boundary in the existing protected integration/settings pathway: encryption at rest/key ownership where the current platform supports it, redaction before logs/errors/responses, and no plaintext credential persistence in new tables. Sync runs and idempotency keys remain tenant-scoped in the existing model.

**Acceptance criteria:**

- An existing post-application provider can expose typed capabilities and be health-checked through its existing lifecycle, with validation, pagination/cursor behavior, error classification, and idempotency semantics.
- Existing extractors and post-application providers gain additive adapters incrementally with no behavior regression; a fixture-backed adapter test proves normalizing duplicate input yields a single canonical record/event.
- Exact credential tests prove API responses, thrown sanitized errors, and structured logs never disclose a credential, token, authorization header, or decrypted secret; persistence tests prove new provider/sync rows contain references or ciphertext only, never plaintext.
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
- Keep the queue implementation SQLite-specific for this scope. Do not add a pg-boss/PostgreSQL adapter/interface, package, connection, migration, or runtime switch.

**TDD tasks:**

1. Write failing queue contract tests shared by memory and SQLite adapters: tenant-scoped idempotency, delayed availability, priority/order, atomic exclusive claims, acknowledgement, lease expiry recovery, retry schedule, terminal DLQ, and context propagation.
2. Add migration tests that upgrade an existing database without data loss and verify indexes/uniqueness.
3. Implement the SQLite adapter, tenant-first registry startup/shutdown lifecycle, and structured metrics/log events. Migrate only auto-PDF regeneration as the first vertical producer through a transactional outbox; do not migrate additional producers until its restart/lease/DLQ tests pass.
4. Add outbox tests that simulate a process failure between domain write and dispatch, duplicate dispatch, retry after restart, worker shutdown with an active lease, and startup recovery. Expand producers only after the serial integration checkpoint.

**Acceptance criteria:**

- Restarting OpenJobs does not lose accepted auto-PDF work; a task is processed at least once but its idempotency contract prevents duplicate business effects.
- A worker cannot claim a task from another tenant or process one task concurrently twice while the lease is valid.
- Retry/backoff/DLQ decisions are observable without leaking payload PII; dead-letter replay requires an explicit operator action and produces an audit event.
- No active production code instantiates `InMemoryJobQueue`; tests can still inject it deliberately.
- Exact queue tests prove: an accepted tenant-scoped outbox task survives process restart; an unacknowledged lease is unavailable before expiry then reclaimed once after expiry; concurrent workers obtain one lease only; retry exhaustion writes an immutable DLQ row with redacted error; an explicit replay creates a new audited attempt; and shutdown stops new claims then safely recovers outstanding leases at next startup.

## Wave 5 — runtime capability health, documentation, tenant tests, and release verification

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

### 5.2 Documentation and regression completion (serial)

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

- Update user-facing docs with required frontmatter and the What/Why/How/Common problems/Related pages structure. State human-approval limits, immutable artifact behavior, stored provenance, retention/deletion behavior, queue retry/DLQ behavior, and the SQLite/filesystem scope. Do not promise unapproved PostgreSQL or object-store interfaces.
- Verify each wave’s route-local security tests remain present and passing: Zod limits, authorization/tenant filters, SSRF-safe snapshot/provider URLs, upload/PDF limits, path traversal prevention, sanitization/redaction, least-PII prompts, and safe error details. This wave does not defer or newly add protections that an owning route should already have implemented.
- Add cross-tenant regression suites for profile overlay, story tags/usage, tracker projection, dossier/approval/artifact, competency evidence, existing provider/sync models, queue/outbox, and file retrieval. Add negative authorization and logging-redaction tests.

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
| Parallel work collides in schema, migrations, shared types, routes, registry, central API barrels, or docs navigation | The serial contract/migration owner alone integrates those files; feature worktrees use published contracts and tests until integration. |
| SQLite concurrency makes task claiming unreliable | Use short transactional atomic claims, leases, indexes, shutdown/startup recovery, and a single-process worker configuration now; do not pre-build a replacement adapter. |
| LLM output invents or leaks candidate data | Minimize whitelisted inputs, record provenance, require reviewer plus human approval, sanitize logging, and never treat generated claims as verified evidence. |
| Submitted PDFs are accidentally overwritten | Separate immutable artifact paths/metadata from working `pdfPath`; block mutation APIs and test file/hash immutability. |
| Analytics imply causation from small data | Require sample thresholds, label results descriptive/insufficient, and expose evidence links. |
| Profile/story/artifact leakage across tenants | Tenant filters, composite indexes, tenant-keyed filesystem paths/queue keys, and explicit two-tenant regression tests in every affected wave. |

## Definition of done

The work is complete only when the Wave 0 migration runner and tenant-parent integrity tests are green; the Wave 1 Deep Application foundation closes every submission bypass before any CareerOps feature is marked implemented; all four CareerOps features are then truthfully marked implemented; Deep Application has immutable job/resume/story snapshots and QA-checked submitted artifacts; learning and existing provider/sync extensions are provenance-backed and database-native; the active production queue has one transactional-outbox vertical with tenant-first lifecycle, restart/lease/DLQ coverage before expansion; runtime health, documentation, route-local privacy/security tests, tenant tests, full CI, and browser verification all pass. PostgreSQL, pg-boss, MinIO/object storage, Temporal, microservices, Claude runtime, and file-based sources of truth remain absent.
