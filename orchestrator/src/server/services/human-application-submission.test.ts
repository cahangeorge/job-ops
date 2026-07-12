import { createHash } from "node:crypto";
import { describe, expect, it, vi } from "vitest";

vi.mock("pdf-parse", () => ({
  default: vi.fn(),
}));

import pdfParse from "pdf-parse";
import { inspectSubmissionPdf } from "./human-application-submission";

describe("submission PDF QA", () => {
  it("requires a PDF text layer and verifies the supplied working hash", async () => {
    const bytes = Buffer.from("%PDF-1.4 test");
    vi.mocked(pdfParse).mockResolvedValue({ text: "Ada Lovelace" } as never);
    const sha256 = createHash("sha256").update(bytes).digest("hex");

    await expect(inspectSubmissionPdf(bytes, sha256)).resolves.toEqual({
      sha256,
      byteSize: bytes.byteLength,
      qaResult: "passed",
    });
    await expect(inspectSubmissionPdf(bytes, "0".repeat(64))).rejects.toThrow(
      "Working PDF changed",
    );

    vi.mocked(pdfParse).mockResolvedValue({ text: "   " } as never);
    await expect(inspectSubmissionPdf(bytes, sha256)).rejects.toThrow(
      "text layer",
    );
  });
});
