import type { JobPostingLivenessStatus } from "@shared/types";

export interface PostingLivenessResult {
  status: JobPostingLivenessStatus;
  checkedAt: number;
  reason: string;
}

export interface CheckPostingLivenessOptions {
  fetchImpl?: typeof fetch;
  now?: () => number;
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

export async function checkPostingLiveness(
  url: string,
  options: CheckPostingLivenessOptions = {},
): Promise<PostingLivenessResult> {
  const checkedAt = options.now?.() ?? Date.now();
  const fetchImpl = options.fetchImpl ?? fetch;

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
      return {
        status: "uncertain",
        checkedAt,
        reason: `Posting returned HTTP ${response.status}`,
      };
    }

    const text = (await response.text()).slice(0, 200_000);
    const normalized = text.replace(/\s+/g, " ").toLowerCase();

    const expiredSignal = EXPIRED_SIGNALS.find((signal) =>
      normalized.includes(signal),
    );
    if (expiredSignal) {
      return {
        status: "expired",
        checkedAt,
        reason: `Posting appears closed: ${expiredSignal}`,
      };
    }

    const liveSignal = LIVE_SIGNALS.find((signal) =>
      normalized.includes(signal),
    );
    if (liveSignal) {
      return {
        status: "live",
        checkedAt,
        reason: `Apply signal found: ${liveSignal}`,
      };
    }

    return {
      status: "uncertain",
      checkedAt,
      reason: "No clear apply or closed signal found",
    };
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    return {
      status: "uncertain",
      checkedAt,
      reason: `Liveness check failed: ${message}`,
    };
  }
}
