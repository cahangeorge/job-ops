import { describe, expect, it, vi } from "vitest";
import { makeTailoredCvCandidate } from "@/test/factories/tailored-cv-candidate";
import * as api from "./jobs";

function response(data: unknown): Response {
  return {
    ok: true,
    status: 200,
    text: async () => JSON.stringify({ ok: true, data }),
  } as Response;
}

describe("tailored CV API client", () => {
  it("applies the preview candidate through the job workspace endpoint", async () => {
    const candidate = makeTailoredCvCandidate();
    const fetchSpy = vi.spyOn(global, "fetch").mockResolvedValue(
      response({
        revision: 4,
      }),
    );

    await api.applyTailoredCvCandidate("job-1", candidate);

    expect(fetchSpy).toHaveBeenCalledWith(
      "/api/jobs/job-1/tailored-cv-candidate/apply",
      expect.objectContaining({
        method: "POST",
        body: JSON.stringify(candidate),
      }),
    );
  });
});
