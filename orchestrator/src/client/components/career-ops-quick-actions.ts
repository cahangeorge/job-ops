import type { Job } from "@shared/types.js";

export type CareerOpsPortal = "greenhouse" | "ashby" | "lever";

type CareerOpsJobLinkFields = Pick<Job, "jobUrl" | "applicationLink">;

const GENERIC_GREENHOUSE_SUBDOMAINS = new Set(["boards", "job-boards"]);
const GENERIC_ASHBY_SUBDOMAINS = new Set(["jobs"]);
const GENERIC_LEVER_SUBDOMAINS = new Set(["jobs", "eu"]);

function getCandidateUrls(job: CareerOpsJobLinkFields): string[] {
  return [job.applicationLink, job.jobUrl].filter(
    (value): value is string => typeof value === "string" && value.length > 0,
  );
}

function firstPathSegment(pathname: string): string | null {
  const segment = pathname
    .split("/")
    .map((part) => part.trim())
    .find(Boolean);
  return segment || null;
}

function sanitizeOrgSlug(value: string | null | undefined): string {
  if (!value) return "";
  return value
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9-]/g, "")
    .replace(/-+/g, "-")
    .replace(/^-|-$/g, "");
}

function parsePortalUrl(
  rawUrl: string,
): { portal: CareerOpsPortal; orgSlug: string } | null {
  try {
    const url = new URL(rawUrl);
    const hostname = url.hostname.toLowerCase();
    const labels = hostname.split(".");
    const firstLabel = labels[0] ?? "";

    if (hostname.endsWith("greenhouse.io")) {
      const fromQuery = sanitizeOrgSlug(url.searchParams.get("for"));
      if (fromQuery) return { portal: "greenhouse", orgSlug: fromQuery };

      if (!GENERIC_GREENHOUSE_SUBDOMAINS.has(firstLabel)) {
        const subdomainSlug = sanitizeOrgSlug(firstLabel);
        if (subdomainSlug) {
          return { portal: "greenhouse", orgSlug: subdomainSlug };
        }
      }

      const pathSlug = sanitizeOrgSlug(firstPathSegment(url.pathname));
      if (pathSlug) return { portal: "greenhouse", orgSlug: pathSlug };

      return { portal: "greenhouse", orgSlug: "" };
    }

    if (hostname.endsWith("ashbyhq.com")) {
      if (!GENERIC_ASHBY_SUBDOMAINS.has(firstLabel)) {
        const subdomainSlug = sanitizeOrgSlug(firstLabel);
        if (subdomainSlug) return { portal: "ashby", orgSlug: subdomainSlug };
      }

      const pathSlug = sanitizeOrgSlug(firstPathSegment(url.pathname));
      if (pathSlug) return { portal: "ashby", orgSlug: pathSlug };

      return { portal: "ashby", orgSlug: "" };
    }

    if (hostname.endsWith("lever.co")) {
      if (!GENERIC_LEVER_SUBDOMAINS.has(firstLabel)) {
        const subdomainSlug = sanitizeOrgSlug(firstLabel);
        if (subdomainSlug) return { portal: "lever", orgSlug: subdomainSlug };
      }

      const pathSlug = sanitizeOrgSlug(firstPathSegment(url.pathname));
      if (pathSlug) return { portal: "lever", orgSlug: pathSlug };

      return { portal: "lever", orgSlug: "" };
    }
  } catch {
    return null;
  }

  return null;
}

export function inferPortalFromJob(job: CareerOpsJobLinkFields) {
  const urls = getCandidateUrls(job).map((value) => value.toLowerCase());

  for (const url of urls) {
    if (url.includes("greenhouse")) return "greenhouse";
    if (url.includes("ashby")) return "ashby";
    if (url.includes("lever")) return "lever";
  }

  return null;
}

export function deriveEmployerSlug(employer: string | null | undefined) {
  if (!employer) return "";

  return employer
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9\s-]/g, "")
    .replace(/\s+/g, "-")
    .replace(/-+/g, "-")
    .replace(/^-|-$/g, "");
}

export function derivePortalOrgSlug(
  job: CareerOpsJobLinkFields & Pick<Job, "employer">,
): string {
  for (const rawUrl of getCandidateUrls(job)) {
    const parsed = parsePortalUrl(rawUrl);
    if (parsed?.orgSlug) return parsed.orgSlug;
  }

  return deriveEmployerSlug(job.employer);
}

export function getCareerOpsResumeSummary(
  job: Pick<Job, "tailoredSummary">,
  fallbackSummary: string | null | undefined,
) {
  const preferred = job.tailoredSummary?.trim();
  if (preferred) return preferred;

  const fallback = fallbackSummary?.trim();
  return fallback || null;
}
