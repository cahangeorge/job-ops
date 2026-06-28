import {
  chmodSync,
  cpSync,
  existsSync,
  mkdirSync,
  readFileSync,
  rmSync,
  statSync,
} from "node:fs";
import { tmpdir } from "node:os";
import { basename, dirname, join } from "node:path";
import type { JobPostingLivenessStatus } from "@shared/types";

export interface PostingLivenessResult {
  status: JobPostingLivenessStatus;
  checkedAt: number;
  reason: string;
}

export interface BrowserRenderedPosting {
  html: string;
  finalUrl?: string;
  title?: string;
}

export type BrowserLivenessVerifier = (
  url: string,
) => Promise<BrowserRenderedPosting>;

export interface CheckPostingLivenessOptions {
  fetchImpl?: typeof fetch;
  now?: () => number;
  browserVerifier?: BrowserLivenessVerifier;
  /**
   * Enables the Camoufox browser verification flow when the fast HTTP pass is
   * inconclusive. Defaults to true in runtime, false when tests inject fetchImpl
   * without a browserVerifier.
   */
  browserFallback?: boolean;
  browserTimeoutMs?: number;
}

const EXPIRED_SIGNALS = [
  "no longer available",
  "job posting is closed",
  "position has been filled",
  "applications are closed",
  "this job has expired",
  "posting expired",
  "vacancy closed",
];

const LIVE_SIGNALS = [
  "apply now",
  "apply for this job",
  "submit application",
  "start application",
  "apply today",
];

const DEFAULT_BROWSER_TIMEOUT_MS = 20_000;
const MAX_HTML_BYTES = 200_000;

function analyzePostingHtml(
  html: string,
): Pick<PostingLivenessResult, "status" | "reason"> {
  const normalized = html
    .slice(0, MAX_HTML_BYTES)
    .replace(/\s+/g, " ")
    .toLowerCase();

  const expiredSignal = EXPIRED_SIGNALS.find((signal) =>
    normalized.includes(signal),
  );
  if (expiredSignal) {
    return {
      status: "expired",
      reason: `Posting appears closed: ${expiredSignal}`,
    };
  }

  const liveSignal = LIVE_SIGNALS.find((signal) => normalized.includes(signal));
  if (liveSignal) {
    return {
      status: "live",
      reason: `Apply signal found: ${liveSignal}`,
    };
  }

  return {
    status: "uncertain",
    reason: "No clear apply or closed signal found",
  };
}

function getErrorMessage(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}

function shouldRunBrowserFallback(
  options: CheckPostingLivenessOptions,
): boolean {
  if (options.browserFallback != null) return options.browserFallback;
  if (options.browserVerifier) return true;

  // Unit tests commonly inject fetchImpl; do not launch a real browser unless
  // the test explicitly opts in with browserFallback or browserVerifier.
  return !options.fetchImpl;
}

function withCamoufoxReason(
  analysis: Pick<PostingLivenessResult, "status" | "reason">,
  rendered: BrowserRenderedPosting,
): string {
  const suffixes = [
    rendered.title ? `title: ${rendered.title}` : null,
    rendered.finalUrl ? `final URL: ${rendered.finalUrl}` : null,
  ].filter(Boolean);

  return `Camoufox rendered page: ${analysis.reason}${
    suffixes.length > 0 ? ` (${suffixes.join("; ")})` : ""
  }`;
}

function getCamoufoxBrowserEnv(): NodeJS.ProcessEnv {
  const uid = process.getuid?.() ?? 0;
  const home = join(tmpdir(), `jobops-camoufox-home-${uid}`);
  mkdirSync(home, { recursive: true, mode: 0o700 });

  return {
    ...process.env,
    HOME: home,
  };
}

function readVersionFile(dir: string): string | null {
  try {
    return readFileSync(join(dir, "version.json"), "utf8");
  } catch {
    return null;
  }
}

function shouldUseRuntimeCopy(executablePath: string): boolean {
  const uid = process.getuid?.();
  if (uid == null) return false;
  if (!executablePath.startsWith("/root/")) return false;

  try {
    return statSync("/root").uid !== uid;
  } catch {
    return false;
  }
}

