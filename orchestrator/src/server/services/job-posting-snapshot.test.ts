import { createHash } from "node:crypto";
import { describe, expect, it, vi } from "vitest";
import type { ResolvedAddress } from "./job-posting-snapshot";
import {
  createJobPostingSnapshotService,
  createPinnedLookup,
  type JobPostingSnapshotDependencies,
  JobPostingSnapshotError,
} from "./job-posting-snapshot";

const publicAddress = { address: "93.184.216.34", family: 4 as const };

function response(
  input: {
    body?: string;
    contentLength?: string;
    contentType?: string;
    status?: number;
  } = {},
): Response {
  const body =
    input.body ?? "<h1>Platform Engineer</h1><p>Build resilient systems.</p>";
  return new Response(body, {
    headers: {
      "content-length": input.contentLength ?? String(Buffer.byteLength(body)),
      "content-type": input.contentType ?? "text/html; charset=utf-8",
    },
    status: input.status ?? 200,
  });
}

function createDependencies(
  overrides: Partial<JobPostingSnapshotDependencies> = {},
): JobPostingSnapshotDependencies {
  return {
    resolveAll: vi
      .fn<() => Promise<ResolvedAddress[]>>()
      .mockResolvedValue([publicAddress]),
    extractPdfText: vi.fn().mockResolvedValue("Platform Engineer"),
    createDispatcher: vi.fn().mockReturnValue({ close: vi.fn() }),
    fetch: vi.fn().mockResolvedValue(response()),
    ...overrides,
  };
}

async function expectCode(promise: Promise<unknown>, code: string) {
  await expect(promise).rejects.toMatchObject({ code });
}

function responseWithTrackedBody(input: {
  contentLength?: string;
  contentType?: string;
  status?: number;
  pull?: UnderlyingSource<Uint8Array>["pull"];
}) {
  const events: string[] = [];
  const body = new ReadableStream<Uint8Array>({
    cancel() {
      events.push("body:cancel");
    },
    pull: input.pull,
  });
  return {
    events,
    response: {
      body,
      headers: new Headers({
        "content-length": input.contentLength ?? "0",
        "content-type": input.contentType ?? "text/plain",
      }),
      ok: (input.status ?? 200) >= 200 && (input.status ?? 200) < 300,
      status: input.status ?? 200,
    } as Response,
  };
}

