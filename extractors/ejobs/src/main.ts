import { mkdir, writeFile } from "node:fs/promises";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { parseSearchTerms } from "@shared/utils/search-terms.js";
import { runEJobs } from "./run.js";

const __dirname = dirname(fileURLToPath(import.meta.url));
const DEFAULT_SEARCH_TERM = "software developer";
const DEFAULT_MAX_JOBS_PER_TERM = 50;

function parsePositiveInt(input: string | undefined, fallback: number): number {
  const parsed = input ? Number.parseInt(input, 10) : Number.NaN;
  if (!Number.isFinite(parsed) || parsed < 1) return fallback;
  return parsed;
}

function emitProgress(payload: Record<string, unknown>): void {
  if (process.env.JOBOPS_EMIT_PROGRESS !== "1") return;
  console.log(`JOBOPS_PROGRESS ${JSON.stringify(payload)}`);
}

async function run(): Promise<void> {
  const outputPath =
    process.env.EJOBS_OUTPUT_JSON ||
    join(__dirname, "../storage/datasets/default/jobs.json");

  const result = await runEJobs({
    searchTerms: parseSearchTerms(
      process.env.EJOBS_SEARCH_TERMS ?? process.env.HIRING_CAFE_SEARCH_TERMS,
      DEFAULT_SEARCH_TERM,
    ),
    maxJobsPerTerm: parsePositiveInt(
      process.env.EJOBS_MAX_JOBS_PER_TERM ?? process.env.JOBSPY_RESULTS_WANTED,
      DEFAULT_MAX_JOBS_PER_TERM,
    ),
    onProgress: (event) => {
      emitProgress({
        event: event.type,
        termIndex: event.termIndex,
        termTotal: event.termTotal,
        searchTerm: event.searchTerm,
        page: "page" in event ? event.page : undefined,
        jobsFoundPage: "jobsFoundPage" in event ? event.jobsFoundPage : undefined,
        totalCollected: "totalCollected" in event ? event.totalCollected : undefined,
        jobsFoundTerm: "jobsFoundTerm" in event ? event.jobsFoundTerm : undefined,
      });
    },
  });

  if (!result.success) {
    throw new Error(result.error ?? "eJobs extractor failed");
  }

  await mkdir(dirname(outputPath), { recursive: true });
  await writeFile(outputPath, `${JSON.stringify(result.jobs, null, 2)}\n`);
  console.log(`eJobs extractor wrote ${result.jobs.length} jobs`);
}

run().catch((error: unknown) => {
  const message = error instanceof Error ? error.message : "Unknown error";
  console.error(`eJobs extractor failed: ${message}`);
  process.exitCode = 1;
});