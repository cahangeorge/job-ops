import type { CreateJobInput } from "@shared/types/jobs";

const EJOBS_BASE_URL = "https://www.ejobs.ro";
const EJOBS_SEARCH_URL = `${EJOBS_BASE_URL}/locuri-de-munca`;

export type EJobsProgressEvent =
  | {
      type: "term_start";
      termIndex: number;
      termTotal: number;
      searchTerm: string;
    }
  | {
      type: "page_complete";
      termIndex: number;
      termTotal: number;
      searchTerm: string;
      page: number;
      jobsFoundPage: number;
      totalCollected: number;
    }
  | {
      type: "term_complete";
      termIndex: number;
      termTotal: number;
      searchTerm: string;
      jobsFoundTerm: number;
    };

export interface RunEJobsOptions {
  searchTerms?: string[];
  maxJobsPerTerm?: number;
  onProgress?: (event: EJobsProgressEvent) => void;
  shouldCancel?: () => boolean;
}

export interface EJobsResult {
  success: boolean;
  jobs: CreateJobInput[];
  error?: string;
}

function toPositiveIntOrFallback(
  value: number | string | undefined,
  fallback: number,
): number {
  const parsed =
    typeof value === "number"
      ? value
      : typeof value === "string"
        ? Number.parseInt(value, 10)
        : Number.NaN;

  if (!Number.isFinite(parsed)) return fallback;
  return Math.max(1, Math.floor(parsed));
}

function extractJobCardData(card: Element, baseUrl: string): CreateJobInput | null {
  const titleEl = card.querySelector(".job-card-content-middle__title a span, .job-card-content-middle__title a");
  const title = titleEl?.textContent?.trim();
  if (!title) return null;

  const linkEl = card.querySelector("a[href*='/loc-de-munca/']");
  const relativeLink = linkEl?.getAttribute("href") ?? "";
  let jobUrl = "";
  try {
    jobUrl = relativeLink.startsWith("http")
      ? relativeLink
      : new URL(relativeLink, baseUrl).toString();
  } catch {
    return null;
  }

  const companyEl = card.querySelector(".job-card-content-middle__info--darker a, .job-card-content-middle__info--darker");
  const employer = companyEl?.textContent?.trim() ?? "Unknown Employer";

  const locationEl = card.querySelector(".job-card-content-middle__info:not(.job-card-content-middle__info--darker)");
  const location = locationEl?.textContent?.trim() ?? undefined;

  const salaryEl = card.querySelector(".job-card-content-middle__salary");
  const salary = salaryEl?.textContent?.trim() ?? undefined;

  const dateEl = card.querySelector(".job-card-content-top__date");
  const datePosted = dateEl?.textContent?.trim() ?? undefined;

  // Try to extract description from hidden content
  const descEl = card.querySelector(".job-card-hidden-content");
  const jobDescription = descEl?.textContent?.trim() ?? undefined;

  return {
    source: "ejobs" as const,
    title,
    employer,
    jobUrl,
    applicationLink: jobUrl,
    location,
    salary,
    datePosted,
    jobDescription,
  };
}

