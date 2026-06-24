import { describe, expect, it, vi } from "vitest";
import { checkPostingLiveness } from "./liveness";

describe("checkPostingLiveness", () => {
  it("returns live when the posting page responds with apply signals", async () => {
    const fetchMock = vi.fn().mockResolvedValue({
      ok: true,
      status: 200,
      text: async () => "<html><button>Apply now</button></html>",
    });

    const result = await checkPostingLiveness("https://example.com/job", {
      fetchImpl: fetchMock as typeof fetch,
      now: () => 1_800_000_000_000,
    });

    expect(result.status).toBe("live");
    expect(result.checkedAt).toBe(1_800_000_000_000);
    expect(result.reason).toContain("Apply");
  });

  it("returns expired when the page contains closed posting signals", async () => {
    const fetchMock = vi.fn().mockResolvedValue({
      ok: true,
      status: 200,
      text: async () => "This job posting is no longer available",
    });

    const result = await checkPostingLiveness("https://example.com/job", {
      fetchImpl: fetchMock as typeof fetch,
      now: () => 1_800_000_000_000,
    });

    expect(result.status).toBe("expired");
    expect(result.reason).toContain("closed");
  });

  it("returns uncertain for network errors", async () => {
    const fetchMock = vi.fn().mockRejectedValue(new Error("timeout"));

    const result = await checkPostingLiveness("https://example.com/job", {
      fetchImpl: fetchMock as typeof fetch,
      now: () => 1_800_000_000_000,
    });

    expect(result.status).toBe("uncertain");
    expect(result.reason).toContain("timeout");
  });
});
