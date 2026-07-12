import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

describe.sequential("competency evidence repository", () => {
  const originalEnv = { ...process.env };
  let tempDir: string;
  let closeDb: (() => void) | null = null;

  beforeEach(async () => {
    tempDir = await mkdtemp(join(tmpdir(), "job-ops-competency-evidence-"));
    vi.resetModules();
    process.env = { ...originalEnv, DATA_DIR: tempDir, NODE_ENV: "test" };
    await import("@server/db/migrate");
    ({ closeDb } = await import("@server/db"));
  });

  afterEach(async () => {
    closeDb?.();
    closeDb = null;
    process.env = { ...originalEnv };
    await rm(tempDir, { recursive: true, force: true });
  });

  it("records provenance immutably, isolates tenants, and appends a source mutation", async () => {
    const { db, schema } = await import("@server/db");
    const { runWithRequestContext } = await import(
      "@server/infra/request-context"
    );
    const repository = await import("./competency-evidence");
    await db
      .insert(schema.tenants)
      .values({ id: "tenant-b", name: "Tenant B", slug: "tenant-b" });

    const evidence = await runWithRequestContext(
      { tenantId: "tenant_default" },
      async () => {
        const competency = await repository.createCompetency({
          name: "Communication",
        });
        return repository.recordCompetencyEvidence({
          competencyId: competency.id,
          sourceType: "story_bank",
          sourceId: "story-1",
          sourceVersion: "updated-at-1",
          extractionMethod: "manual",
          confidence: 0.8,
          evidenceExcerpt: "Explained a complex decision to stakeholders.",
        });
      },
    );
    expect(evidence.evidenceHash).toMatch(/^[a-f0-9]{64}$/);
    expect(evidence.sourceRevision).toBe("");

    await expect(
      runWithRequestContext({ tenantId: "tenant-b" }, () =>
        repository.listCompetencyEvidence(),
      ),
    ).resolves.toEqual([]);
    await expect(
      db
        .update(schema.competencyEvidence)
        .set({ confidence: 0.1 })
        .where(
          (await import("drizzle-orm")).eq(
            schema.competencyEvidence.id,
            evidence.id,
          ),
        ),
    ).rejects.toThrow("append-only");

    const changed = await runWithRequestContext(
      { tenantId: "tenant_default" },
      () =>
        repository.recordCompetencyEvidence({
          competencyId: evidence.competencyId,
          sourceType: "story_bank",
          sourceId: "story-1",
          sourceVersion: "updated-at-2",
          extractionMethod: "manual",
          confidence: 0.8,
          evidenceExcerpt: "Explained the revised decision to stakeholders.",
        }),
    );
    expect(changed.id).not.toBe(evidence.id);
    await expect(
      runWithRequestContext({ tenantId: "tenant_default" }, () =>
        repository.recordCompetencyEvidence({
          competencyId: evidence.competencyId,
          sourceType: "story_bank",
          sourceId: "story-1",
          sourceVersion: "updated-at-1",
          extractionMethod: "manual",
          confidence: 0.8,
          evidenceExcerpt: "Explained a complex decision to stakeholders.",
        }),
      ),
    ).rejects.toMatchObject({ code: "CONFLICT" });
  });

  it("requires source provenance and a bounded evidence excerpt", async () => {
    const { runWithRequestContext } = await import(
      "@server/infra/request-context"
    );
    const repository = await import("./competency-evidence");
    await runWithRequestContext({ tenantId: "tenant_default" }, async () => {
      const competency = await repository.createCompetency({
        name: "Leadership",
      });
      const invalidSourceInput = {
        competencyId: competency.id,
        sourceType: "",
        sourceId: "",
        extractionMethod: "manual",
        confidence: 1,
        evidenceExcerpt: "",
      };
      await expect(
        repository.recordCompetencyEvidence(
          invalidSourceInput as unknown as import("./competency-evidence").RecordCompetencyEvidenceInput,
        ),
      ).rejects.toMatchObject({ code: "INVALID_REQUEST" });
    });
  });

  it("keeps recorded stage-event observations after the mutable source changes or is deleted", async () => {
    const { db, schema } = await import("@server/db");
    const { eq } = await import("drizzle-orm");
    const { runWithRequestContext } = await import(
      "@server/infra/request-context"
    );
    const repository = await import("./competency-evidence");

    await db.insert(schema.jobs).values({
      id: "job-stage-event",
      tenantId: "tenant_default",
      source: "manual",
      title: "Stage event job",
      employer: "Acme",
      jobUrl: "https://example.com/stage-event",
      status: "in_progress",
    });
    await db.insert(schema.stageEvents).values({
      id: "stage-event-1",
      tenantId: "tenant_default",
      applicationId: "job-stage-event",
      title: "Technical interview",
      toStage: "technical_interview",
      occurredAt: 1_700_000_000,
      outcome: "rejected",
    });

    await runWithRequestContext({ tenantId: "tenant_default" }, async () => {
      const competency = await repository.createCompetency({
        name: "System design",
      });
      await repository.recordCompetencyEvidence({
        competencyId: competency.id,
        sourceType: "stage_event",
        sourceId: "stage-event-1",
        extractionMethod: "deterministic",
        confidence: 1,
        evidenceExcerpt: "Technical interview feedback identified a gap.",
        observationStage: "technical_interview",
        observationOutcome: "rejected",
      });

      const recorded = await repository.listOutcomeLearningRecords();
      expect(recorded).toMatchObject([
        {
          stage: "technical_interview",
          outcome: "rejected",
        },
      ]);

      await db
        .update(schema.stageEvents)
        .set({ toStage: "offer", outcome: "offer_accepted" })
        .where(eq(schema.stageEvents.id, "stage-event-1"));
      await db
        .delete(schema.stageEvents)
        .where(eq(schema.stageEvents.id, "stage-event-1"));

      await expect(
        repository.listOutcomeLearningRecords(),
      ).resolves.toMatchObject([
        {
          stage: "technical_interview",
          outcome: "rejected",
        },
      ]);
    });
  });

  it("requires valid paired observation snapshots for stage-event evidence", async () => {
    const { runWithRequestContext } = await import(
      "@server/infra/request-context"
    );
    const repository = await import("./competency-evidence");
    await runWithRequestContext({ tenantId: "tenant_default" }, async () => {
      const competency = await repository.createCompetency({
        name: "Stakeholder management",
      });
      const input = {
        competencyId: competency.id,
        sourceType: "stage_event" as const,
        sourceId: "stage-event-1",
        extractionMethod: "manual" as const,
        confidence: 0.8,
        evidenceExcerpt: "A useful observation.",
      };

      await expect(
        repository.recordCompetencyEvidence(input),
      ).rejects.toMatchObject({ code: "INVALID_REQUEST" });
      await expect(
        repository.recordCompetencyEvidence({
          ...input,
          observationStage: "not-a-stage",
          observationOutcome: "rejected",
        } as never),
      ).rejects.toMatchObject({ code: "INVALID_REQUEST" });
      await expect(
        repository.recordCompetencyEvidence({
          ...input,
          observationStage: "onsite",
          observationOutcome: "not-an-outcome",
        } as never),
      ).rejects.toMatchObject({ code: "INVALID_REQUEST" });
    });
  });
});
