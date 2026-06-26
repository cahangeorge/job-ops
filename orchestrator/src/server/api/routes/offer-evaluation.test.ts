import type { Server } from "node:http";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { startServer, stopServer } from "./test-utils";

describe.sequential("Offer evaluation API routes", () => {
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

  it("evaluates an offer, saves a note, and returns the result", async () => {
    const { createJob, getJobNotes } = await import(
      "@server/repositories/jobs"
    );

    const job = await createJob({
      source: "manual",
      title: "Frontend Engineer",
      employer: "Acme Labs",
      jobUrl: "https://example.com/jobs/frontend-engineer",
      applicationLink: "https://example.com/apply/frontend-engineer",
      salary: "$150,000",
      jobDescription: "Offer stage role with compensation details.",
    });

    const res = await fetch(`${baseUrl}/api/offer-evaluation/jobs/${job.id}`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "x-request-id": "req-offer-eval-1",
      },
      body: JSON.stringify({
        offeredSalary: "$138,000",
        benefits: "remote, equity",
        deadline: "2026-08-01",
        competingOffers: "Another offer around $145,000",
        dealBreakers: ["must stay remote"],
      }),
    });
    const body = await res.json();

    expect(res.status).toBe(200);
    expect(res.headers.get("x-request-id")).toBe("req-offer-eval-1");
    expect(body).toMatchObject({
      ok: true,
      data: {
        evaluation: {
          recommendation: "negotiate",
        },
        note: {
          title: "Offer evaluation — Acme Labs",
        },
      },
      meta: {
        requestId: "req-offer-eval-1",
      },
    });
    expect(body.data.evaluation.score).toBeGreaterThanOrEqual(55);
    expect(body.data.note.content).toContain("## Risks");
    expect(body.data.note.content).toContain("## Negotiation angle");

    const notes = await getJobNotes(job.id);
    expect(notes).toHaveLength(1);
    expect(notes[0].title).toBe("Offer evaluation — Acme Labs");
  });

  it("returns not found for missing jobs", async () => {
    const res = await fetch(
      `${baseUrl}/api/offer-evaluation/jobs/missing-job`,
      {
        method: "POST",
      },
    );
    const body = await res.json();

    expect(res.status).toBe(404);
    expect(body.ok).toBe(false);
    expect(body.error.code).toBe("NOT_FOUND");
  });
});
