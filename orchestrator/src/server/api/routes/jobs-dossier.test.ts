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

  it("returns the existing dossier and deterministic snapshot when started twice", async () => {
    const job = await createJob();

    const first = await getJson(`/api/jobs/${job.id}/dossier`);
    const second = await getJson(`/api/jobs/${job.id}/dossier`);

    expect(first.response.status).toBe(200);
    expect(second.body.data.dossier.id).toBe(first.body.data.dossier.id);
    expect(second.body.data.postingSnapshot.id).toBe(
      first.body.data.postingSnapshot.id,
    );
    expect(first.body.data.postingSnapshot.normalizedText).toContain(
      "Platform Engineer",
    );
    expect(first.body.data.postingSnapshot.contentHash).toMatch(
      /^[a-f0-9]{64}$/,
    );
    expect(first.body.data.postingSnapshot.sourceUrl).toBe(
      "https://example.test/platform",
    );
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
    expect(first.body.data.postingSnapshot.id).toBe(
      second.body.data.postingSnapshot.id,
    );
    expect(first.body.data.postingSnapshot.sourceUrl).toBe(
      `local-job://job/${job.id}`,
    );
    expect(
      JSON.parse(first.body.data.postingSnapshot.retrievalMetadata),
    ).toMatchObject({
      sourceUrl: {
        kind: "local_canonical_job_identity",
        uri: `local-job://job/${job.id}`,
      },
    });
  });

  it("captures a new posting snapshot after canonical job fields change without changing the dossier", async () => {
    const job = await createJob();
    const first = await getJson(`/api/jobs/${job.id}/dossier`);
    const { updateJob } = await import("@server/repositories/jobs");
    await updateJob(job.id, { jobDescription: "A materially different role." });

    const second = await getJson(`/api/jobs/${job.id}/dossier`);

    expect(second.body.data.dossier.id).toBe(first.body.data.dossier.id);
    expect(second.body.data.postingSnapshot.id).not.toBe(
      first.body.data.postingSnapshot.id,
    );
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
    expect(first.body.data.revision.storySnapshot).toContain("No downtime");
    expect(second.body.data.revision.storySnapshot).toContain(
      "Changed after drafting",
    );
    expect(first.body.data.revision.contentHash).toMatch(/^[a-f0-9]{64}$/);
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
