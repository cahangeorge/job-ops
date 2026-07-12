import type { Server } from "node:http";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { startServer, stopServer } from "./test-utils";

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
});
