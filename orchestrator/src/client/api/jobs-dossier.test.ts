import { describe, expect, it, vi } from "vitest";
import * as api from "./jobs";

function response(data: unknown): Response {
  return {
    ok: true,
    status: 200,
    text: async () => JSON.stringify({ ok: true, data }),
  } as Response;
}

describe("job dossier API client", () => {
  it("loads the server-sanitized dossier DTO without parsing snapshots", async () => {
    const fetchSpy = vi.spyOn(global, "fetch").mockResolvedValue(
      response({
        dossier: { id: "dossier-1", lifecycleState: "draft" },
        posting: {
          id: "posting-1",
          retrievedAt: "2026-01-01T10:00:00.000Z",
          hashPrefix: "aaaaaaaa",
        },
        revisions: [],
        submittedArtifacts: [],
        hasMore: { revisions: false, submittedArtifacts: false },
      }),
    );

    await expect(api.getJobDossier("job-1")).resolves.toMatchObject({
      dossier: { id: "dossier-1", lifecycleState: "draft" },
      posting: { hashPrefix: "aaaaaaaa" },
    });

    expect(fetchSpy).toHaveBeenCalledWith(
      "/api/jobs/job-1/dossier",
      expect.anything(),
    );
  });

  it("posts only manual content and selected Story Bank IDs", async () => {
    const fetchSpy = vi.spyOn(global, "fetch").mockResolvedValue(
      response({
        dossier: { id: "dossier-1", lifecycleState: "pending_approval" },
        revision: { id: "revision-1", revisionNumber: 1 },
        posting: {
          id: "posting-1",
          retrievedAt: "2026-01-01T10:00:00.000Z",
          hashPrefix: "aaaaaaaa",
        },
      }),
    );
    const input = { content: "A human-authored draft.", storyIds: ["story-1"] };

    await api.createJobDossierDraft("job-1", input);

    expect(fetchSpy).toHaveBeenCalledWith(
      "/api/jobs/job-1/dossier/drafts",
      expect.objectContaining({
        method: "POST",
        body: JSON.stringify(input),
      }),
    );
  });
});
