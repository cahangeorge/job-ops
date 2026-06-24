import type { Server } from "node:http";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { startServer, stopServer } from "./test-utils";

const checkPostingLivenessMock = vi.fn();

vi.mock("@server/services/liveness", () => ({
  checkPostingLiveness: checkPostingLivenessMock,
}));

describe.sequential("Liveness API routes", () => {
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

  it("checks posting liveness, persists the result, and returns the API contract", async () => {
    const { createJob, getJobById } = await import("@server/repositories/jobs");

    const job = await createJob({
      source: "manual",
      title: "Liveness Role",
      employer: "Acme",
      jobUrl: "https://example.com/jobs/liveness-role",
      applicationLink: "https://example.com/apply/liveness-role",
      jobDescription: "Check whether this role is still open",
    });

    checkPostingLivenessMock.mockResolvedValue({
      status: "live",
      checkedAt: 1_800_000_000_000,
      reason: "Apply signal found",
    });

    const res = await fetch(`${baseUrl}/api/liveness/jobs/${job.id}/check`, {
      method: "POST",
      headers: { "x-request-id": "req-liveness-1" },
    });
    const body = await res.json();

    expect(res.status).toBe(200);
    expect(res.headers.get("x-request-id")).toBe("req-liveness-1");
    expect(body).toMatchObject({
      ok: true,
      data: {
        status: "live",
        checkedAt: 1_800_000_000_000,
        reason: "Apply signal found",
      },
      meta: {
        requestId: "req-liveness-1",
      },
    });
    expect(checkPostingLivenessMock).toHaveBeenCalledWith(
      "https://example.com/apply/liveness-role",
    );

    const updated = await getJobById(job.id);
    expect(updated?.postingLivenessStatus).toBe("live");
    expect(updated?.postingLivenessCheckedAt).toBe(1_800_000_000_000);
    expect(updated?.postingLivenessReason).toBe("Apply signal found");
  });

  it("stores an uncertain result when a job has no application or job url", async () => {
    const { createJob, getJobById } = await import("@server/repositories/jobs");

    const job = await createJob({
      source: "manual",
      title: "No URL Role",
      employer: "Acme",
      jobUrl: "https://example.com/jobs/no-url-role",
      jobDescription: "Missing outbound link",
    });
    const { db } = await import("@server/db");
    const { jobs } = await import("@server/db/schema");
    const { eq } = await import("drizzle-orm");

    await db
      .update(jobs)
      .set({
        jobUrl: "",
        applicationLink: null,
      })
      .where(eq(jobs.id, job.id));

    const res = await fetch(`${baseUrl}/api/liveness/jobs/${job.id}/check`, {
      method: "POST",
    });
    const body = await res.json();

    expect(res.status).toBe(200);
    expect(body.ok).toBe(true);
    expect(body.data.status).toBe("uncertain");
    expect(body.data.reason).toBe("No job URL available");
    expect(checkPostingLivenessMock).not.toHaveBeenCalled();

    const updated = await getJobById(job.id);
    expect(updated?.postingLivenessStatus).toBe("uncertain");
    expect(updated?.postingLivenessReason).toBe("No job URL available");
  });

  it("returns not found for missing jobs", async () => {
    const res = await fetch(`${baseUrl}/api/liveness/jobs/missing/check`, {
      method: "POST",
    });
    const body = await res.json();

    expect(res.status).toBe(404);
    expect(body.ok).toBe(false);
    expect(body.error.code).toBe("NOT_FOUND");
  });
});