describe("job posting snapshot service", () => {
  it("returns the pinned address in Node 22 lookup callback forms", () => {
    const lookup = createPinnedLookup(publicAddress);
    const hostname = "jobs.example.test";

    lookup(hostname, { all: true }, (error, addresses) => {
      expect(error).toBeNull();
      expect(addresses).toEqual([publicAddress]);
    });
    lookup(hostname, { all: false }, (error, address, family) => {
      expect(error).toBeNull();
      expect(address).toBe(publicAddress.address);
      expect(family).toBe(publicAddress.family);
    });
  });

  it.each([
    ["http URL", "http://jobs.example.test/role", "INVALID_URL"],
    ["userinfo", "https://user:pass@jobs.example.test/role", "INVALID_URL"],
    ["loopback", "https://127.0.0.1/role", "FORBIDDEN_ADDRESS"],
    [
      "link-local metadata",
      "https://169.254.169.254/role",
      "FORBIDDEN_ADDRESS",
    ],
    ["RFC1918", "https://10.0.0.1/role", "FORBIDDEN_ADDRESS"],
    ["public IP literal", "https://93.184.216.34/role", "FORBIDDEN_ADDRESS"],
    ["IPv6 loopback", "https://[::1]/role", "FORBIDDEN_ADDRESS"],
    ["IPv6 private", "https://[fd00::1]/role", "FORBIDDEN_ADDRESS"],
    ["localhost", "https://localhost/role", "FORBIDDEN_ADDRESS"],
  ])("rejects %s", async (_label, url, code) => {
    const dependencies = createDependencies();

    await expectCode(
      createJobPostingSnapshotService(dependencies).fetch(url),
      code,
    );
    expect(dependencies.fetch).not.toHaveBeenCalled();
  });

  it("rejects URLs that are too long", async () => {
    const dependencies = createDependencies();
    const url = `https://jobs.example.test/${"a".repeat(2_025)}`;

    await expectCode(
      createJobPostingSnapshotService(dependencies).fetch(url),
      "INVALID_URL",
    );
    expect(dependencies.fetch).not.toHaveBeenCalled();
  });

  it("rejects a hostname when any DNS answer is non-public", async () => {
    const dependencies = createDependencies({
      resolveAll: vi
        .fn()
        .mockResolvedValue([publicAddress, { address: "10.0.0.4", family: 4 }]),
    });

    await expectCode(
      createJobPostingSnapshotService(dependencies).fetch(
        "https://jobs.example.test/role",
      ),
      "FORBIDDEN_ADDRESS",
    );
    expect(dependencies.fetch).not.toHaveBeenCalled();
  });

  it("rejects redirects without following them", async () => {
    const dependencies = createDependencies({
      fetch: vi.fn().mockResolvedValue(response({ status: 302 })),
    });

    await expectCode(
      createJobPostingSnapshotService(dependencies).fetch(
        "https://jobs.example.test/role",
      ),
      "UPSTREAM_RESPONSE",
    );
    expect(dependencies.fetch).toHaveBeenCalledWith(
      "https://jobs.example.test/role",
      expect.objectContaining({ redirect: "error" }),
    );
  });

  it.each([
    ["a non-OK response", { status: 500 }, "UPSTREAM_RESPONSE"],
    [
      "an unsupported content type",
      { contentType: "application/json" },
      "UNSUPPORTED_CONTENT_TYPE",
    ],
    [
      "a declared oversized response",
      { contentLength: String(2 * 1024 * 1024 + 1) },
      "BODY_TOO_LARGE",
    ],
  ])("cancels %s before destroying its dispatcher", async (_label, input, code) => {
    const tracked = responseWithTrackedBody(input);
    const dispatcher = {
      close: vi.fn(() => {
        tracked.events.push("dispatcher:close");
      }),
      destroy: vi.fn(() => {
        tracked.events.push("dispatcher:destroy");
      }),
    };
    const dependencies = createDependencies({
      createDispatcher: vi.fn().mockReturnValue(dispatcher),
      fetch: vi.fn().mockResolvedValue(tracked.response),
    });

    await expectCode(
      createJobPostingSnapshotService(dependencies).fetch(
        "https://jobs.example.test/role",
      ),
      code,
    );

    expect(tracked.events).toEqual(["body:cancel", "dispatcher:destroy"]);
    expect(dispatcher.close).not.toHaveBeenCalled();
  });

  it("rejects declared and streamed oversized bodies", async () => {
    const declared = createDependencies({
      fetch: vi
        .fn()
        .mockResolvedValue(
          response({ contentLength: String(2 * 1024 * 1024 + 1) }),
        ),
    });
    await expectCode(
      createJobPostingSnapshotService(declared).fetch(
        "https://jobs.example.test/role",
      ),
      "BODY_TOO_LARGE",
    );

    const chunks = [
      new Uint8Array(1024 * 1024),
      new Uint8Array(1024 * 1024),
      new Uint8Array(1),
    ];
    const streamed = createDependencies({
      fetch: vi.fn().mockResolvedValue({
        body: new ReadableStream({
          pull(controller) {
            const chunk = chunks.shift();
            if (chunk) controller.enqueue(chunk);
            else controller.close();
          },
        }),
        headers: new Headers({ "content-type": "text/plain" }),
        ok: true,
        status: 200,
      } as Response),
    });
    await expectCode(
      createJobPostingSnapshotService(streamed).fetch(
        "https://jobs.example.test/role",
      ),
      "BODY_TOO_LARGE",
    );
  });

  it("aborts the request after its configurable timeout", async () => {
    const dependencies = createDependencies({
      fetch: vi.fn().mockImplementation(async (_url, init) => {
        await new Promise<void>((_resolve, reject) => {
          init.signal?.addEventListener("abort", () =>
            reject(init.signal?.reason),
          );
        });
        throw new Error("unreachable");
      }),
    });

    await expectCode(
      createJobPostingSnapshotService(dependencies, { timeoutMs: 1 }).fetch(
        "https://jobs.example.test/role",
      ),
      "REQUEST_TIMEOUT",
    );
  });

  it("starts the deadline before DNS and never fetches after DNS times out", async () => {
    let rejectDns: ((error: Error) => void) | undefined;
    const dependencies = createDependencies({
      resolveAll: vi.fn(
        (): Promise<ResolvedAddress[]> =>
          new Promise<ResolvedAddress[]>((_, reject) => {
            rejectDns = reject;
          }),
      ),
    });

    await expectCode(
      createJobPostingSnapshotService(dependencies, { timeoutMs: 1 }).fetch(
        "https://jobs.example.test/role",
      ),
      "REQUEST_TIMEOUT",
    );
    rejectDns?.(new Error("late DNS failure must be observed"));
    await new Promise((resolve) => setTimeout(resolve, 0));

    expect(dependencies.fetch).not.toHaveBeenCalled();
    expect(dependencies.createDispatcher).not.toHaveBeenCalled();
  });

  it("bounds PDF extraction with the remaining request deadline", async () => {
    const extractPdfText = vi.fn(() => new Promise<string>(() => undefined));
    const dispatcher = { close: vi.fn(), destroy: vi.fn() };
    const dependencies = createDependencies({
      extractPdfText,
      createDispatcher: vi.fn().mockReturnValue(dispatcher),
      fetch: vi
        .fn()
        .mockResolvedValue(
          response({ body: "%PDF-1.4", contentType: "application/pdf" }),
        ),
    });

    await expectCode(
      createJobPostingSnapshotService(dependencies, { timeoutMs: 5 }).fetch(
        "https://jobs.example.test/role",
      ),
      "REQUEST_TIMEOUT",
    );
    expect(extractPdfText).toHaveBeenCalledWith(
      expect.any(Buffer),
      expect.objectContaining({ signal: expect.any(AbortSignal) }),
    );
    expect(dispatcher.destroy).toHaveBeenCalledOnce();
    expect(dispatcher.close).not.toHaveBeenCalled();
  });

  it("returns a sanitized resource error for a complex PDF", async () => {
    const dependencies = createDependencies({
      extractPdfText: vi.fn().mockRejectedValue({ code: "RESOURCE_LIMIT" }),
      fetch: vi
        .fn()
        .mockResolvedValue(
          response({ body: "%PDF-1.4", contentType: "application/pdf" }),
        ),
    });

    const promise = createJobPostingSnapshotService(dependencies).fetch(
      "https://jobs.example.test/role",
    );
    await expectCode(promise, "BODY_TOO_LARGE");
    await expect(promise).rejects.toThrow(
      "The PDF exceeds the processing resource limit.",
    );
  });

  it("destroys the dispatcher and returns a sanitized error when close rejects", async () => {
    const dispatcher = {
      close: vi.fn().mockRejectedValue(new Error("socket cleanup details")),
      destroy: vi.fn(),
    };
    const dependencies = createDependencies({
      createDispatcher: vi.fn().mockReturnValue(dispatcher),
    });

    const promise = createJobPostingSnapshotService(dependencies).fetch(
      "https://jobs.example.test/role",
    );

    await expectCode(promise, "UPSTREAM_RESPONSE");
    await expect(promise).rejects.toThrow("The posting could not be fetched.");
    await expect(promise).rejects.not.toThrow("socket cleanup details");
    expect(dispatcher.destroy).toHaveBeenCalledOnce();
  });

  it("cancels a never-ending body and returns a sanitized timeout", async () => {
    const tracked = responseWithTrackedBody({
      pull() {
        return new Promise(() => undefined);
      },
    });
    const dispatcher = {
      close: vi.fn(),
      destroy: vi.fn(() => {
        tracked.events.push("dispatcher:destroy");
      }),
    };
    const dependencies = createDependencies({
      createDispatcher: vi.fn().mockReturnValue(dispatcher),
      fetch: vi.fn().mockResolvedValue(tracked.response),
    });

    await expectCode(
      createJobPostingSnapshotService(dependencies, { timeoutMs: 1 }).fetch(
        "https://jobs.example.test/role",
      ),
      "REQUEST_TIMEOUT",
    );

    expect(tracked.events).toEqual(["body:cancel", "dispatcher:destroy"]);
    expect(dispatcher.close).not.toHaveBeenCalled();
  });

  it("cancels a throwing body and returns a sanitized upstream error", async () => {
    const tracked = responseWithTrackedBody({
      pull(controller) {
        controller.error(new Error("upstream body details must not escape"));
      },
    });
    const dispatcher = {
      close: vi.fn(),
      destroy: vi.fn(() => {
        tracked.events.push("dispatcher:destroy");
      }),
    };
    const dependencies = createDependencies({
      createDispatcher: vi.fn().mockReturnValue(dispatcher),
      fetch: vi.fn().mockResolvedValue(tracked.response),
    });

    const promise = createJobPostingSnapshotService(dependencies).fetch(
      "https://jobs.example.test/role",
    );
    await expectCode(promise, "UPSTREAM_RESPONSE");
    await expect(promise).rejects.not.toThrow(
      "upstream body details must not escape",
    );
    expect(tracked.events).toEqual(["dispatcher:destroy"]);
    expect(dispatcher.close).not.toHaveBeenCalled();
  });

  it("rejects unsupported content types", async () => {
    const dependencies = createDependencies({
      fetch: vi
        .fn()
        .mockResolvedValue(response({ contentType: "application/json" })),
    });

    await expectCode(
      createJobPostingSnapshotService(dependencies).fetch(
        "https://jobs.example.test/role",
      ),
      "UNSUPPORTED_CONTENT_TYPE",
    );
  });

  it("pins a public HTTPS lookup while retaining the hostname and returns bounded text", async () => {
    const html = `<main><h1>Platform Engineer</h1><p>${"resilient systems ".repeat(4_000)}</p></main>`;
    const dependencies = createDependencies({
      fetch: vi.fn().mockResolvedValue(response({ body: html })),
    });

    const snapshot = await createJobPostingSnapshotService(dependencies).fetch(
      "https://jobs.example.test/role",
    );

    expect(dependencies.createDispatcher).toHaveBeenCalledWith({
      hostname: "jobs.example.test",
      address: publicAddress,
    });
    expect(dependencies.fetch).toHaveBeenCalledWith(
      "https://jobs.example.test/role",
      expect.objectContaining({
        dispatcher: expect.anything(),
        redirect: "error",
      }),
    );
    expect(snapshot).toEqual({
      url: "https://jobs.example.test/role",
      contentType: "text/html",
      text: expect.stringContaining("PLATFORM ENGINEER"),
      promptText: expect.any(String),
      sha256: createHash("sha256").update(html).digest("hex"),
    });
    expect(snapshot.text.length).toBeLessThanOrEqual(50_000);
    expect(snapshot.promptText.length).toBeLessThanOrEqual(60_000);
  });

  it("exposes only safe error metadata", () => {
    const error = new JobPostingSnapshotError("INVALID_URL", "URL is invalid.");
    expect(error).toMatchObject({
      code: "INVALID_URL",
      message: "URL is invalid.",
    });
    expect(Object.keys(error).sort()).toEqual(["code", "name"]);
  });
});
