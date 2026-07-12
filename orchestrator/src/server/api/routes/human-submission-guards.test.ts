// @vitest-environment node

import { createHash } from "node:crypto";
import { mkdir, writeFile } from "node:fs/promises";
import type { Server } from "node:http";
import { dirname } from "node:path";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { submissionTextPdf } from "./fixtures/submission-text-pdf.fixture";
import { startServer, stopServer } from "./test-utils";

vi.mock("@server/services/jobs/webhooks", () => ({
  notifyJobCompleteWebhook: vi.fn().mockResolvedValue(undefined),
}));

describe.sequential("human submission guards", () => {
  let server: Server;
  let baseUrl: string;
  let closeDb: () => void;
  let tempDir: string;

  beforeEach(async () => {
    ({ server, baseUrl, closeDb, tempDir } = await startServer());
  });

  afterEach(async () => {
    await stopServer({ server, closeDb, tempDir });
  });

  async function seedSubmissionActor() {
    const { db, schema } = await import("@server/db");
    await db.insert(schema.users).values({
      id: "test-user",
      username: "test",
      displayName: "Test User",
      passwordHash: "test-password-hash",
      passwordSalt: "test-password-salt",
    });
    await db.insert(schema.tenantMemberships).values({
      id: "test-user-tenant-default",
      tenantId: "tenant_default",
      userId: "test-user",
      role: "owner",
    });
  }

  async function writeTenantWorkingPdf(jobId: string): Promise<string> {
    const { getTenantJobPdfPath } = await import("@server/services/pdf-storage");
    const workingPdfPath = getTenantJobPdfPath(jobId);
    await mkdir(dirname(workingPdfPath), { recursive: true });
    await writeFile(workingPdfPath, submissionTextPdf);
    return workingPdfPath;
  }

  it("rejects legacy and generic ways to set an application to applied", async () => {
    const { createJob, getJobById } = await import("@server/repositories/jobs");
    const job = await createJob({
      source: "manual",
      title: "Guarded role",
      employer: "Acme",
      jobUrl: "https://example.test/guarded-role",
    });

    for (const [method, url, body] of [
      ["POST", `${baseUrl}/api/jobs/${job.id}/apply`, {}],
      ["PATCH", `${baseUrl}/api/jobs/${job.id}`, { status: "applied" }],
      ["POST", `${baseUrl}/api/jobs/${job.id}/stages`, { toStage: "applied" }],
    ] as const) {
      const response = await fetch(url, {
        method,
        headers: { "content-type": "application/json" },
        body: JSON.stringify(body),
      });
      expect(response.status).toBe(400);
      expect((await response.json()).ok).toBe(false);
    }

    expect((await getJobById(job.id))?.status).not.toBe("applied");
  });

  it("submits a real text PDF once, preserves its immutable artifact, and keeps it tenant-scoped", async () => {
    const { db, schema } = await import("@server/db");
    const { runWithRequestContext } = await import(
      "@server/infra/request-context"
    );
    const { getSubmittedArtifact } = await import(
      "@server/repositories/application-submissions"
    );
    const { createJob, updateJob } = await import("@server/repositories/jobs");
    const { eq } = await import("drizzle-orm");
    await seedSubmissionActor();
    const job = await createJob({
      source: "manual",
      title: "Submitted role",
      employer: "Acme",
      jobUrl: "https://example.test/submitted-role",
    });
    const workingPdfPath = await writeTenantWorkingPdf(job.id);
    const originalHash = createHash("sha256")
      .update(submissionTextPdf)
      .digest("hex");
    const { inspectSubmissionPdf } = await import(
      "@server/services/human-application-submission"
    );
    await expect(
      inspectSubmissionPdf(submissionTextPdf, originalHash),
    ).resolves.toMatchObject({ qaResult: "passed" });
    await updateJob(job.id, { pdfPath: workingPdfPath, status: "ready" });

    const dossierId = "dossier-submitted";
    const revisionId = "revision-submitted";
    await db.insert(schema.applicationDossiers).values({
      id: dossierId,
      tenantId: "tenant_default",
      jobId: job.id,
      lifecycleState: "draft",
    });
    await db.insert(schema.applicationDraftRevisions).values({
      id: revisionId,
      tenantId: "tenant_default",
      dossierId,
      jobId: job.id,
      revisionNumber: 1,
      jobSnapshot: "{}",
      resumeSnapshot: "{}",
      storySnapshot: "{}",
      contentSnapshot: "{}",
      provenance: "{}",
      contentHash: "a".repeat(64),
    });

    const response = await fetch(`${baseUrl}/api/jobs/${job.id}/submit`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        draftRevisionId: revisionId,
        policyVersion: "policy-1",
        confirmed: true,
        expectedWorkingPdfSha256: originalHash,
      }),
    });
    const body = await response.json();

    expect(response.status).toBe(200);
    expect(body.ok).toBe(true);
    const [artifact] = await db
      .select()
      .from(schema.submittedApplicationArtifacts)
      .where(eq(schema.submittedApplicationArtifacts.id, body.data.submittedArtifactId));
    const approvals = await db
      .select()
      .from(schema.applicationApprovals)
      .where(eq(schema.applicationApprovals.dossierId, dossierId));
    const transitions = await db
      .select()
      .from(schema.stageEvents)
      .where(eq(schema.stageEvents.applicationId, job.id));

    expect(artifact).toMatchObject({
      tenantId: "tenant_default",
      dossierId,
      draftRevisionId: revisionId,
      sha256: originalHash,
      qaResult: "passed",
    });
    expect(approvals).toHaveLength(1);
    expect(approvals[0]).toMatchObject({
      approvedByUserId: "test-user",
      submittedArtifactId: body.data.submittedArtifactId,
    });
    expect(transitions).toHaveLength(1);
    expect(transitions[0]).toMatchObject({ toStage: "applied" });

    await writeFile(workingPdfPath, Buffer.from("replacement working file"));
    const artifactResponse = await fetch(
      `${baseUrl}/api/jobs/${job.id}/submitted-artifacts/${body.data.submittedArtifactId}/content`,
    );
    const artifactBytes = Buffer.from(await artifactResponse.arrayBuffer());
    expect(artifactResponse.status).toBe(200);
    expect(artifactBytes).toEqual(submissionTextPdf);
    expect(createHash("sha256").update(artifactBytes).digest("hex")).toBe(
      originalHash,
    );

    await db.insert(schema.tenants).values({
      id: "tenant-b",
      name: "Tenant B",
      slug: "tenant-b",
    });
    await expect(
      runWithRequestContext({ tenantId: "tenant-b" }, () =>
        getSubmittedArtifact(body.data.submittedArtifactId),
      ),
    ).resolves.toBeNull();
  });

  it("rejects a mismatched working-PDF hash without running post-commit side effects", async () => {
    const { db, schema } = await import("@server/db");
    const { createJob, updateJob } = await import("@server/repositories/jobs");
    const { trackCanonicalActivationEvent } = await import(
      "@server/services/activation-funnel"
    );
    const { notifyJobCompleteWebhook } = await import(
      "@server/services/jobs/webhooks"
    );
    const job = await createJob({
      source: "manual",
      title: "Hash-guarded role",
      employer: "Acme",
      jobUrl: "https://example.test/hash-guarded-role",
    });
    const workingPdfPath = await writeTenantWorkingPdf(job.id);
    await updateJob(job.id, { pdfPath: workingPdfPath, status: "ready" });
    await db.insert(schema.applicationDossiers).values({
      id: "dossier-hash-guarded",
      tenantId: "tenant_default",
      jobId: job.id,
      lifecycleState: "draft",
    });
    await db.insert(schema.applicationDraftRevisions).values({
      id: "revision-hash-guarded",
      tenantId: "tenant_default",
      dossierId: "dossier-hash-guarded",
      jobId: job.id,
      revisionNumber: 1,
      jobSnapshot: "{}",
      resumeSnapshot: "{}",
      storySnapshot: "{}",
      contentSnapshot: "{}",
      provenance: "{}",
      contentHash: "c".repeat(64),
    });

    const response = await fetch(`${baseUrl}/api/jobs/${job.id}/submit`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        draftRevisionId: "revision-hash-guarded",
        policyVersion: "policy-1",
        confirmed: true,
        expectedWorkingPdfSha256: "0".repeat(64),
      }),
    });
    const body = await response.json();

    expect(response.status).toBe(409);
    expect(body).toMatchObject({
      ok: false,
      error: {
        code: "CONFLICT",
        message: "Working PDF changed before submission.",
      },
    });
    expect(trackCanonicalActivationEvent).not.toHaveBeenCalled();
    expect(notifyJobCompleteWebhook).not.toHaveBeenCalled();
  });

  it("rejects a PDF without a readable text layer", async () => {
    const { inspectSubmissionPdf } = await import(
      "@server/services/human-application-submission"
    );
    const bytes = Buffer.from("%PDF-1.4\n1 0 obj\n<<>>\nendobj\n%%EOF\n");
    const sha256 = createHash("sha256").update(bytes).digest("hex");

    await expect(inspectSubmissionPdf(bytes, sha256)).rejects.toThrow(
      "text layer",
    );
  });

  it("runs canonical activation and completion webhook only after a successful submission", async () => {
    const { db, schema } = await import("@server/db");
    const { createJob, updateJob } = await import("@server/repositories/jobs");
    const { trackCanonicalActivationEvent } = await import(
      "@server/services/activation-funnel"
    );
    const { notifyJobCompleteWebhook } = await import(
      "@server/services/jobs/webhooks"
    );
    await seedSubmissionActor();
    const job = await createJob({
      source: "manual",
      title: "Side-effect role",
      employer: "Acme",
      jobUrl: "https://example.test/submission-side-effects",
    });
    const workingPdfPath = await writeTenantWorkingPdf(job.id);
    const hash = createHash("sha256").update(submissionTextPdf).digest("hex");
    await updateJob(job.id, { pdfPath: workingPdfPath, status: "ready" });
    await db.insert(schema.applicationDossiers).values({
      id: "dossier-side-effects",
      tenantId: "tenant_default",
      jobId: job.id,
      lifecycleState: "draft",
    });
    await db.insert(schema.applicationDraftRevisions).values({
      id: "revision-side-effects",
      tenantId: "tenant_default",
      dossierId: "dossier-side-effects",
      jobId: job.id,
      revisionNumber: 1,
      jobSnapshot: "{}",
      resumeSnapshot: "{}",
      storySnapshot: "{}",
      contentSnapshot: "{}",
      provenance: "{}",
      contentHash: "b".repeat(64),
    });

    const response = await fetch(`${baseUrl}/api/jobs/${job.id}/submit`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        draftRevisionId: "revision-side-effects",
        policyVersion: "policy-1",
        confirmed: true,
        expectedWorkingPdfSha256: hash,
      }),
    });

    expect(response.status).toBe(200);
    expect(trackCanonicalActivationEvent).toHaveBeenCalledWith(
      "application_marked_applied",
      expect.objectContaining({ source: "jobs_submit_route" }),
      expect.objectContaining({ urlPath: "/jobs" }),
    );
    expect(notifyJobCompleteWebhook).toHaveBeenCalledWith(
      expect.objectContaining({ id: job.id, status: "applied" }),
    );
  });
});
