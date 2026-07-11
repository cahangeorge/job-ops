import { describe, expect, it } from "vitest";
import {
  APPLICATION_DOSSIER_LIFECYCLE_STATES,
  APPLICATION_SNAPSHOT_MAX_CHARS,
  type ApplicationApproval,
  type ApplicationDossier,
  type ApplicationDraftRevision,
  type SubmittedApplicationArtifact,
} from "./application-domain";

describe("application domain contracts", () => {
  it("exports stable lifecycle states and bounded snapshot limits", () => {
    expect(APPLICATION_DOSSIER_LIFECYCLE_STATES).toContain("submitted");
    expect(APPLICATION_SNAPSHOT_MAX_CHARS.content).toBeGreaterThan(0);
    expect(APPLICATION_SNAPSHOT_MAX_CHARS.postingText).toBeGreaterThan(
      APPLICATION_SNAPSHOT_MAX_CHARS.job,
    );
  });

  it("exposes tenant-scoped immutable application records", () => {
    const dossier: ApplicationDossier = {
      id: "dossier-1",
      tenantId: "tenant-1",
      jobId: "job-1",
      lifecycleState: "draft",
      createdAt: "2026-01-01T00:00:00.000Z",
      updatedAt: "2026-01-01T00:00:00.000Z",
    };
    const revision: ApplicationDraftRevision = {
      ...dossier,
      dossierId: dossier.id,
      revisionNumber: 1,
      jobSnapshot: "{}",
      resumeSnapshot: "{}",
      storySnapshot: "{}",
      contentSnapshot: "{}",
      provenance: "{}",
      contentHash: "a".repeat(64),
    };
    const approval: ApplicationApproval = {
      id: "approval-1",
      tenantId: dossier.tenantId,
      dossierId: dossier.id,
      jobId: dossier.jobId,
      decision: "approved",
      approvedByUserId: "user-1",
      policyVersion: "policy-1",
      requestId: "request-1",
      reason: null,
      createdAt: dossier.createdAt,
    };
    const artifact: SubmittedApplicationArtifact = {
      id: "artifact-1",
      tenantId: dossier.tenantId,
      dossierId: dossier.id,
      jobId: dossier.jobId,
      draftRevisionId: revision.id,
      storagePath: "data/submitted-applications/artifact-1.pdf",
      sha256: "b".repeat(64),
      byteSize: 1,
      mediaType: "application/pdf",
      qaResult: "passed",
      createdAt: dossier.createdAt,
    };

    expect(artifact.draftRevisionId).toBe(revision.id);
    expect(approval.tenantId).toBe(dossier.tenantId);
  });
});
