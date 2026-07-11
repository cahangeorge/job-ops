import { createHash } from "node:crypto";
import { lookup as dnsLookup } from "node:dns/promises";
import type { LookupFunction } from "node:net";
import { isIP } from "node:net";
import { convert } from "html-to-text";
import { Agent } from "undici";
import { extractPdfTextBounded } from "./document-text-extraction";

const MAX_URL_LENGTH = 2_048;
const MAX_BODY_BYTES = 2 * 1024 * 1024;
const MAX_TEXT_LENGTH = 50_000;
const MAX_PROMPT_TEXT_LENGTH = 60_000;
const DEFAULT_TIMEOUT_MS = 10_000;

export type JobPostingSnapshotErrorCode =
  | "BODY_TOO_LARGE"
  | "FORBIDDEN_ADDRESS"
  | "INVALID_URL"
  | "REQUEST_TIMEOUT"
  | "UNSUPPORTED_CONTENT_TYPE"
  | "UPSTREAM_RESPONSE";

export class JobPostingSnapshotError extends Error {
  readonly code: JobPostingSnapshotErrorCode;

  constructor(code: JobPostingSnapshotErrorCode, message: string) {
    super(message);
    this.name = "JobPostingSnapshotError";
    this.code = code;
  }
}

export interface ResolvedAddress {
  address: string;
  family: 4 | 6;
}

export interface PinnedDispatcher {
  close?: () => Promise<void> | void;
  destroy?: (error?: Error) => Promise<void> | void;
}

export interface JobPostingSnapshotDependencies {
  resolveAll: (hostname: string) => Promise<ResolvedAddress[]>;
  extractPdfText: (
    buffer: Buffer,
    options: { signal: AbortSignal },
  ) => Promise<string>;
  createDispatcher: (input: {
    hostname: string;
    address: ResolvedAddress;
  }) => PinnedDispatcher;
  fetch: (url: string, init: JobPostingSnapshotFetchInit) => Promise<Response>;
}

export interface JobPostingSnapshotFetchInit {
  dispatcher: PinnedDispatcher;
  redirect: "error";
  signal: AbortSignal;
  headers: Record<string, string>;
}

export interface JobPostingSnapshot {
  url: string;
  contentType: "application/pdf" | "text/html" | "text/plain";
  text: string;
  promptText: string;
  sha256: string;
}

export interface JobPostingSnapshotOptions {
  timeoutMs?: number;
}

export function createJobPostingSnapshotService(
  dependencies: JobPostingSnapshotDependencies = defaultDependencies,
  options: JobPostingSnapshotOptions = {},
) {
  const timeoutMs = options.timeoutMs ?? DEFAULT_TIMEOUT_MS;

  return {
    async fetch(rawUrl: string): Promise<JobPostingSnapshot> {
      const url = parseNormalizedHttpsUrl(rawUrl);
      assertHostnameIsNotLocal(url.hostname);
      if (isIP(url.hostname.replace(/^\[|\]$/g, ""))) {
        throw new JobPostingSnapshotError(
          "FORBIDDEN_ADDRESS",
          "IP literals are not allowed.",
        );
      }
      const signal = AbortSignal.timeout(timeoutMs);
      const addresses = await resolvePublicAddresses(
        dependencies.resolveAll,
        url.hostname,
        signal,
      );
      const address = addresses[0];
      if (!address) {
        throw new JobPostingSnapshotError(
          "FORBIDDEN_ADDRESS",
          "The hostname did not resolve to a public address.",
        );
      }

      const dispatcher = dependencies.createDispatcher({
        hostname: url.hostname,
        address,
      });
      let response: Response | undefined;
      let snapshot: JobPostingSnapshot;
      try {
        const request = await requestSnapshot(
          dependencies.fetch,
          url,
          dispatcher,
          signal,
        );
        response = request.response;
        const contentType = normalizeContentType(
          response.headers.get("content-type"),
        );
        assertContentLength(response.headers.get("content-length"));
        const body = await readBody(response, request.signal);
        const text = await normalizeSnapshotText(
          contentType,
          body,
          signal,
          dependencies,
        );

        snapshot = {
          url: url.toString(),
          contentType,
          text,
          promptText: text.slice(0, MAX_PROMPT_TEXT_LENGTH),
          sha256: createHash("sha256").update(body).digest("hex"),
        };
      } catch (error) {
        if (response) cancelResponseBody(response);
        destroyDispatcher(dispatcher);
        if (error instanceof JobPostingSnapshotError) throw error;
        if (signal.aborted || isAbortError(error)) {
          throw new JobPostingSnapshotError(
            "REQUEST_TIMEOUT",
            "Fetching the posting timed out.",
          );
        }
        throw new JobPostingSnapshotError(
          "UPSTREAM_RESPONSE",
          "The posting could not be fetched.",
        );
      }
      try {
        await dispatcher.close?.();
      } catch {
        destroyDispatcher(dispatcher);
        throw new JobPostingSnapshotError(
          "UPSTREAM_RESPONSE",
          "The posting could not be fetched.",
        );
      }
      return snapshot;
    },
  };
}

