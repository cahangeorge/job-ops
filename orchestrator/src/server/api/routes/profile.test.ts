import type { Server } from "node:http";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { startServer, stopServer } from "./test-utils";

// Mock the RxResume adapter service
vi.mock("@server/services/rxresume", () => ({
  clearRxResumeResumeCache: vi.fn(),
  getResume: vi.fn(),
  RxResumeAuthConfigError: class RxResumeAuthConfigError extends Error {
    constructor() {
      super("Reactive Resume credentials not configured.");
      this.name = "RxResumeAuthConfigError";
    }
  },
}));

// Mock the profile service
vi.mock("@server/services/profile", () => ({
  getProfile: vi.fn(),
  clearProfileCache: vi.fn(),
}));

// Mock the settings repository
vi.mock("@server/repositories/settings", async (importOriginal) => {
  const original = (await importOriginal()) as Record<string, unknown>;
  return {
    ...original,
    getSetting: vi.fn(),
  };
});

import { getSetting } from "@server/repositories/settings";
import { getProfile } from "@server/services/profile";
import { getResume, RxResumeAuthConfigError } from "@server/services/rxresume";

describe.sequential("Profile API routes", () => {
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

  describe("GET /api/profile/projects", () => {
    it("returns projects when profile is configured", async () => {
      const mockProfile = {
        sections: {
          projects: {
            items: [
              {
                id: "proj1",
                name: "Project 1",
                description: "Desc 1",
                summary: "Summary 1",
                date: "2024",
                visible: true,
              },
              {
                id: "proj2",
                name: "Project 2",
                description: "Desc 2",
                summary: "Summary 2",
                date: "2023",
                visible: false,
              },
            ],
          },
        },
      };
      vi.mocked(getProfile).mockResolvedValue(mockProfile);

      const res = await fetch(`${baseUrl}/api/profile/projects`);
      const body = await res.json();

      expect(res.ok).toBe(true);
      expect(body.ok).toBe(true);
      expect(Array.isArray(body.data)).toBe(true);
      expect(body.data.length).toBe(2);
    });

    it("returns error when profile is not configured", async () => {
      vi.mocked(getProfile).mockRejectedValue(
        new Error("Base resume not configured."),
      );

      const res = await fetch(`${baseUrl}/api/profile/projects`);
      const body = await res.json();

      expect(res.ok).toBe(false);
      expect(body.ok).toBe(false);
      expect(body.error.message).toContain("Base resume not configured");
    });

    it("returns demo project catalog in demo mode", async () => {
      const demoServer = await startServer({
        env: {
          DEMO_MODE: "true",
          BASIC_AUTH_USER: "",
          BASIC_AUTH_PASSWORD: "",
        },
      });
      try {
        vi.mocked(getProfile).mockRejectedValue(
          new Error("should not be used"),
        );

        const res = await fetch(`${demoServer.baseUrl}/api/profile/projects`);
        const body = await res.json();

        expect(res.ok).toBe(true);
        expect(body.ok).toBe(true);
        expect(Array.isArray(body.data)).toBe(true);
        expect(body.data.length).toBeGreaterThan(0);
        expect(body.data[0]).toMatchObject({
          id: expect.any(String),
          name: expect.any(String),
        });
      } finally {
        await stopServer(demoServer);
      }
    });
  });

  describe("GET /api/profile", () => {
    it("returns full profile when configured", async () => {
      const mockProfile = {
        basics: { name: "Test User", headline: "Developer" },
        sections: { summary: { content: "A summary" } },
      };
      vi.mocked(getProfile).mockResolvedValue(mockProfile);

      const res = await fetch(`${baseUrl}/api/profile`);
      const body = await res.json();

      expect(res.ok).toBe(true);
      expect(body.ok).toBe(true);
      expect(body.data).toEqual(mockProfile);
    });

    it("returns error when profile is not configured", async () => {
      vi.mocked(getProfile).mockRejectedValue(
        new Error("Base resume not configured."),
      );

      const res = await fetch(`${baseUrl}/api/profile`);
      const body = await res.json();

      expect(res.ok).toBe(false);
      expect(body.ok).toBe(false);
      expect(body.error.message).toContain("Base resume not configured");
    });
  });

  describe("career profile overlay", () => {
    it("blocks overlay writes in the public demo with blocked reason metadata", async () => {
      const demoServer = await startServer({
        env: {
          DEMO_MODE: "true",
          BASIC_AUTH_USER: "",
          BASIC_AUTH_PASSWORD: "",
        },
      });
      try {
        for (const [method, body] of [
          [
            "PATCH",
            {
              expectedUpdatedAt: null,
              preferences: { roles: ["Platform Engineer"] },
            },
          ],
          ["DELETE", { expectedUpdatedAt: "2026-01-01T00:00:00.000Z" }],
        ] as const) {
          const response = await fetch(
            `${demoServer.baseUrl}/api/profile/overlay`,
            {
              method,
              headers: { "Content-Type": "application/json" },
              body: JSON.stringify(body),
            },
          );
          const responseBody = await response.json();

          expect(response.status).toBe(403);
          expect(responseBody).toMatchObject({
            ok: false,
            error: {
              code: "FORBIDDEN",
              details: { blockedReason: expect.stringContaining("disabled") },
            },
            meta: { blockedReason: expect.stringContaining("disabled") },
          });
        }
      } finally {
        await stopServer(demoServer);
      }
    });

    it("keeps the canonical profile unchanged while reading and merging a bounded overlay", async () => {
      const canonicalProfile = { basics: { name: "Canonical User" } };
      vi.mocked(getProfile).mockResolvedValue(canonicalProfile);

      const canonicalResponse = await fetch(`${baseUrl}/api/profile`);
      expect((await canonicalResponse.json()).data).toEqual(canonicalProfile);

      const initial = await fetch(`${baseUrl}/api/profile/overlay`);
      expect((await initial.json()).data).toBeNull();

      const create = await fetch(`${baseUrl}/api/profile/overlay`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          expectedUpdatedAt: null,
          preferences: { roles: ["Platform Engineer"] },
          targets: { companies: ["Acme"] },
        }),
      });
      const created = await create.json();
      expect(create.status).toBe(200);
      expect(created.data).toMatchObject({
        preferences: { roles: ["Platform Engineer"] },
        targets: { companies: ["Acme"] },
      });

      const merge = await fetch(`${baseUrl}/api/profile/overlay`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          expectedUpdatedAt: created.data.updatedAt,
          constraints: { requiresVisaSponsorship: true },
        }),
      });
      const merged = await merge.json();
      expect(merged.data).toMatchObject({
        preferences: { roles: ["Platform Engineer"] },
        targets: { companies: ["Acme"] },
        constraints: { requiresVisaSponsorship: true },
      });

      const persisted = await fetch(`${baseUrl}/api/profile/overlay`);
      expect((await persisted.json()).data).toEqual(merged.data);
    });

    it("rejects unwhitelisted payloads, stale writes, and safely resets an overlay", async () => {
      const invalid = await fetch(`${baseUrl}/api/profile/overlay`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          expectedUpdatedAt: null,
          preferences: { salary: "unbounded" },
        }),
      });
      expect(invalid.status).toBe(400);
      expect((await invalid.json()).error.code).toBe("INVALID_REQUEST");

      const create = await fetch(`${baseUrl}/api/profile/overlay`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          expectedUpdatedAt: null,
          constraints: { minimumSalary: 100000 },
        }),
      });
      const created = await create.json();
      const update = await fetch(`${baseUrl}/api/profile/overlay`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          expectedUpdatedAt: created.data.updatedAt,
          provenance: { source: "manual" },
        }),
      });
      const updated = await update.json();

      const stale = await fetch(`${baseUrl}/api/profile/overlay`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          expectedUpdatedAt: created.data.updatedAt,
          targets: { companies: ["Stale Corp"] },
        }),
      });
      expect(stale.status).toBe(409);
      expect((await stale.json()).error.code).toBe("CONFLICT");

      const reset = await fetch(`${baseUrl}/api/profile/overlay`, {
        method: "DELETE",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ expectedUpdatedAt: updated.data.updatedAt }),
      });
      expect(reset.status).toBe(200);
      expect((await reset.json()).data).toEqual({ reset: true });

      const afterReset = await fetch(`${baseUrl}/api/profile/overlay`);
      expect((await afterReset.json()).data).toBeNull();
    });
  });

  describe("GET /api/profile/status", () => {
    it("returns exists: false when rxresumeBaseResumeId is not configured", async () => {
      vi.mocked(getSetting).mockResolvedValue(null);

      const res = await fetch(`${baseUrl}/api/profile/status`);
      const body = await res.json();

      expect(res.ok).toBe(true);
      expect(body.ok).toBe(true);
      expect(body.data.exists).toBe(false);
      expect(body.data.error).toContain("No base resume selected");
    });

    it("returns exists: true when resume is accessible", async () => {
      vi.mocked(getSetting).mockResolvedValue("test-resume-id");
      vi.mocked(getResume).mockResolvedValue({
        id: "test-resume-id",
        data: { basics: { name: "Test" } },
      } as any);

      const res = await fetch(`${baseUrl}/api/profile/status`);
      const body = await res.json();

      expect(res.ok).toBe(true);
      expect(body.ok).toBe(true);
      expect(body.data.exists).toBe(true);
      expect(body.data.error).toBeNull();
    });

    it("returns exists: false when RxResume credentials are missing", async () => {
      vi.mocked(getSetting).mockResolvedValue("test-resume-id");
      vi.mocked(getResume).mockRejectedValue(
        new (RxResumeAuthConfigError as unknown as new () => Error)(),
      );

      const res = await fetch(`${baseUrl}/api/profile/status`);
      const body = await res.json();

      expect(res.ok).toBe(true);
      expect(body.ok).toBe(true);
      expect(body.data.exists).toBe(false);
      expect(body.data.error).toContain("credentials not configured");
    });

    it("returns exists: false when resume data is empty", async () => {
      vi.mocked(getSetting).mockResolvedValue("test-resume-id");
      vi.mocked(getResume).mockResolvedValue({
        id: "test-resume-id",
        data: null,
      } as any);

      const res = await fetch(`${baseUrl}/api/profile/status`);
      const body = await res.json();

      expect(res.ok).toBe(true);
      expect(body.ok).toBe(true);
      expect(body.data.exists).toBe(false);
      expect(body.data.error).toContain("empty or invalid");
    });
  });

  // Note: POST /api/profile/refresh tests skipped because basic auth blocks POST in test environment
  // The endpoint is tested indirectly through the profile service tests
});