export async function runEJobs(
  options: RunEJobsOptions = {},
): Promise<EJobsResult> {
  const searchTerms =
    options.searchTerms && options.searchTerms.length > 0
      ? options.searchTerms
      : ["software developer"];
  const maxJobsPerTerm = toPositiveIntOrFallback(options.maxJobsPerTerm, 50);
  const seen = new Set<string>();
  const allJobs: CreateJobInput[] = [];

  try {
    // Dynamically import camoufox-js and playwright
    const { launchOptions } = await import("camoufox-js");
    const { chromium } = await import("playwright");

    const launchOpts = await launchOptions({
      headless: true,
      humanize: true,
      geoip: true,
      block_webrtc: true,
    });

    const browser = await chromium.launch(launchOpts);
    const context = await browser.newContext({
      userAgent:
        "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36",
      viewport: { width: 1920, height: 1080 },
    });
    const page = await context.newPage();

    try {
      for (const [index, searchTerm] of searchTerms.entries()) {
        if (options.shouldCancel?.()) {
          return { success: true, jobs: allJobs };
        }

        const termIndex = index + 1;
        const termTotal = searchTerms.length;

        options.onProgress?.({
          type: "term_start",
          termIndex,
          termTotal,
          searchTerm,
        });

        let pageNo = 1;
        let jobsFoundTerm = 0;
        let hasMorePages = true;

        while (hasMorePages && jobsFoundTerm < maxJobsPerTerm) {
          if (options.shouldCancel?.()) {
            return { success: true, jobs: allJobs };
          }

          const searchUrl = pageNo === 1
            ? `${EJOBS_SEARCH_URL}/${encodeURIComponent(searchTerm)}`
            : `${EJOBS_SEARCH_URL}/${encodeURIComponent(searchTerm)}?page=${pageNo}`;

          console.error(`eJobs: fetching ${searchUrl}`);
          await page.goto(searchUrl, {
            waitUntil: "networkidle",
            timeout: 30_000,
          });

          // Wait for job cards to render
          await page.waitForSelector(".job-card", { timeout: 15_000 }).catch(() => {
            // No job cards found — might be empty result
          });

          const cards = await page.$$(".job-card-wrapper--visible .job-card, .job-card");
          console.error(`eJobs: found ${cards.length} cards on page ${pageNo}`);

          if (cards.length === 0) {
            hasMorePages = false;
            break;
          }

          let jobsFoundPage = 0;
          for (const card of cards) {
            if (jobsFoundTerm >= maxJobsPerTerm) break;
            if (options.shouldCancel?.()) return { success: true, jobs: allJobs };

            const jobData = await page.evaluate((el) => {
              const card = el as HTMLElement;

              const titleEl = card.querySelector(".job-card-content-middle__title a span, .job-card-content-middle__title a");
              const title = titleEl?.textContent?.trim() ?? null;

              const linkEl = card.querySelector("a[href*='/loc-de-munca/']");
              const link = linkEl?.getAttribute("href") ?? null;

              const companyEl = card.querySelector(".job-card-content-middle__info--darker a, .job-card-content-middle__info--darker");
              const employer = companyEl?.textContent?.trim() ?? null;

              const locationEl = card.querySelector(".job-card-content-middle__info:not(.job-card-content-middle__info--darker)");
              const location = locationEl?.textContent?.trim() ?? null;

              const salaryEl = card.querySelector(".job-card-content-middle__salary");
              const salary = salaryEl?.textContent?.trim() ?? null;

              const dateEl = card.querySelector(".job-card-content-top__date");
              const datePosted = dateEl?.textContent?.trim() ?? null;

              const descEl = card.querySelector(".job-card-hidden-content");
              const jobDescription = descEl?.textContent?.trim() ?? null;

              return { title, link, employer, location, salary, datePosted, jobDescription };
            }, card);

            if (!jobData.title || !jobData.link) continue;

            let jobUrl: string;
            try {
              jobUrl = jobData.link.startsWith("http")
                ? jobData.link
                : new URL(jobData.link, EJOBS_BASE_URL).toString();
            } catch {
              continue;
            }

            const dedupeKey = jobUrl;
            if (seen.has(dedupeKey)) continue;
            seen.add(dedupeKey);

            allJobs.push({
              source: "ejobs" as const,
              title: jobData.title,
              employer: jobData.employer ?? "Unknown Employer",
              jobUrl,
              applicationLink: jobUrl,
              location: jobData.location ?? undefined,
              salary: jobData.salary ?? undefined,
              datePosted: jobData.datePosted ?? undefined,
              jobDescription: jobData.jobDescription ?? undefined,
            });

            jobsFoundTerm += 1;
            jobsFoundPage += 1;
          }

          options.onProgress?.({
            type: "page_complete",
            termIndex,
            termTotal,
            searchTerm,
            page: pageNo,
            jobsFoundPage,
            totalCollected: allJobs.length,
          });

          // Check for next page
          const nextButton = await page.$("a.next, .pagination a:has-text('»'), .pagination a:has-text('Next')");
          hasMorePages = nextButton !== null;
          pageNo += 1;

          if (hasMorePages) {
            // Small delay between pages
            await new Promise((r) => setTimeout(r, 1000));
          }
        }

        options.onProgress?.({
          type: "term_complete",
          termIndex,
          termTotal,
          searchTerm,
          jobsFoundTerm,
        });
      }
    } finally {
      await browser.close();
    }

    return { success: true, jobs: allJobs };
  } catch (error) {
    const message =
      error instanceof Error
        ? error.message
        : typeof error === "string"
          ? error
          : "Unexpected error while running eJobs extractor.";

    const missingBrowser =
      /playwright|browser|executable/i.test(message) &&
      /install/i.test(message);
    return {
      success: false,
      jobs: [],
      error: missingBrowser
        ? `${message}. Install browser binaries with 'npx playwright install'.`
        : message,
    };
  }
}