/**
 * Direct Company Portal Scanner (from Career Ops)
 * Scrapes job listings directly from Greenhouse, Ashby, and Lever boards.
 */

import { logger } from "@infra/logger";

export interface PortalJob {
  id: string;
  title: string;
  employer: string;
  location: string | null;
  department: string | null;
  url: string;
  portal: "greenhouse" | "ashby" | "lever";
  postedAt: string | null;
  description: string | null;
  employmentType: string | null;
  experienceLevel: string | null;
  isRemote: boolean;
}

export interface PortalScanInput {
  orgSlug: string;
  portal: "greenhouse" | "ashby" | "lever";
  keywords?: string[];
  departments?: string[];
  excludeInternships?: boolean;
}

export interface PortalScanResult {
  jobs: PortalJob[];
  total: number;
  filtered: number;
  errors: string[];
}

export async function scanCompanyPortal(input: PortalScanInput): Promise<PortalScanResult> {
  const { orgSlug, portal, keywords, departments, excludeInternships = true } = input;
  let jobs: PortalJob[] = [];
  const errors: string[] = [];

  try {
    switch (portal) {
      case "greenhouse":
        jobs = await fetchGreenhouseJobs(orgSlug);
        break;
      case "ashby":
        jobs = await fetchAshbyJobs(orgSlug);
        break;
      case "lever":
        jobs = await fetchLeverJobs(orgSlug);
        break;
    }
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    errors.push(`${portal} scan failed: ${msg}`);
    logger.error(`Portal scan failed for ${orgSlug} (${portal}):`, msg);
  }

  const total = jobs.length;

  // Apply filters
  if (excludeInternships) {
    jobs = jobs.filter((j) => !isInternship(j.title));
  }
  if (departments?.length) {
    const depts = departments.map((d) => d.toLowerCase());
    jobs = jobs.filter((j) =>
      depts.some((d) => j.department?.toLowerCase().includes(d)),
    );
  }
  if (keywords?.length) {
    const kw = keywords.map((k) => k.toLowerCase());
    jobs = jobs.filter((j) =>
      kw.some((k) =>
        j.title.toLowerCase().includes(k) ||
        (j.description?.toLowerCase().includes(k) ?? false),
      ),
    );
  }

  return { jobs, total, filtered: jobs.length, errors };
}

async function fetchGreenhouseJobs(orgSlug: string): Promise<PortalJob[]> {
  const url = `https://boards-api.greenhouse.io/v1/boards/${orgSlug}/jobs?content=true`;
  const res = await fetch(url, { headers: { Accept: "application/json" } });
  if (!res.ok) throw new Error(`Greenhouse API returned ${res.status}`);

  const data = (await res.json()) as {
    jobs: Array<{
      id: number;
      title: string;
      location?: { name?: string };
      departments?: Array<{ name: string }>;
      absolute_url: string;
      updated_at: string;
      content?: string;
      metadata?: Array<{ name: string; value: string | null }>;
    }>;
  };

  return data.jobs.map((j) => ({
    id: `gh_${j.id}`,
    title: j.title,
    employer: orgSlug,
    location: j.location?.name ?? null,
    department: j.departments?.[0]?.name ?? null,
    url: j.absolute_url,
    portal: "greenhouse" as const,
    postedAt: j.updated_at ?? null,
    description: j.content ?? null,
    employmentType: extractMetadata(j.metadata, "employment_type"),
    experienceLevel: extractMetadata(j.metadata, "experience_level"),
    isRemote: isRemoteLocation(j.location?.name ?? ""),
  }));
}

async function fetchAshbyJobs(orgSlug: string): Promise<PortalJob[]> {
  const url = `https://jobs.ashbyhq.com/api/non-user-scrape/list-job-postings-for-board?organizationId=${orgSlug}&_=1`;
  const res = await fetch(url, { headers: { Accept: "application/json" } });
  if (!res.ok) throw new Error(`Ashby API returned ${res.status}`);

  const data = (await res.json()) as {
    jobPostings: Array<{
      id: string;
      title: string;
      department?: string;
      location?: string;
      jobPostingUrl: string;
      publishedAt?: string;
      descriptionHtml?: string;
    }>;
  };

  return data.jobPostings.map((j) => ({
    id: `ashby_${j.id}`,
    title: j.title,
    employer: orgSlug,
    location: j.location ?? null,
    department: j.department ?? null,
    url: j.jobPostingUrl,
    portal: "ashby" as const,
    postedAt: j.publishedAt ?? null,
    description: j.descriptionHtml ?? null,
    employmentType: null,
    experienceLevel: null,
    isRemote: isRemoteLocation(j.location ?? ""),
  }));
}

async function fetchLeverJobs(orgSlug: string): Promise<PortalJob[]> {
  const url = `https://api.lever.co/v0/postings/${orgSlug}?mode=json`;
  const res = await fetch(url, { headers: { Accept: "application/json" } });
  if (!res.ok) throw new Error(`Lever API returned ${res.status}`);

  const data = (await res.json()) as Array<{
    id: string;
    text: string;
    categories?: { location?: string; team?: string; commitment?: string };
    hostedUrl: string;
    createdAt: number;
    description?: string;
    lists?: Array<{ text: string; content: string }>;
  }>;

  return data.map((j) => ({
    id: `lever_${j.id}`,
    title: j.text,
    employer: orgSlug,
    location: j.categories?.location ?? null,
    department: j.categories?.team ?? null,
    url: j.hostedUrl,
    portal: "lever" as const,
    postedAt: j.createdAt ? new Date(j.createdAt).toISOString() : null,
    description: j.description ?? null,
    employmentType: j.categories?.commitment ?? null,
    experienceLevel: null,
    isRemote: isRemoteLocation(j.categories?.location ?? ""),
  }));
}

function isInternship(title: string): boolean {
  const t = title.toLowerCase();
  return /\bintern\b|\bco-op\b|\bstudent\b|\bfellowship\b/.test(t);
}

function isRemoteLocation(location: string): boolean {
  const l = location.toLowerCase();
  return /\bremote\b|\bh(remote|ybrid)\b|\banywhere\b/.test(l);
}

function extractMetadata(
  metadata: Array<{ name: string; value: string | null }> | undefined,
  key: string,
): string | null {
  if (!metadata) return null;
  const item = metadata.find((m) => m.name.toLowerCase() === key.toLowerCase());
  return item?.value ?? null;
}
