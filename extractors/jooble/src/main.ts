import { mkdir, writeFile } from "node:fs/promises";
import { dirname, join } from "node:path";
import { parseSearchTerms } from "job-ops-shared/utils/search-terms";
import {
  toNumberOrNull,
  toStringOrNull,
} from "job-ops-shared/utils/type-conversion";

const API_BASE = "https://ro.jooble.org/api";
const JOBOPS_PROGRESS_PREFIX = "JOBOPS_PROGRESS ";
const DEFAULT_SEARCH_TERM = "web developer";

type JoobleJob = {
  id?: unknown;
  title?: unknown;
  company?: unknown;
  link?: unknown;
  location?: unknown;
  salary?: unknown;
  date?: unknown;
  snippet?: unknown;
  type?: unknown;
};

type ExtractedJob = {
  source: "jooble";
  sourceJobId?: string;
  title: string;
  employer: string;
  jobUrl: string;
  applicationLink: string;
  location?: string;
  salary?: string;
  datePosted?: string;
  jobDescription?: string;
  jobType?: string;
};

function parsePositiveInt(input: string | undefined, fallback: number): number {
  const parsed = input ? Number.parseInt(input, 10) : Number.NaN;
  if (!Number.isFinite(parsed) || parsed < 1) return fallback;
  return parsed;
}

function requireEnv(name: string): string {
  const value = process.env[name]?.trim();
  if (!value) throw new Error(`Missing required environment variable: ${name}`);
  return value;
}

function emitProgress(payload: Record<string, unknown>): void {
  if (process.env.JOBOPS_EMIT_PROGRESS !== "1") return;
  console.log(`${JOBOPS_PROGRESS_PREFIX}${JSON.stringify(payload)}`);
}

function mapJob(raw: JoobleJob): ExtractedJob | null {
  const id = toStringOrNull(raw.id);
  const title = toStringOrNull(raw.title) ?? "Unknown Title";
  const employer = toStringOrNull(raw.company) ?? "Unknown Employer";
  const jobUrl = toStringOrNull(raw.link);
  if (!jobUrl) return null;

  return {
    source: "jooble",
    sourceJobId: id ?? undefined,
    title,
    employer,
    jobUrl,
    applicationLink: jobUrl,
    location: toStringOrNull(raw.location) ?? undefined,
    salary: toStringOrNull(raw.salary) ?? undefined,
    datePosted: toStringOrNull(raw.date) ?? undefined,
    jobDescription: toStringOrNull(raw.snippet) ?? undefined,
    jobType: toStringOrNull(raw.type) ?? undefined,
  };
}

async function fetchJobsPage(args: {
  apiKey: string;
  page: number;
  keywords: string;
  location?: string;
  resultsPerPage: number;
}): Promise<JoobleJob[]> {
  const url = `${API_BASE}/${args.apiKey}`;
  const body: Record<string, unknown> = {
    keywords: args.keywords,
    page: args.page,
    searchMode: 1,
  };
  if (args.location) {
    body.location = args.location;
  }
  body.resultsPerPage = args.resultsPerPage;

  const response = await fetch(url, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Accept: "application/json",
    },
    body: JSON.stringify(body),
  });
  if (!response.ok) {
    throw new Error(`Jooble request failed with status ${response.status}`);
  }

  const responseBody = (await response.json()) as {
    jobs?: unknown[];
    totalCount?: unknown;
  };
  if (!Array.isArray(responseBody.jobs)) return [];
  return responseBody.jobs as JoobleJob[];
}

async function run(): Promise<void> {
  const apiKey = requireEnv("JOOBLE_API_KEY");
  const maxJobsPerTerm = parsePositiveInt(
    process.env.JOOBLE_MAX_JOBS_PER_TERM,
    50,
  );
  const configuredResultsPerPage = parsePositiveInt(
    process.env.JOOBLE_RESULTS_PER_PAGE,
    20,
  );
  const resultsPerPage = Math.min(20, configuredResultsPerPage);
  const searchTerms = parseSearchTerms(
    process.env.JOOBLE_SEARCH_TERMS,
    DEFAULT_SEARCH_TERM,
  );
  const outputJson =
    process.env.JOOBLE_OUTPUT_JSON ||
    join(process.cwd(), "storage/datasets/default/jobs.json");
  const locationQuery =
    process.env.JOOBLE_LOCATION_QUERY?.trim() || "Romania";

  const jobs: ExtractedJob[] = [];

  for (let i = 0; i < searchTerms.length; i += 1) {
    const searchTerm = searchTerms[i];
    const termIndex = i + 1;

    emitProgress({
      event: "term_start",
      termIndex,
      termTotal: searchTerms.length,
      searchTerm,
    });

    let page = 1;
    let termCount = 0;
    while (termCount < maxJobsPerTerm) {
      const remaining = maxJobsPerTerm - termCount;
      const take = Math.min(resultsPerPage, remaining);
      const pageResults = await fetchJobsPage({
        apiKey,
        page,
        keywords: searchTerm,
        location: locationQuery || undefined,
        resultsPerPage: take,
      });

      let mappedOnPage = 0;
      for (const raw of pageResults) {
        if (termCount >= maxJobsPerTerm) break;
        const mapped = mapJob(raw);
        if (!mapped) continue;
        jobs.push(mapped);
        termCount += 1;
        mappedOnPage += 1;
      }

      emitProgress({
        event: "page_fetched",
        termIndex,
        termTotal: searchTerms.length,
        searchTerm,
        pageNo: page,
        resultsOnPage: mappedOnPage,
        totalCollected: termCount,
      });

      if (pageResults.length < take) break;
      page += 1;
      if (page > 100) break;
    }

    emitProgress({
      event: "term_complete",
      termIndex,
      termTotal: searchTerms.length,
      searchTerm,
      jobsFoundTerm: termCount,
    });
  }

  await mkdir(dirname(outputJson), { recursive: true });
  await writeFile(outputJson, `${JSON.stringify(jobs, null, 2)}\n`, "utf-8");
  console.log(`Jooble extractor wrote ${jobs.length} jobs`);
}

run().catch((error: unknown) => {
  const message = error instanceof Error ? error.message : "Unknown error";
  console.error(`Jooble extractor failed: ${message}`);
  process.exitCode = 1;
});