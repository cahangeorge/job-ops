import { spawn } from "node:child_process";
import JSZip from "jszip";

const MAX_PDF_BYTES = 2 * 1024 * 1024;
const MAX_PDF_PAGES = 100;
const MAX_PDF_TEXT_LENGTH = 50_000;
const PDF_PARSER_LIMITER = "/usr/bin/prlimit";

export const PDF_PARSER_RESOURCE_LIMITS = {
  data: 128 * 1024 * 1024,
  cpu: 5,
  nofile: 64,
  fsize: 8 * 1024 * 1024,
  stack: 8 * 1024 * 1024,
} as const;

export type DocxTextExtractionErrorCode = "INVALID_DOCX" | "MISSING_DOCUMENT";
export type PdfTextExtractionErrorCode =
  | "EMPTY_TEXT"
  | "INVALID_PDF"
  | "PROCESSING_TIMEOUT"
  | "RESOURCE_LIMIT";

export class DocxTextExtractionError extends Error {
  code: DocxTextExtractionErrorCode;

  constructor(code: DocxTextExtractionErrorCode, message: string) {
    super(message);
    this.name = "DocxTextExtractionError";
    this.code = code;
  }
}

export class PdfTextExtractionError extends Error {
  code: PdfTextExtractionErrorCode;

  constructor(code: PdfTextExtractionErrorCode, message: string) {
    super(message);
    this.name = "PdfTextExtractionError";
    this.code = code;
  }
}

export function buildPdfParserCommand(
  limiterPath = PDF_PARSER_LIMITER,
  nodePath = process.execPath,
): { command: string; args: string[] } {
  const limits = PDF_PARSER_RESOURCE_LIMITS;
  return {
    command: limiterPath,
    args: [
      `--data=${limits.data}:${limits.data}`,
      `--cpu=${limits.cpu}:${limits.cpu}`,
      `--nofile=${limits.nofile}:${limits.nofile}`,
      `--fsize=${limits.fsize}:${limits.fsize}`,
      `--stack=${limits.stack}:${limits.stack}`,
      "--",
      nodePath,
      "--max-old-space-size=64",
      "--input-type=module",
      "--eval",
      PDF_WORKER_SOURCE,
    ],
  };
}

