import { runOlxRo } from "./run.js";

const result = await runOlxRo({
  searchTerms: process.env.OLX_RO_SEARCH_TERMS
    ? JSON.parse(process.env.OLX_RO_SEARCH_TERMS)
    : undefined,
  maxJobsPerTerm: process.env.OLX_RO_MAX_JOBS_PER_TERM
    ? Number.parseInt(process.env.OLX_RO_MAX_JOBS_PER_TERM, 10)
    : undefined,
});

if (!result.success) {
  console.error(result.error ?? "OLX România extractor failed");
  process.exit(1);
}

console.log(JSON.stringify(result.jobs, null, 2));