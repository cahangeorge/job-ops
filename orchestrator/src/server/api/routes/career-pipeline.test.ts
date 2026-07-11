import type { Server } from "node:http";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { startServer, stopServer } from "./test-utils";

describe.sequential("Career pipeline projection API", () => {
  let server: Server;
  let baseUrl: string;
  let closeDb: () => void;
  let tempDir: string;

  beforeEach(async () => {
    vi.clearAllMocks();
    ({ server, baseUrl, closeDb, tempDir } = await startServer());
  });

  afterEach(async () => {
    await stopServer({ server, closeDb, tempDir });
  });

  it("returns the canonical pipeline projection in the HTTP envelope", async () => {
    const { createJob } = await import("@server/repositories/jobs");
    const { transitionStage } = await import(
      "@server/services/applicationTracking"
    );
    const job = await createJob({
      source: "manual",
      title: "Projection role",
      employer: "Acme",
      jobUrl: "https://example.com/projection-role",
      jobDescription: "Canonical projection test",
    });
    transitionStage(job.id, "technical_interview", 1_700_000_000);

    const response = await fetch(
      `${baseUrl}/api/career-ops/pipeline?stage=technical_interview&sort=title`,
      { headers: { "x-request-id": "career-pipeline-request" } },
    );
    const body = await response.json();

    expect(response.status).toBe(200);
    expect(response.headers.get("x-request-id")).toBe(
      "career-pipeline-request",
    );
    expect(body.ok).toBe(true);
    expect(body.meta.requestId).toBe("career-pipeline-request");
    expect(
      body.data.columns.find(
        (column: { stage: string }) => column.stage === "technical_interview",
      ),
    ).toMatchObject({
      cards: [
        expect.objectContaining({
          job: expect.objectContaining({ id: job.id }),
          stage: "technical_interview",
        }),
      ],
    });
  });

  it("rejects invalid projection filters using the standard error envelope", async () => {
    const response = await fetch(
      `${baseUrl}/api/career-ops/pipeline?sort=surprise`,
    );
    const body = await response.json();

    expect(response.status).toBe(400);
    expect(body.ok).toBe(false);
    expect(body.error.code).toBe("INVALID_REQUEST");
    expect(typeof body.meta.requestId).toBe("string");
  });
});
