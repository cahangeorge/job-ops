import { describe, expect, it, vi } from "vitest";
import { collectRuntimeCapabilities } from "./runtime-capabilities";

describe("runtime capability health", () => {
  it("normalizes bounded local checks without exposing configuration values", async () => {
    const result = await collectRuntimeCapabilities("tenant-a", {
      getSettings: vi.fn().mockResolvedValue({
        llmProvider: "openai",
        llmApiKey: "secret-api-key",
        pdfRenderer: "rxresume",
        rxresumeUrl: "https://resume.example.test",
        rxresumeApiKey: "secret-resume-key",
        rxresumeBaseResumeId: "resume-123",
      }),
      getQueueHealth: vi.fn().mockResolvedValue({
        durable: true,
        worker: "running",
        pending: 0,
      }),
      getProviderStatuses: vi.fn().mockResolvedValue([
        { provider: "gmail", classification: "ready" },
        { provider: "imap", classification: "provider_unavailable" },
      ]),
      getExtractors: vi.fn().mockResolvedValue({ available: 2, expected: 2 }),
      checkPdfQa: vi.fn().mockResolvedValue(true),
    });

    expect(result.capabilities).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ id: "llm", state: "healthy" }),
        expect.objectContaining({ id: "pdf", state: "healthy" }),
        expect.objectContaining({ id: "queue", state: "healthy" }),
        expect.objectContaining({ id: "extractors", state: "healthy" }),
        expect.objectContaining({ id: "providers", state: "degraded" }),
      ]),
    );
    expect(JSON.stringify(result)).not.toMatch(
      /secret|resume-123|example\.test/i,
    );
  });

  it("reports an idle durable queue as healthy", async () => {
    const result = await collectRuntimeCapabilities("tenant-a", {
      getSettings: vi.fn().mockResolvedValue({ llmProvider: "codex" }),
      getQueueHealth: vi.fn().mockResolvedValue({
        durable: true,
        worker: "stopped",
        pending: 0,
      }),
      getProviderStatuses: vi.fn().mockResolvedValue([]),
      getExtractors: vi.fn().mockResolvedValue({ available: 1, expected: 1 }),
      checkPdfQa: vi.fn().mockResolvedValue(true),
    });

    expect(result.capabilities).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ id: "queue", state: "healthy" }),
      ]),
    );
  });

  it("contains a failed bounded dependency check as unavailable", async () => {
    const result = await collectRuntimeCapabilities("tenant-a", {
      getSettings: vi.fn().mockRejectedValue(new Error("token=do-not-leak")),
      getQueueHealth: vi.fn().mockResolvedValue({
        durable: false,
        worker: "stopped",
        pending: 0,
      }),
      getProviderStatuses: vi.fn().mockResolvedValue([]),
      getExtractors: vi.fn().mockResolvedValue({ available: 0, expected: 1 }),
      checkPdfQa: vi.fn().mockResolvedValue(false),
    });

    expect(result.capabilities).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ id: "llm", state: "unavailable" }),
        expect.objectContaining({ id: "queue", state: "unavailable" }),
        expect.objectContaining({ id: "pdf", state: "unavailable" }),
        expect.objectContaining({ id: "extractors", state: "unavailable" }),
      ]),
    );
    expect(JSON.stringify(result)).not.toMatch(/token|do-not-leak/i);
  });
});
