// @vitest-environment node

import type { Server } from "node:http";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { startServer, stopServer } from "./test-utils";

describe.sequential("job dossier routes", () => {
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

  async function createJob() {
    const { createJob: createJobInRepo } = await import(
      "@server/repositories/jobs"
    );
    return createJobInRepo({
      source: "manual",
      title: "  Platform Engineer ",
      employer: " Acme  ",
      location: " Berlin ",
      jobUrl: "https://example.test/platform",
      jobDescription: " Build  reliable\n systems. ",
    });
  }

  async function seedDesignResume() {
    const { replaceCurrentDesignResumeDocument } = await import(
      "@server/services/design-resume"
    );
    const { buildDefaultReactiveResumeDocument } = await import(
      "@server/services/rxresume/document"
    );
    const { parseV5ResumeData } = await import(
      "@server/services/rxresume/schema/v5"
    );
    return replaceCurrentDesignResumeDocument({
      resumeJson: parseV5ResumeData(buildDefaultReactiveResumeDocument()),
      sourceResumeId: null,
      sourceMode: "v5",
    });
  }

  async function getJson(path: string, init?: RequestInit) {
    const response = await fetch(`${baseUrl}${path}`, init);
    return { response, body: await response.json() };
  }

  it("returns an existing dossier with a safe posting summary when started twice", async () => {
    const job = await createJob();

    const first = await getJson(`/api/jobs/${job.id}/dossier`);
    const second = await getJson(`/api/jobs/${job.id}/dossier`);

    expect(first.response.status).toBe(200);
    expect(second.body.data.dossier.id).toBe(first.body.data.dossier.id);
    expect(second.body.data.posting.id).toBe(first.body.data.posting.id);
    expect(first.body.data.posting.hashPrefix).toMatch(/^[a-f0-9]{8}$/);
  });

  it("starts a no-URL manual job with a stable local source URI", async () => {
    const { createJob: createJobInRepo } = await import(
      "@server/repositories/jobs"
    );
    const job = await createJobInRepo({
      source: "manual",
      title: "Offline referral",
      employer: "Acme",
      jobUrl: "",
      jobDescription: "A role entered without an external posting URL.",
    });

    const first = await getJson(`/api/jobs/${job.id}/dossier`);
    const second = await getJson(`/api/jobs/${job.id}/dossier`);

    expect(first.response.status).toBe(200);
    expect(second.response.status).toBe(200);
    expect(first.body.ok).toBe(true);
    expect(first.body.data.dossier.id).toBe(second.body.data.dossier.id);
    expect(first.body.data.posting.id).toBe(second.body.data.posting.id);
    expect(first.body.data.posting.hashPrefix).toMatch(/^[a-f0-9]{8}$/);
  });

  it("captures a new posting snapshot after canonical job fields change without changing the dossier", async () => {
    const job = await createJob();
    const first = await getJson(`/api/jobs/${job.id}/dossier`);
    const { updateJob } = await import("@server/repositories/jobs");
    await updateJob(job.id, { jobDescription: "A materially different role." });

    const second = await getJson(`/api/jobs/${job.id}/dossier`);

    expect(second.body.data.dossier.id).toBe(first.body.data.dossier.id);
    expect(second.body.data.posting.id).not.toBe(first.body.data.posting.id);
    const { db, schema } = await import("@server/db");
    const snapshots = await db
      .select()
      .from(schema.jobPostingSnapshots)
      .where(
        (await import("drizzle-orm")).eq(
          schema.jobPostingSnapshots.jobId,
          job.id,
        ),
      );
    expect(snapshots).toHaveLength(2);
  });

  it("creates immutable, provenance-backed revisions and retains old evidence", async () => {
    const job = await createJob();
    await seedDesignResume();
    const { createInterviewStory, updateInterviewStory } = await import(
      "@server/repositories/interview-stories"
    );
    const story = await createInterviewStory({
      title: "Migration",
      situation: "Legacy platform",
      task: "Ship safely",
      action: "Introduced canaries",
      result: "No downtime",
      reflection: "Validate migrations with production-like data.",
      skills: "Migration planning, deployment safety",
      tags: "migration, reliability",
      isMasterStory: false,
    });

    const first = await getJson(`/api/jobs/${job.id}/dossier/drafts`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ content: "My human draft", storyIds: [story.id] }),
    });
    await updateInterviewStory(story.id, { result: "Changed after drafting" });
    const second = await getJson(`/api/jobs/${job.id}/dossier/drafts`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        content: "Second human draft",
        storyIds: [story.id],
      }),
    });

    expect(first.response.status).toBe(200);
    expect(first.body.data.revision.revisionNumber).toBe(1);
    expect(second.body.data.revision.revisionNumber).toBe(2);
    expect(first.body.data.dossier.lifecycleState).toBe("pending_approval");
    expect(first.body.data.revision).toEqual({
      id: expect.any(String),
      revisionNumber: 1,
    });
    const { db, schema } = await import("@server/db");
    const [storedFirstRevision] = await db
      .select()
      .from(schema.applicationDraftRevisions)
      .where(
        (await import("drizzle-orm")).eq(
          schema.applicationDraftRevisions.id,
          first.body.data.revision.id,
        ),
      );
    expect(storedFirstRevision.storySnapshot).toContain("No downtime");
  });

  it("returns only bounded safe dossier history summaries", async () => {
    const job = await createJob();
    const initial = await getJson(`/api/jobs/${job.id}/dossier`);
    const dossierId = initial.body.data.dossier.id;
    const { db, schema } = await import("@server/db");

    for (let revisionNumber = 1; revisionNumber <= 21; revisionNumber += 1) {
      const revisionId = `revision-${revisionNumber}`;
      await db.insert(schema.applicationDraftRevisions).values({
        id: revisionId,
        tenantId: "tenant_default",
        dossierId,
        jobId: job.id,
        revisionNumber,
        jobSnapshot: '{"rawJob":"do not expose"}',
        resumeSnapshot: '{"revision":7,"private":"do not expose"}',
        storySnapshot:
          '{"stories":[{"id":"story-1","excerpt":"Delivery — Safe release details"}]}',
        contentSnapshot: `{"body":"${"x".repeat(10_050)}"}`,
        provenance: '{"token":"do not expose"}',
        contentHash: "a".repeat(64),
        createdAt: `2026-01-${String(revisionNumber).padStart(2, "0")}T00:00:00.000Z`,
      });
    }
    await db.insert(schema.submittedApplicationArtifacts).values({
      id: "artifact-21",
      tenantId: "tenant_default",
      dossierId,
      jobId: job.id,
      draftRevisionId: "revision-21",
      storagePath: "data/submitted-applications/private-21.pdf",
      sha256: "21".padStart(64, "0"),
      byteSize: 21,
      mediaType: "application/pdf",
      qaResult: "passed",
      createdAt: "2026-02-21T00:00:00.000Z",
    });

    const response = await getJson(`/api/jobs/${job.id}/dossier`);
    const serialized = JSON.stringify(response.body.data);

    expect(response.response.status).toBe(200);
    expect(response.body.data.revisions).toHaveLength(20);
    expect(response.body.data.revisions[0]).toMatchObject({
      revisionNumber: 21,
      resumeRevision: 7,
      stories: [
        {
          id: "story-1",
          title: "Delivery",
          excerpt: "Delivery — Safe release details",
        },
      ],
    });
    expect(response.body.data.revisions[0].content).toHaveLength(10_000);
    expect(response.body.data.submittedArtifacts).toHaveLength(1);
    expect(response.body.data.submittedArtifacts[0]).toMatchObject({
      id: "artifact-21",
      draftRevisionId: "revision-21",
      byteSize: 21,
      mediaType: "application/pdf",
      qaResult: "passed",
    });
    expect(response.body.data.hasMore).toEqual({
      revisions: true,
      submittedArtifacts: false,
    });
    for (const forbidden of [
      "jobSnapshot",
      "resumeSnapshot",
      "storySnapshot",
      "provenance",
      "contentHash",
      "storagePath",
      "sha256",
      "rawJob",
      "private-",
      "do not expose",
    ]) {
      expect(serialized).not.toContain(forbidden);
    }
  });

  it("rejects missing jobs, missing Story Bank IDs, missing Design Resume, and oversize content", async () => {
    const missingJob = await getJson("/api/jobs/missing/dossier");
    expect(missingJob.response.status).toBe(404);

    const job = await createJob();
    const missingResume = await getJson(`/api/jobs/${job.id}/dossier/drafts`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ content: "draft" }),
    });
    expect(missingResume.response.status).toBe(404);

    await seedDesignResume();
    const missingStory = await getJson(`/api/jobs/${job.id}/dossier/drafts`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        content: "draft",
        storyIds: ["00000000-0000-4000-8000-000000000000"],
      }),
    });
    expect(missingStory.response.status).toBe(404);

    const tooLarge = await getJson(`/api/jobs/${job.id}/dossier/drafts`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ content: "x".repeat(100_001) }),
    });
    expect(tooLarge.response.status).toBe(400);
  });

  it("does not read or draft across tenants, including foreign story and resume sources", async () => {
    const job = await createJob();
    await seedDesignResume();
    const { createInterviewStory } = await import(
      "@server/repositories/interview-stories"
    );
    const foreignStory = await createInterviewStory({
      title: "Foreign story",
      situation: "A",
      task: "B",
      action: "C",
      result: "D",
      reflection: "E",
      skills: "F",
      tags: "G",
      isMasterStory: false,
    });
    const { db, schema } = await import("@server/db");
    await db.insert(schema.tenants).values({
      id: "tenant-b",
      name: "Tenant B",
      slug: "tenant-b",
    });
    const { runWithRequestContext } = await import(
      "@server/infra/request-context"
    );
    const { createJob: createJobInRepo } = await import(
      "@server/repositories/jobs"
    );
    const { ApplicationDossierService } = await import(
      "@server/services/application-dossier"
    );
    const service = new ApplicationDossierService();

    await expect(
      runWithRequestContext(
        { tenantId: "tenant-b", userId: "tenant-b-user", requestId: "b-read" },
        () => service.startOrGet(job.id),
      ),
    ).rejects.toThrow("Job not found");

    const tenantBJob = await runWithRequestContext(
      { tenantId: "tenant-b", userId: "tenant-b-user", requestId: "b-job" },
      () =>
        createJobInRepo({
          source: "manual",
          title: "Tenant B role",
          employer: "B Corp",
          jobUrl: "https://example.test/tenant-b-role",
        }),
    );
    await expect(
      runWithRequestContext(
        { tenantId: "tenant-b", userId: "tenant-b-user", requestId: "b-draft" },
        () =>
          service.createManualDraftRevision(tenantBJob.id, {
            content: "draft",
            storyIds: [foreignStory.id],
          }),
      ),
    ).rejects.toThrow("Resume Studio has not been imported yet");

    await runWithRequestContext(
      { tenantId: "tenant-b", userId: "tenant-b-user", requestId: "b-resume" },
      () => seedDesignResume(),
    );
    await expect(
      runWithRequestContext(
        {
          tenantId: "tenant-b",
          userId: "tenant-b-user",
          requestId: "b-foreign-story",
        },
        () =>
          service.createManualDraftRevision(tenantBJob.id, {
            content: "draft",
            storyIds: [foreignStory.id],
          }),
      ),
    ).rejects.toThrow("Story Bank entry not found");
  });
});