function parseNormalizedHttpsUrl(rawUrl: string): URL {
  if (
    typeof rawUrl !== "string" ||
    rawUrl.length === 0 ||
    rawUrl.length > MAX_URL_LENGTH
  ) {
    throw new JobPostingSnapshotError(
      "INVALID_URL",
      "URL must be a normalized HTTPS URL.",
    );
  }

  let url: URL;
  try {
    url = new URL(rawUrl);
  } catch {
    throw new JobPostingSnapshotError(
      "INVALID_URL",
      "URL must be a normalized HTTPS URL.",
    );
  }

  if (
    url.protocol !== "https:" ||
    url.username ||
    url.password ||
    url.hash ||
    url.port ||
    url.toString() !== rawUrl
  ) {
    throw new JobPostingSnapshotError(
      "INVALID_URL",
      "URL must be a normalized HTTPS URL.",
    );
  }

  return url;
}

async function resolvePublicAddresses(
  resolveAll: JobPostingSnapshotDependencies["resolveAll"],
  hostname: string,
  signal: AbortSignal,
): Promise<ResolvedAddress[]> {
  let addresses: ResolvedAddress[];
  try {
    addresses = await awaitWithSignal(resolveAll(hostname), signal);
  } catch {
    if (signal.aborted) {
      throw new JobPostingSnapshotError(
        "REQUEST_TIMEOUT",
        "Fetching the posting timed out.",
      );
    }
    throw new JobPostingSnapshotError(
      "FORBIDDEN_ADDRESS",
      "The hostname could not be resolved to a public address.",
    );
  }

  if (
    addresses.length === 0 ||
    addresses.some((address) => !isPublicAddress(address.address))
  ) {
    throw new JobPostingSnapshotError(
      "FORBIDDEN_ADDRESS",
      "The hostname did not resolve exclusively to public addresses.",
    );
  }
  return addresses;
}

function assertHostnameIsNotLocal(hostname: string): void {
  if (hostname === "localhost" || hostname.endsWith(".localhost")) {
    throw new JobPostingSnapshotError(
      "FORBIDDEN_ADDRESS",
      "Localhost is not allowed.",
    );
  }
}

function isPublicAddress(address: string): boolean {
  const family = isIP(address);
  if (family === 4) return isPublicIpv4(address);
  if (family === 6) return isPublicIpv6(address);
  return false;
}

function isPublicIpv4(address: string): boolean {
  const octets = address.split(".").map(Number);
  const [a, b, c] = octets;
  if (octets.length !== 4 || octets.some((octet) => !Number.isInteger(octet)))
    return false;
  if (a === 0 || a === 10 || a === 127 || a >= 224) return false;
  if (a === 100 && b >= 64 && b <= 127) return false;
  if (a === 169 && b === 254) return false;
  if (a === 172 && b >= 16 && b <= 31) return false;
  if (a === 192 && (b === 0 || b === 168 || (b === 88 && c === 99)))
    return false;
  if (a === 198 && (b === 18 || b === 19 || (b === 51 && c === 100)))
    return false;
  return !(a === 203 && b === 0 && c === 113);
}

function isPublicIpv6(address: string): boolean {
  const segments = expandIpv6(address);
  if (!segments) return false;
  const first = segments[0];
  const second = segments[1];
  const mappedIpv4 =
    segments.slice(0, 5).every((segment) => segment === 0) &&
    segments[5] === 0xffff;
  if (mappedIpv4) {
    return isPublicIpv4(
      segments
        .slice(6)
        .flatMap((segment) => [segment >> 8, segment & 0xff])
        .join("."),
    );
  }
  if ((first & 0xe000) !== 0x2000) return false;
  return !(first === 0x2001 && second === 0x0db8);
}

