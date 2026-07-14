import type { Server } from "node:http";
import { apiErrorHandler, requestContextMiddleware } from "@infra/http";
import { runWithRequestContext } from "@infra/request-context";
import {
  runVersionedMigrations,
  VERSIONED_MIGRATIONS,
} from "@server/db/versionedMigrations";
import {
  __resetJobQueueForTests,
  setJobQueue,
} from "@server/infra/job-queue-registry";
import { SqliteJobQueue } from "@server/infra/job-queue-sqlite";
import Database from "better-sqlite3";
import express from "express";
import { afterEach, describe, expect, it, vi } from "vitest";

const wakeWorker = vi.hoisted(() => vi.fn().mockResolvedValue(undefined));
vi.mock("@server/services/auto-pdf-regeneration", () => ({
  wakeAutoPdfRegenerationWorker: wakeWorker,
}));

import { workflowQueueRouter } from "./workflow-queue";

describe("workflow queue API", () => {
  const databases: Database.Database[] = [];
  const servers: Server[] = [];

  afterEach(async () => {
    __resetJobQueueForTests();
    await Promise.all(
      servers
        .splice(0)
        .map(
          (server) =>
            new Promise<void>((resolve) => server.close(() => resolve())),
        ),
    );
    databases.splice(0).forEach((database) => {
      database.close();
    });
  });

  async function setup() {
    const database = new Database(":memory:");
    database.pragma("foreign_keys = ON");
    database.exec("CREATE TABLE tenants (id TEXT PRIMARY KEY)");
    database.exec("INSERT INTO tenants(id) VALUES ('tenant-a'), ('tenant-b')");
    runVersionedMigrations(
      database,
      VERSIONED_MIGRATIONS.filter(({ version }) => version >= 6),
    );
    databases.push(database);
    const queue = new SqliteJobQueue(database);
    setJobQueue(queue);
    const app = express();
    app.use(express.json());
    app.use(requestContextMiddleware());
    app.use((req, _res, next) =>
      runWithRequestContext(
        {
          tenantId: req.header("x-tenant-id") ?? "tenant-a",
          userId: "operator-should-not-be-returned",
          isSystemAdmin: req.header("x-admin") === "true",
        },
        next,
      ),
    );
    app.use("/api/workflow-queue", workflowQueueRouter);
    app.use(apiErrorHandler);
    const server = await new Promise<Server>((resolve) => {
      const listening = app.listen(0, () => resolve(listening));
    });
    servers.push(server);
    const address = server.address();
    if (!address || typeof address === "string")
      throw new Error("Expected TCP address");
    return { queue, database, baseUrl: `http://127.0.0.1:${address.port}` };
  }

  it("redacts health DTOs and requires an admin tenant-local replay", async () => {
    const { queue, baseUrl } = await setup();
    const payload = {
      tenantId: "tenant-a",
      jobId: "job-a",
      reason: "manual_refresh" as const,
      requestedAt: new Date().toISOString(),
      requestedBy: "system" as const,
    };
    await queue.enqueue("auto_pdf_regeneration", payload);
    const claim = await queue.claimNext("auto_pdf_regeneration", "worker");
    if (!claim) throw new Error("Expected claim");
    await queue.fail(claim.id, {
      tenantId: "tenant-a",
      leaseOwner: claim.leaseOwner,
      message: "token=secret-never-return",
      retryable: false,
    });

    const health = await fetch(
      `${baseUrl}/api/workflow-queue?deadLetterLimit=1`,
      {
        headers: { "x-request-id": "queue-health", "x-tenant-id": "tenant-a" },
      },
    );
    const healthBody = await health.json();
    expect(health.status).toBe(200);
    expect(healthBody.meta.requestId).toBe("queue-health");
    expect(healthBody.data.deadLetters[0]).toEqual({
      taskId: claim.id,
      queue: "auto_pdf_regeneration",
      taskType: "auto_pdf_regeneration",
      deadLetteredAt: expect.any(String),
      replayedAt: null,
    });
    expect(JSON.stringify(healthBody)).not.toMatch(/secret|token|operator/i);

    const denied = await fetch(
      `${baseUrl}/api/workflow-queue/dead-letters/${claim.id}/replay`,
      {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: "{}",
      },
    );
    expect(denied.status).toBe(403);
    expect((await denied.json()).error.code).toBe("FORBIDDEN");

    const crossTenant = await fetch(
      `${baseUrl}/api/workflow-queue/dead-letters/${claim.id}/replay`,
      {
        method: "POST",
        headers: {
          "content-type": "application/json",
          "x-admin": "true",
          "x-tenant-id": "tenant-b",
        },
        body: "{}",
      },
    );
    expect(crossTenant.status).toBe(404);

    const replay = await fetch(
      `${baseUrl}/api/workflow-queue/dead-letters/${claim.id}/replay`,
      {
        method: "POST",
        headers: {
          "content-type": "application/json",
          "x-admin": "true",
          "x-request-id": "queue-replay",
        },
        body: "{}",
      },
    );
    const replayBody = await replay.json();
    expect(replay.status).toBe(200);
    expect(replayBody).toMatchObject({
      ok: true,
      meta: { requestId: "queue-replay" },
    });
    expect(wakeWorker).toHaveBeenCalledTimes(1);
    const replayClaim = await queue.claimNext(
      "auto_pdf_regeneration",
      "worker",
    );
    expect(replayClaim?.id).toBe(replayBody.data.replayTaskId);
    if (!replayClaim) throw new Error("Expected replay task claim");
    await queue.complete(replayClaim.id, {
      tenantId: "tenant-a",
      leaseOwner: replayClaim.leaseOwner,
    });

    const duplicate = await fetch(
      `${baseUrl}/api/workflow-queue/dead-letters/${claim.id}/replay`,
      {
        method: "POST",
        headers: { "content-type": "application/json", "x-admin": "true" },
        body: "{}",
      },
    );
    expect(duplicate.status).toBe(409);
    expect((await duplicate.json()).error.code).toBe("CONFLICT");
  });
});
