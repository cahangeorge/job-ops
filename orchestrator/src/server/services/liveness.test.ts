import { describe, expect, it, vi } from "vitest";
import {
  checkPostingLiveness,
  verifyPostingWithCamoufoxRest,
} from "./liveness";

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

  it("uses the Camoufox verification flow when static HTTP has no clear signal", async () => {
    const fetchMock = vi.fn().mockResolvedValue({
      ok: true,
      status: 200,
      text: async () => "<html><div id=app></div></html>",
    });
    const browserVerifier = vi.fn().mockResolvedValue({
      html: "<html><button>Apply for this job</button></html>",
      finalUrl: "https://example.com/job/apply",
      title: "Rendered role",
    });

    const result = await checkPostingLiveness("https://example.com/job", {
      browserVerifier,
      fetchImpl: fetchMock as typeof fetch,
      now: () => 1_800_000_000_000,
    });

    expect(browserVerifier).toHaveBeenCalledWith("https://example.com/job");
    expect(result.status).toBe("live");
    expect(result.reason).toContain("Camoufox");
    expect(result.reason).toContain("Apply");
  });

  it("does not launch Camoufox for definitive HTTP expired responses", async () => {
    const fetchMock = vi.fn().mockResolvedValue({
      ok: false,
      status: 404,
      text: async () => "Not found",
    });
    const browserVerifier = vi.fn();

    const result = await checkPostingLiveness("https://example.com/job", {
      browserVerifier,
      fetchImpl: fetchMock as typeof fetch,
      now: () => 1_800_000_000_000,
    });

    expect(result.status).toBe("expired");
    expect(browserVerifier).not.toHaveBeenCalled();
  });

  it("keeps the result uncertain when Camoufox verification also fails", async () => {
    const fetchMock = vi.fn().mockResolvedValue({
      ok: true,
      status: 200,
      text: async () => "<html>loading</html>",
    });
    const browserVerifier = vi
      .fn()
      .mockRejectedValue(new Error("browser timeout"));

    const result = await checkPostingLiveness("https://example.com/job", {
      browserVerifier,
      fetchImpl: fetchMock as typeof fetch,
      now: () => 1_800_000_000_000,
    });

    expect(result.status).toBe("uncertain");
    expect(result.reason).toContain("Camoufox verification failed");
    expect(result.reason).toContain("browser timeout");
  });
});

describe("verifyPostingWithCamoufoxRest", () => {
  it("creates a tab, evaluates the rendered DOM, and closes the tab", async () => {
    const fetchMock = vi.fn(
      async (input: RequestInfo | URL, init?: RequestInit) => {
        const url = String(input);
        if (url === "http://camoufox.test/tabs" && init?.method === "POST") {
          return Response.json({
            tabId: "tab-1",
            url: "https://example.com/job",
            title: "Loading",
          });
        }
        if (
          url === "http://camoufox.test/tabs/tab-1/evaluate" &&
          init?.method === "POST"
        ) {
          return Response.json({
            ok: true,
            result: {
              html: "<html><button>Apply now</button></html>",
              finalUrl: "https://example.com/job",
              title: "Rendered job",
            },
          });
        }
        if (
          url === "http://camoufox.test/tabs/tab-1?userId=jobops-liveness" &&
          init?.method === "DELETE"
        ) {
          return Response.json({ ok: true });
        }
        throw new Error(`Unexpected request: ${init?.method ?? "GET"} ${url}`);
      },
    );

    const rendered = await verifyPostingWithCamoufoxRest(
      "https://example.com/job",
      {
        baseUrl: "http://camoufox.test",
        fetchImpl: fetchMock as typeof fetch,
        timeoutMs: 1_000,
      },
    );

    expect(rendered).toEqual({
      html: "<html><button>Apply now</button></html>",
      finalUrl: "https://example.com/job",
      title: "Rendered job",
    });
    expect(fetchMock).toHaveBeenCalledTimes(3);
  });
});