function expandIpv6(address: string): number[] | null {
  const [before, after] = address.toLowerCase().split("::");
  if (address.split("::").length > 2) return null;
  const left = before ? before.split(":") : [];
  const right = after ? after.split(":") : [];
  const missing = 8 - left.length - right.length;
  if (missing < 0 || (!address.includes("::") && missing !== 0)) return null;
  const parts = [...left, ...Array(missing).fill("0"), ...right];
  if (parts.length !== 8 || parts.some((part) => !/^[0-9a-f]{1,4}$/.test(part)))
    return null;
  return parts.map((part) => Number.parseInt(part, 16));
}

async function requestSnapshot(
  fetcher: JobPostingSnapshotDependencies["fetch"],
  url: URL,
  dispatcher: PinnedDispatcher,
  signal: AbortSignal,
): Promise<{ response: Response; signal: AbortSignal }> {
  try {
    const response = await fetcher(url.toString(), {
      dispatcher,
      redirect: "error",
      signal,
      headers: { accept: "text/html, text/plain, application/pdf" },
    });
    if (!response.ok || (response.status >= 300 && response.status < 400)) {
      cancelResponseBody(response);
      throw new JobPostingSnapshotError(
        "UPSTREAM_RESPONSE",
        "The upstream server returned an error response.",
      );
    }
    return { response, signal };
  } catch (error) {
    if (error instanceof JobPostingSnapshotError) throw error;
    if (isAbortError(error)) {
      throw new JobPostingSnapshotError(
        "REQUEST_TIMEOUT",
        "Fetching the posting timed out.",
      );
    }
    throw new JobPostingSnapshotError(
      "UPSTREAM_RESPONSE",
      "The posting could not be fetched.",
    );
  }
}

function awaitWithSignal<T>(
  promise: Promise<T>,
  signal: AbortSignal,
): Promise<T> {
  if (signal.aborted) return Promise.reject(signal.reason);
  return new Promise((resolve, reject) => {
    const onAbort = () => {
      signal.removeEventListener("abort", onAbort);
      reject(signal.reason);
    };
    signal.addEventListener("abort", onAbort, { once: true });
    void promise.then(
      (value) => {
        signal.removeEventListener("abort", onAbort);
        resolve(value);
      },
      (error: unknown) => {
        signal.removeEventListener("abort", onAbort);
        reject(error);
      },
    );
  });
}

function isAbortError(error: unknown): boolean {
  return (
    (error instanceof DOMException && error.name === "TimeoutError") ||
    (error instanceof Error &&
      (error.name === "AbortError" || error.name === "TimeoutError"))
  );
}

function normalizeContentType(
  contentType: string | null,
): JobPostingSnapshot["contentType"] {
  const value = contentType?.split(";", 1)[0]?.trim().toLowerCase();
  if (value === "application/pdf") return "application/pdf";
  if (value === "text/html") return "text/html";
  if (value?.startsWith("text/")) return "text/plain";
  throw new JobPostingSnapshotError(
    "UNSUPPORTED_CONTENT_TYPE",
    "The posting content type is not supported.",
  );
}

function assertContentLength(contentLength: string | null): void {
  if (!contentLength) return;
  if (!/^\d+$/.test(contentLength) || Number(contentLength) > MAX_BODY_BYTES) {
    throw new JobPostingSnapshotError(
      "BODY_TOO_LARGE",
      "The posting body exceeds the maximum size.",
    );
  }
}