function decodeXmlEntities(value: string): string {
  return value.replace(
    /&(?:#x([0-9a-fA-F]+)|#([0-9]+)|amp|lt|gt|quot|apos);/g,
    (match, hex, dec) => {
      if (hex) return String.fromCodePoint(Number.parseInt(hex, 16));
      if (dec) return String.fromCodePoint(Number.parseInt(dec, 10));
      switch (match) {
        case "&amp;":
          return "&";
        case "&lt;":
          return "<";
        case "&gt;":
          return ">";
        case "&quot;":
          return '"';
        case "&apos;":
          return "'";
        default:
          return match;
      }
    },
  );
}

export function normalizeDocxXmlText(xml: string): string {
  return decodeXmlEntities(
    xml
      .replace(/<w:tab\b[^>]*\/>/g, "\t")
      .replace(/<w:br\b[^>]*\/>/g, "\n")
      .replace(/<w:cr\b[^>]*\/>/g, "\n")
      .replace(/<\/w:p>/g, "\n")
      .replace(/<\/w:tr>/g, "\n")
      .replace(/<\/w:tc>/g, "\t")
      .replace(/<w:t\b[^>]*>/g, "")
      .replace(/<\/w:t>/g, "")
      .replace(/<[^>]+>/g, ""),
  )
    .replace(/\r\n?/g, "\n")
    .replace(/[ \t]+\n/g, "\n")
    .replace(/\n{3,}/g, "\n\n")
    .trim();
}

export async function extractDocxText(buffer: Buffer): Promise<string> {
  let zip: JSZip;
  try {
    zip = await JSZip.loadAsync(buffer);
  } catch {
    throw new DocxTextExtractionError(
      "INVALID_DOCX",
      "DOCX file could not be read.",
    );
  }

  const documentXml = zip.file("word/document.xml");
  if (!documentXml) {
    throw new DocxTextExtractionError(
      "MISSING_DOCUMENT",
      "DOCX file is missing document content.",
    );
  }

  const xml = await documentXml.async("string");
  return normalizeDocxXmlText(xml);
}

export async function extractPdfText(buffer: Buffer): Promise<string> {
  try {
    const { default: pdfParse } = await import("pdf-parse");
    const data = (await pdfParse(buffer)) as { text?: string };
    const text = typeof data?.text === "string" ? data.text.trim() : "";
    if (!text) {
      throw new PdfTextExtractionError(
        "EMPTY_TEXT",
        "PDF file did not contain readable text.",
      );
    }
    return text;
  } catch (error) {
    if (error instanceof PdfTextExtractionError) {
      throw error;
    }
    throw new PdfTextExtractionError(
      "INVALID_PDF",
      "PDF file could not be read or is encrypted.",
    );
  }
}

/**
 * Extracts untrusted PDF text outside the server process. The child is given a
 * small heap, a page/text cap, and is terminated by the caller's deadline.
 */
export async function extractPdfTextBounded(
  buffer: Buffer,
  options: { signal: AbortSignal },
): Promise<string> {
  if (buffer.byteLength > MAX_PDF_BYTES) {
    throw new PdfTextExtractionError(
      "RESOURCE_LIMIT",
      "PDF file exceeds the extraction limit.",
    );
  }
  if (options.signal.aborted) throwProcessingTimeout();

  return new Promise((resolve, reject) => {
    const parser = buildPdfParserCommand();
    const child = spawn(parser.command, parser.args, {
      stdio: ["pipe", "pipe", "ignore"],
    });
    let output = "";
    let settled = false;
    const settle = (callback: () => void) => {
      if (settled) return;
      settled = true;
      options.signal.removeEventListener("abort", onAbort);
      callback();
    };
    const onAbort = () => {
      terminate(child);
      settle(() => reject(timeoutError()));
    };
    const onStdinError = (error: Error) => {
      if (settled || options.signal.aborted || isClosedPipeError(error)) return;
      terminate(child);
      settle(() => reject(resourceError()));
    };

    // This must be attached before end(): timeout termination can otherwise
    // race the write and emit an unhandled EPIPE from the child stdin stream.
    child.stdin.on("error", onStdinError);
    options.signal.addEventListener("abort", onAbort, { once: true });
    child.stdout.on("data", (chunk: Buffer) => {
      output += chunk.toString("utf8");
      if (output.length > MAX_PDF_TEXT_LENGTH + 256) {
        terminate(child);
        settle(() => reject(resourceError()));
      }
    });
    child.once("error", () => settle(() => reject(resourceError())));
    child.once("close", (code) => {
      if (settled) return;
      if (code !== 0) {
        settle(() => reject(resourceError()));
        return;
      }
      let result: { ok?: boolean; text?: string };
      try {
        result = JSON.parse(output) as { ok?: boolean; text?: string };
      } catch {
        settle(() => reject(resourceError()));
        return;
      }
      if (!result.ok || typeof result.text !== "string") {
        settle(() =>
          reject(
            new PdfTextExtractionError(
              "INVALID_PDF",
              "PDF file could not be read or is encrypted.",
            ),
          ),
        );
        return;
      }
      const text = result.text.trim();
      if (!text) {
        settle(() =>
          reject(
            new PdfTextExtractionError(
              "EMPTY_TEXT",
              "PDF file did not contain readable text.",
            ),
          ),
        );
        return;
      }
      settle(() => resolve(text));
    });
    try {
      child.stdin.end(buffer, (error?: Error | null) => {
        if (error) onStdinError(error);
      });
    } catch (error) {
      onStdinError(error instanceof Error ? error : new Error("stdin failed"));
    }
  });
}

function isClosedPipeError(error: unknown): boolean {
  const code =
    error instanceof Error
      ? (error as NodeJS.ErrnoException).code
      : typeof error === "object" && error !== null && "code" in error
        ? (error as { code?: unknown }).code
        : undefined;
  return code === "EPIPE" || code === "ERR_STREAM_DESTROYED";
}

function terminate(child: ReturnType<typeof spawn>): void {
  if (child.exitCode !== null || child.killed) return;
  child.kill("SIGKILL");
}

function timeoutError(): PdfTextExtractionError {
  return new PdfTextExtractionError(
    "PROCESSING_TIMEOUT",
    "PDF text extraction timed out.",
  );
}

function resourceError(): PdfTextExtractionError {
  return new PdfTextExtractionError(
    "RESOURCE_LIMIT",
    "PDF text extraction exceeded its resource limit.",
  );
}

function throwProcessingTimeout(): never {
  throw timeoutError();
}

const PDF_WORKER_SOURCE = `
const chunks = [];
for await (const chunk of process.stdin) chunks.push(chunk);
try {
  const { default: pdfParse } = await import("pdf-parse");
  const data = await pdfParse(Buffer.concat(chunks), { max: ${MAX_PDF_PAGES} });
  const text = typeof data?.text === "string" ? data.text.slice(0, ${MAX_PDF_TEXT_LENGTH}) : "";
  process.stdout.write(JSON.stringify({ ok: true, text }));
} catch {
  process.stdout.write(JSON.stringify({ ok: false }));
  process.exitCode = 0;
}
`;
