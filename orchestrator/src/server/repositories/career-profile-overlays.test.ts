import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

describe.sequential("career profile overlay repository", () => {
  const originalEnv = { ...process.env };
  let tempDir: string;
  let closeDb: (() => void) | null = null;

  beforeEach(async () => {
    tempDir = await mkdtemp(join(tmpdir(), "job-ops-career-profile-overlay-"));
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

  it("merges only provided sections and prevents cross-tenant reads or updates", async () => {
    const { db, schema } = await import("@server/db");
    const { runWithRequestContext } = await import(
      "@server/infra/request-context"
    );
    const repository = await import("./career-profile-overlays");

    await db.insert(schema.tenants).values({
      id: "tenant-alt",
      name: "Alternative tenant",
      slug: "alternative-tenant",
    });

    const created = await runWithRequestContext(
      { tenantId: "tenant_default" },
      () =>
        repository.updateCareerProfileOverlay({
          expectedUpdatedAt: null,
          preferences: { roles: ["Platform Engineer"] },
          targets: { companies: ["Acme"] },
        }),
    );

    const merged = await runWithRequestContext(
      { tenantId: "tenant_default" },
      () =>
        repository.updateCareerProfileOverlay({
          expectedUpdatedAt: created.updatedAt,
          constraints: { requiresVisaSponsorship: true },
        }),
    );
    expect(merged.preferences).toEqual({ roles: ["Platform Engineer"] });
    expect(merged.targets).toEqual({ companies: ["Acme"] });
    expect(merged.constraints).toEqual({ requiresVisaSponsorship: true });

    await expect(
      runWithRequestContext({ tenantId: "tenant-alt" }, () =>
        repository.getCareerProfileOverlay(),
      ),
    ).resolves.toBeNull();
    await expect(
      runWithRequestContext({ tenantId: "tenant-alt" }, () =>
        repository.updateCareerProfileOverlay({
          expectedUpdatedAt: merged.updatedAt,
          preferences: { roles: ["Leaked role"] },
        }),
      ),
    ).rejects.toMatchObject({ code: "NOT_FOUND" });
  });

  it("rejects stale updates and only deletes the active tenant overlay", async () => {
    const { db, schema } = await import("@server/db");
    const { runWithRequestContext } = await import(
      "@server/infra/request-context"
    );
    const repository = await import("./career-profile-overlays");

    await db.insert(schema.tenants).values({
      id: "tenant-alt",
      name: "Alternative tenant",
      slug: "alternative-tenant",
    });
    const create = (tenantId: string, role: string) =>
      runWithRequestContext({ tenantId }, () =>
        repository.updateCareerProfileOverlay({
          expectedUpdatedAt: null,
          preferences: { roles: [role] },
        }),
      );
    const defaultOverlay = await create("tenant_default", "Engineer");
    const altOverlay = await create("tenant-alt", "Designer");

    const updated = await runWithRequestContext(
      { tenantId: "tenant_default" },
      () =>
        repository.updateCareerProfileOverlay({
          expectedUpdatedAt: defaultOverlay.updatedAt,
          targets: { companies: ["Acme"] },
        }),
    );
    await expect(
      runWithRequestContext({ tenantId: "tenant_default" }, () =>
        repository.updateCareerProfileOverlay({
          expectedUpdatedAt: defaultOverlay.updatedAt,
          targets: { companies: ["Other"] },
        }),
      ),
    ).rejects.toMatchObject({ code: "CONFLICT" });

    await runWithRequestContext({ tenantId: "tenant_default" }, () =>
      repository.deleteCareerProfileOverlay(updated.updatedAt),
    );
    await expect(
      runWithRequestContext({ tenantId: "tenant_default" }, () =>
        repository.getCareerProfileOverlay(),
      ),
    ).resolves.toBeNull();
    await expect(
      runWithRequestContext({ tenantId: "tenant-alt" }, () =>
        repository.getCareerProfileOverlay(),
      ),
    ).resolves.toMatchObject({ updatedAt: altOverlay.updatedAt });
  });
});
