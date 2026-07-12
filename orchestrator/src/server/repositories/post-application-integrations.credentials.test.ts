import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

describe.sequential("post-application integration credential storage", () => {
  let tempDir: string;
  let closeDb: () => void;
  let db: typeof import("@server/db").db;
  let schema: typeof import("@server/db").schema;
  let repo: typeof import("./post-application-integrations");

  const oldKey = Buffer.alloc(32, 4).toString("base64");
  const newKey = Buffer.alloc(32, 5).toString("base64");

  beforeEach(async () => {
    vi.resetModules();
    tempDir = await mkdtemp(join(tmpdir(), "post-application-credentials-"));
    process.env.DATA_DIR = tempDir;
    process.env.NODE_ENV = "test";
    process.env.POST_APPLICATION_CREDENTIALS_KEY = oldKey;
    delete process.env.POST_APPLICATION_CREDENTIALS_KEY_PREVIOUS;
    await import("@server/db/migrate");
    ({ db, schema, closeDb } = await import("@server/db"));
    repo = await import("./post-application-integrations");
  });

  afterEach(async () => {
    closeDb();
    await rm(tempDir, { recursive: true, force: true });
    delete process.env.POST_APPLICATION_CREDENTIALS_KEY;
    delete process.env.POST_APPLICATION_CREDENTIALS_KEY_PREVIOUS;
  });

  it("stores only an encrypted envelope and returns a public credential summary", async () => {
    const integration = await repo.upsertConnectedPostApplicationIntegration({
      provider: "gmail",
      accountKey: "default",
      credentials: {
        refreshToken: "fixture-refresh-token",
        accessToken: "fixture-access-token",
        email: "candidate@example.com",
      },
    });
    const [row] = await db
      .select({ credentials: schema.postApplicationIntegrations.credentials })
      .from(schema.postApplicationIntegrations);

    expect(JSON.stringify(row?.credentials)).not.toContain(
      "fixture-refresh-token",
    );
    expect(JSON.stringify(row?.credentials)).not.toContain(
      "fixture-access-token",
    );
    expect(row?.credentials).toMatchObject({ version: 1, keyId: "primary" });
    expect(integration.credentials).toEqual({
      hasRefreshToken: true,
      hasAccessToken: true,
      scope: null,
      tokenType: null,
      expiryDate: null,
      email: "candidate@example.com",
    });
  });

  it("keeps same-provider account integrations isolated by tenant", async () => {
    const { runWithRequestContext } = await import("@infra/request-context");
    await db.insert(schema.tenants).values({
      id: "tenant_other",
      name: "Other Tenant",
      slug: "other-tenant",
      createdAt: "2026-01-01T00:00:00.000Z",
      updatedAt: "2026-01-01T00:00:00.000Z",
    });

    await repo.upsertConnectedPostApplicationIntegration({
      provider: "gmail",
      accountKey: "primary",
      credentials: {
        refreshToken: "default-tenant-refresh-token",
        email: "default@example.com",
      },
    });
    await runWithRequestContext(
      { requestId: "other-tenant-connect", tenantId: "tenant_other" },
      () =>
        repo.upsertConnectedPostApplicationIntegration({
          provider: "gmail",
          accountKey: "primary",
          credentials: {
            refreshToken: "other-tenant-refresh-token",
            email: "other@example.com",
          },
        }),
    );

    await expect(
      repo.getPostApplicationIntegration("gmail", "primary"),
    ).resolves.toMatchObject({
      credentials: { email: "default@example.com" },
    });
    await expect(
      runWithRequestContext(
        { requestId: "other-tenant-status", tenantId: "tenant_other" },
        () => repo.getPostApplicationIntegration("gmail", "primary"),
      ),
    ).resolves.toMatchObject({
      credentials: { email: "other@example.com" },
    });
  });

  it("decrypts through the previous key and immediately re-encrypts with the primary key", async () => {
    await repo.upsertConnectedPostApplicationIntegration({
      provider: "gmail",
      accountKey: "default",
      credentials: { refreshToken: "rotation-fixture-token" },
    });
    process.env.POST_APPLICATION_CREDENTIALS_KEY = newKey;
    process.env.POST_APPLICATION_CREDENTIALS_KEY_PREVIOUS = oldKey;

    const internal = await repo.getPostApplicationIntegrationWithCredentials(
      "gmail",
      "default",
    );
    const [row] = await db
      .select({ credentials: schema.postApplicationIntegrations.credentials })
      .from(schema.postApplicationIntegrations);

    expect(internal?.credentials).toEqual({
      refreshToken: "rotation-fixture-token",
    });
    expect(JSON.stringify(row?.credentials)).not.toContain(
      "rotation-fixture-token",
    );
    expect(
      repo.getPostApplicationIntegrationWithCredentials("gmail", "default"),
    ).resolves.toMatchObject({
      credentials: { refreshToken: "rotation-fixture-token" },
    });
  });

  it("does not overwrite credentials from a concurrent reconnect during key rotation", async () => {
    await repo.upsertConnectedPostApplicationIntegration({
      provider: "gmail",
      accountKey: "default",
      credentials: { refreshToken: "old-refresh-token" },
    });
    process.env.POST_APPLICATION_CREDENTIALS_KEY = newKey;
    process.env.POST_APPLICATION_CREDENTIALS_KEY_PREVIOUS = oldKey;

    const originalUpdate = db.update.bind(db);
    let injectReconnect = true;
    vi.spyOn(db, "update").mockImplementation((...args) => {
      const builder = originalUpdate(...args);
      if (!injectReconnect) return builder;
      injectReconnect = false;

      const originalSet = builder.set.bind(builder);
      builder.set = (...setArgs) => {
        const update = originalSet(...setArgs);
        const originalWhere = update.where.bind(update);
        update.where = (...whereArgs) => {
          const query = originalWhere(...whereArgs);
          return new Proxy(query, {
            get(target, property, receiver) {
              if (property !== "then") {
                return Reflect.get(target, property, receiver);
              }

              return (
                onFulfilled: Parameters<PromiseLike<unknown>["then"]>[0],
                onRejected: Parameters<PromiseLike<unknown>["then"]>[1],
              ) =>
                repo
                  .upsertConnectedPostApplicationIntegration({
                    provider: "gmail",
                    accountKey: "default",
                    credentials: { refreshToken: "new-refresh-token" },
                  })
                  .then(() => target.then(onFulfilled, onRejected));
            },
          });
        };
        return update;
      };
      return builder;
    });

    await expect(
      repo.getPostApplicationIntegrationWithCredentials("gmail", "default"),
    ).resolves.toMatchObject({
      credentials: { refreshToken: "new-refresh-token" },
    });
  });

  it("fails closed when a credential write has no valid primary key", async () => {
    delete process.env.POST_APPLICATION_CREDENTIALS_KEY;

    await expect(
      repo.upsertConnectedPostApplicationIntegration({
        provider: "gmail",
        accountKey: "default",
        credentials: { refreshToken: "fixture-refresh-token" },
      }),
    ).rejects.toMatchObject({
      status: 503,
      code: "SERVICE_UNAVAILABLE",
    });
  });

  it("fails closed for a partial credential envelope instead of treating it as legacy plaintext", async () => {
    await repo.upsertConnectedPostApplicationIntegration({
      provider: "gmail",
      accountKey: "default",
      credentials: { refreshToken: "fixture-refresh-token" },
    });
    await db
      .update(schema.postApplicationIntegrations)
      .set({ credentials: { version: 1 } })
      .where(
        // The test database holds one integration in its default tenant.
        // This targets only the fixture row, not an arbitrary integration.
        (await import("drizzle-orm")).eq(
          schema.postApplicationIntegrations.accountKey,
          "default",
        ),
      );

    await expect(
      repo.getPostApplicationIntegrationWithCredentials("gmail", "default"),
    ).rejects.toMatchObject({ status: 503, code: "SERVICE_UNAVAILABLE" });
    const [row] = await db
      .select({ credentials: schema.postApplicationIntegrations.credentials })
      .from(schema.postApplicationIntegrations);
    expect(row?.credentials).toEqual({ version: 1 });
  });
});
