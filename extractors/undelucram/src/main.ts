import { runUndelucram } from "./run.js";

const result = await runUndelucram({
  searchTerms: process.env.UNDELUCRAM_SEARCH_TERMS
    ? JSON.parse(process.env.UNDELUCRAM_SEARCH_TERMS)
    : undefined,
  maxJobsPerTerm: process.env.UNDELUCRAM_MAX_JOBS_PER_TERM
    ? Number.parseInt(process.env.UNDELUCRAM_MAX_JOBS_PER_TERM, 10)
    : undefined,
});

if (!result.success) {
  console.error(result.error ?? "Undelucram extractor failed");
  process.exit(1);
}

console.log(JSON.stringify(result.jobs, null, 2));