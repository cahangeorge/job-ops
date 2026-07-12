# Wave 1.1 — Human Application Submission Foundation

## Objective
Make `applied` a security-sensitive, human-authorized outcome. The only production path that may transition a live job to `applied` is `HumanApplicationSubmissionService`.

## Scope of this vertical slice
1. Tenant-scoped repositories for the already-migrated dossier, immutable draft revision, approval, submitted artifact, and job-snapshot tables.
2. A `HumanApplicationSubmissionService` that atomically validates and records a submission.
3. Mandatory deterministic PDF text-layer QA and SHA-256 verification before submission.
4. Copy-on-submit storage into a tenant-scoped immutable artifact path; submitted downloads resolve only through artifact metadata.
5. Route/status guards that reject direct attempts to enter `applied`, including legacy `/jobs/:id/apply` and generic status updates. A dedicated authenticated submit route invokes the service.

## Non-goals for this slice
- LLM drafter/reviewer UX, workspace UI, visual-renderer QA, automatic browser submission, durable queue/outbox, or learning.
- Replacing the mutable working-PDF store or Design Resume source of truth.
- Changing demo seed history; seeded historical `applied` jobs remain readable.

## Submission contract
The service accepts only a server-derived request context and IDs/references. It must reject client-supplied actor identities.

Preconditions:
- request context has both active `tenantId` and authenticated `userId`;
- tenant-owned job exists and has a working PDF;
- the referenced immutable draft revision belongs to that job/dossier and is eligible;
- policy version is nonempty and user confirms submission;
- server computes working-PDF SHA-256 and text-layer QA; an image-only/missing-text or hash mismatch candidate fails;
- artifact bytes are copied to a new tenant artifact path and the immutable metadata row is inserted;
- approval records the authenticated context user, policy version, request ID, draft ID, and artifact identity/provenance;
- only then does the service transition job state and append the stage event, once.

## Security invariants
- Every repository read/write filters by `getActiveTenantId()`; submitted artifact download requires tenant ownership.
- Artifact metadata is append-only and its storage path cannot alias the mutable working PDF.
- Client actor IDs, raw paths, hashes, and QA pass values are never trusted.
- Generic `PATCH /api/jobs/:id` and legacy apply endpoints reject `status: applied`; no direct repository/service shortcut may set it.
- Failed preconditions leave job stage/history unchanged and do not leave a submitted-artifact row. A copied orphan file is cleaned up on transactional failure.

## Tests (RED then GREEN)
- unauthenticated context, missing policy/confirmation, foreign tenant job/revision, missing/failed QA, and stale/mismatched working PDF all fail with no state transition;
- valid submission persists one approval with context user ID, one immutable artifact, and exactly one applied stage event;
- a second submission and generic/legacy direct apply reject without creating duplicates;
- mutating/replacing the working PDF after success does not alter returned submitted bytes/hash;
- tenant B cannot fetch tenant A artifact or snapshot metadata;
- image-only/missing text and hash mismatch PDFs fail deterministic QA.

## Verification
- focused repository/service/route tests;
- canonical branch: focused integration tests, `npm --workspace orchestrator run check:types`, and `npm --workspace orchestrator run build:client`.