function ensureAccessibleCamoufoxRuntime(executablePath: string): string {
  if (!shouldUseRuntimeCopy(executablePath)) return executablePath;

  const uid = process.getuid?.() ?? 0;
  const sourceDir = dirname(executablePath);
  const runtimeDir = join(tmpdir(), `jobops-camoufox-runtime-${uid}`);

  if (readVersionFile(runtimeDir) !== readVersionFile(sourceDir)) {
    rmSync(runtimeDir, { recursive: true, force: true });
    cpSync(sourceDir, runtimeDir, { recursive: true });
    chmodSync(runtimeDir, 0o755);
  }

  const runtimeExecutable = join(runtimeDir, basename(executablePath));
  if (!existsSync(runtimeExecutable)) {
    throw new Error(
      `Camoufox runtime executable missing: ${runtimeExecutable}`,
    );
  }

  return runtimeExecutable;
}

export interface CamoufoxRestVerificationOptions {
  baseUrl?: string;
  fetchImpl?: typeof fetch;
  timeoutMs?: number;
}

async function camoufoxRestJson<T>(
  fetchImpl: typeof fetch,
  url: string,
  init: RequestInit,
  timeoutMs: number,
): Promise<T> {
  const response = await fetchImpl(url, {
    ...init,
    headers: {
      "content-type": "application/json",
      ...init.headers,
    },
    signal: AbortSignal.timeout(timeoutMs),
  });

  if (!response.ok) {
    const body = await response.text().catch(() => "");
    throw new Error(
      `Camoufox REST returned HTTP ${response.status}${
        body ? `: ${body.slice(0, 300)}` : ""
      }`,
    );
  }

  return (await response.json()) as T;
}

export async function verifyPostingWithCamoufoxRest(
  url: string,
  options: CamoufoxRestVerificationOptions = {},
): Promise<BrowserRenderedPosting> {
  const baseUrl = (options.baseUrl ?? "http://127.0.0.1:9377").replace(
    /\/$/,
    "",
  );
  const fetchImpl = options.fetchImpl ?? fetch;
  const timeoutMs =
    options.timeoutMs ?? Math.min(DEFAULT_BROWSER_TIMEOUT_MS, 10_000);
  const userId = "jobops-liveness";
  const sessionKey = `liveness-${Date.now()}-${Math.random().toString(36).slice(2)}`;

  const tab = await camoufoxRestJson<{ tabId?: string }>(
    fetchImpl,
    `${baseUrl}/tabs`,
    {
      method: "POST",
      body: JSON.stringify({ userId, sessionKey, url }),
    },
    timeoutMs,
  );

  if (!tab.tabId) {
    throw new Error("Camoufox REST did not return a tabId");
  }

  try {
    const evaluated = await camoufoxRestJson<{
      ok?: boolean;
      result?: BrowserRenderedPosting;
    }>(
      fetchImpl,
      `${baseUrl}/tabs/${encodeURIComponent(tab.tabId)}/evaluate`,
      {
        method: "POST",
        body: JSON.stringify({
          userId,
          expression:
            "(async () => { await new Promise((resolve) => setTimeout(resolve, 750)); return { html: document.documentElement?.outerHTML ?? '', finalUrl: location.href, title: document.title ?? '' }; })()",
        }),
      },
      timeoutMs,
    );

    if (!evaluated.result?.html) {
      throw new Error("Camoufox REST evaluate did not return rendered HTML");
    }

    return evaluated.result;
  } finally {
    await fetchImpl(
      `${baseUrl}/tabs/${encodeURIComponent(tab.tabId)}?userId=${encodeURIComponent(userId)}`,
      {
        method: "DELETE",
        signal: AbortSignal.timeout(Math.min(timeoutMs, 2_000)),
      },
    ).catch(() => undefined);
  }
}