async function readBody(
  response: Response,
  signal: AbortSignal,
): Promise<Buffer> {
  if (!response.body) return Buffer.alloc(0);
  const reader = response.body.getReader();
  const chunks: Uint8Array[] = [];
  let size = 0;
  try {
    while (true) {
      const { done, value } = await readChunk(reader, signal);
      if (done) break;
      size += value.byteLength;
      if (size > MAX_BODY_BYTES) {
        cancelReader(reader);
        throw new JobPostingSnapshotError(
          "BODY_TOO_LARGE",
          "The posting body exceeds the maximum size.",
        );
      }
      chunks.push(value);
    }
    return Buffer.concat(chunks, size);
  } catch (error) {
    cancelReader(reader);
    if (error instanceof JobPostingSnapshotError) throw error;
    if (signal.aborted || isAbortError(error)) {
      throw new JobPostingSnapshotError(
        "REQUEST_TIMEOUT",
        "Fetching the posting timed out.",
      );
    }
    throw new JobPostingSnapshotError(
      "UPSTREAM_RESPONSE",
      "The posting response could not be read.",
    );
  } finally {
    reader.releaseLock();
  }
}

function readChunk(
  reader: ReadableStreamDefaultReader<Uint8Array>,
  signal: AbortSignal,
): Promise<ReadableStreamReadResult<Uint8Array>> {
  if (signal.aborted) return Promise.reject(signal.reason);
  return new Promise((resolve, reject) => {
    const onAbort = () => {
      signal.removeEventListener("abort", onAbort);
      reject(signal.reason);
    };
    signal.addEventListener("abort", onAbort, { once: true });
    void reader.read().then(
      (result) => {
        signal.removeEventListener("abort", onAbort);
        resolve(result);
      },
      (error: unknown) => {
        signal.removeEventListener("abort", onAbort);
        reject(error);
      },
    );
  });
}

function cancelResponseBody(response: Response): void {
  if (!response.body || response.body.locked) return;
  void response.body.cancel().catch(() => undefined);
}

function cancelReader(reader: ReadableStreamDefaultReader<Uint8Array>): void {
  void reader.cancel().catch(() => undefined);
}

function destroyDispatcher(dispatcher: PinnedDispatcher): void {
  try {
    const operation = dispatcher.destroy
      ? dispatcher.destroy()
      : dispatcher.close?.();
    void Promise.resolve(operation).catch(() => undefined);
  } catch {
    // Cleanup failures must not obscure the sanitized snapshot error.
  }
}

async function normalizeText(
  contentType: JobPostingSnapshot["contentType"],
  body: Buffer,
  signal: AbortSignal,
  dependencies: JobPostingSnapshotDependencies,
): Promise<string> {
  const rawText =
    contentType === "application/pdf"
      ? await awaitWithSignal(
          dependencies.extractPdfText(body, { signal }),
          signal,
        )
      : contentType === "text/html"
        ? convert(body.toString("utf8"), { wordwrap: false })
        : body.toString("utf8");
  return rawText
    .replace(/\r\n?/g, "\n")
    .replace(/[ \t]+\n/g, "\n")
    .replace(/\n{3,}/g, "\n\n")
    .replace(/[ \t]{2,}/g, " ")
    .trim()
    .slice(0, MAX_TEXT_LENGTH);
}

async function normalizeSnapshotText(
  contentType: JobPostingSnapshot["contentType"],
  body: Buffer,
  signal: AbortSignal,
  dependencies: JobPostingSnapshotDependencies,
): Promise<string> {
  try {
    return await normalizeText(contentType, body, signal, dependencies);
  } catch (error) {
    if (signal.aborted || isAbortError(error)) {
      throw new JobPostingSnapshotError(
        "REQUEST_TIMEOUT",
        "Fetching the posting timed out.",
      );
    }
    if ((error as { code?: unknown })?.code === "RESOURCE_LIMIT") {
      throw new JobPostingSnapshotError(
        "BODY_TOO_LARGE",
        "The PDF exceeds the processing resource limit.",
      );
    }
    throw error;
  }
}

const defaultDependencies: JobPostingSnapshotDependencies = {
  resolveAll: async (hostname) =>
    (await dnsLookup(hostname, { all: true, verbatim: true })).map(
      (result) => ({
        address: result.address,
        family: result.family as 4 | 6,
      }),
    ),
  extractPdfText: extractPdfTextBounded,
  createDispatcher: ({ address }) =>
    new Agent({
      connect: {
        lookup: createPinnedLookup(address),
      },
    }),
  fetch: (url, init) => fetch(url, init as RequestInit),
};

export function createPinnedLookup(address: ResolvedAddress): LookupFunction {
  return (_hostname, options, callback) => {
    if (options.all) {
      callback(null, [address]);
      return;
    }
    callback(null, address.address, address.family);
  };
}
