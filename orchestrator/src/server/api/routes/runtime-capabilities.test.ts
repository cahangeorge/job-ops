import type { Server } from "node:http";
import { apiErrorHandler, requestContextMiddleware } from "@infra/http";
import { runWithRequestContext } from "@infra/request-context";
import express from "express";
import { afterEach, describe, expect, it, vi } from "vitest";

const getRuntimeCapabilities = vi.hoisted(() => vi.fn());
vi.mock("@server/services/runtime-capabilities", () => ({
  getRuntimeCapabilities,
}));

import { runtimeCapabilitiesRouter } from "./runtime-capabilities";

describe("runtime capabilities API", () => {
  const servers: Server[] = [];

  afterEach(async () => {
    await Promise.all(
      servers.splice(0).map(
        (server) => new Promise<void>((resolve) => server.close(() => resolve())),
      ),
    );
    vi.clearAllMocks();
  });

  async function setup(tenantId?: string) {
    const app = express();
    app.use(requestContextMiddleware());
    app.use((_, __, next) => runWithRequestContext({ tenantId }, next));
    app.use("/api/runtime-capabilities", runtimeCapabilitiesRouter);
    app.use(apiErrorHandler);
    const server = await new Promise<Server>((resolve) => {
      const listening = app.listen(0, () => resolve(listening));
    });
    servers.push(server);
    const address = server.address();
    if (!address || typeof address === "string") throw new Error("Expected TCP");
    return `http://127.0.0.1:${address.port}`;
  }

  it("requires a tenant context", async () => {
    const baseUrl = await setup();
    const res = await fetch(`${baseUrl}/api/runtime-capabilities`);
    expect(res.status).toBe(403);
    expect((await res.json()).error.code).toBe("FORBIDDEN");
  });

  it("uses the request tenant and returns a sanitized standard DTO", async () => {
    getRuntimeCapabilities.mockResolvedValue({
      checkedAt: "2026-07-14T10:00:00.000Z",
      capabilities: [{ id: "llm", label: "LLM", state: "healthy", reason: "Configured", apiKey: "secret-api-key" }],
    });
    const baseUrl = await setup("tenant-b");
    const res = await fetch(`${baseUrl}/api/runtime-capabilities`, {
      headers: { "x-request-id": "runtime-request" },
    });
    const body = await res.json();

    expect(res.status).toBe(200);
    expect(getRuntimeCapabilities).toHaveBeenCalledWith("tenant-b");
    expect(body).toEqual({
      ok: true,
      data: expect.objectContaining({ capabilities: expect.any(Array) }),
      meta: { requestId: "runtime-request" },
    });
    expect(JSON.stringify(body)).not.toMatch(/secret|token|api.?key/i);
  });
});