async function verifyPostingWithCamoufoxPackage(
  url: string,
  timeoutMs = DEFAULT_BROWSER_TIMEOUT_MS,
): Promise<BrowserRenderedPosting> {
  // Dynamic imports keep ordinary API/server startup fast; only liveness checks
  // that need a browser pay for Playwright + Camoufox loading.
  const [{ createLaunchOptions }, { firefox }] = await Promise.all([
    import("browser-utils"),
    import("playwright"),
  ]);

  const { launchOptions } = await createLaunchOptions({
    headless: true,
    humanize: true,
    geoip: true,
    block_webrtc: true,
  });
  if (typeof launchOptions.executablePath === "string") {
    launchOptions.executablePath = ensureAccessibleCamoufoxRuntime(
      launchOptions.executablePath,
    );
  }
  launchOptions.env = getCamoufoxBrowserEnv();

  const browser = await firefox.launch(launchOptions);
  try {
    const page = await browser.newPage();
    page.setDefaultTimeout(timeoutMs);
    page.setDefaultNavigationTimeout(timeoutMs);

    await page.goto(url, {
      waitUntil: "domcontentloaded",
      timeout: timeoutMs,
    });

    await page
      .waitForLoadState("networkidle", { timeout: Math.min(timeoutMs, 5_000) })
      .catch(() => undefined);

    return {
      html: await page.content(),
      finalUrl: page.url(),
      title: await page.title().catch(() => ""),
    };
  } finally {
    await browser.close().catch(() => undefined);
  }
}

export async function verifyPostingWithCamoufox(
  url: string,
  timeoutMs = DEFAULT_BROWSER_TIMEOUT_MS,
): Promise<BrowserRenderedPosting> {
  const restBaseUrl = process.env.CAMOUFOX_REST_URL ?? "http://127.0.0.1:9377";
  const restTimeoutMs = Math.min(timeoutMs, 10_000);
  try {
    return await verifyPostingWithCamoufoxRest(url, {
      baseUrl: restBaseUrl,
      timeoutMs: restTimeoutMs,
    });
  } catch (restError) {
    try {
      return await verifyPostingWithCamoufoxPackage(url, timeoutMs);
    } catch (packageError) {
      throw new Error(
        `REST bridge failed: ${getErrorMessage(restError)}; package launch failed: ${getErrorMessage(packageError)}`,
      );
    }
  }
}

export async function checkPostingLiveness(
  url: string,
  options: CheckPostingLivenessOptions = {},
): Promise<PostingLivenessResult> {
  const checkedAt = options.now?.() ?? Date.now();
  const fetchImpl = options.fetchImpl ?? fetch;
  let inconclusiveReason = "No static HTTP check was attempted";

  try {
    const response = await fetchImpl(url, {
      redirect: "follow",
      headers: {
        "user-agent":
          "Mozilla/5.0 (compatible; JobOps-LivenessChecker/1.0; +https://jobops.local)",
        accept:
          "text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8",
      },
    });

    if (response.status === 404 || response.status === 410) {
      return {
        status: "expired",
        checkedAt,
        reason: `Posting returned HTTP ${response.status}`,
      };
    }

    if (!response.ok) {
      inconclusiveReason = `Posting returned HTTP ${response.status}`;
    } else {
      const text = await response.text();
      const analysis = analyzePostingHtml(text);
      if (analysis.status !== "uncertain") {
        return {
          ...analysis,
          checkedAt,
        };
      }
      inconclusiveReason = analysis.reason;
    }
  } catch (error) {
    inconclusiveReason = `Liveness check failed: ${getErrorMessage(error)}`;
  }

  if (!shouldRunBrowserFallback(options)) {
    return {
      status: "uncertain",
      checkedAt,
      reason: inconclusiveReason,
    };
  }

  const browserVerifier =
    options.browserVerifier ??
    ((targetUrl: string) =>
      verifyPostingWithCamoufox(
        targetUrl,
        options.browserTimeoutMs ?? DEFAULT_BROWSER_TIMEOUT_MS,
      ));

  try {
    const rendered = await browserVerifier(url);
    const analysis = analyzePostingHtml(rendered.html);
    if (analysis.status !== "uncertain") {
      return {
        status: analysis.status,
        checkedAt,
        reason: withCamoufoxReason(analysis, rendered),
      };
    }

    return {
      status: "uncertain",
      checkedAt,
      reason: `${inconclusiveReason}; Camoufox rendered page but found no clear apply or closed signal`,
    };
  } catch (error) {
    return {
      status: "uncertain",
      checkedAt,
      reason: `${inconclusiveReason}; Camoufox verification failed: ${getErrorMessage(error)}`,
    };
  }
}
