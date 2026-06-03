import type { CreateJobInput } from "@shared/types/jobs";

const BESTJOBS_BASE_URL = "https://www.bestjobs.eu";

export type BestJobsProgressEvent =
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

export interface RunBestJobsOptions {
  searchTerms?: string[];
  maxJobsPerTerm?: number;
  onProgress?: (event: BestJobsProgressEvent) => void;
  shouldCancel?: () => boolean;
}

export interface BestJobsResult {
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

export async function runBestJobs(
  options: RunBestJobsOptions = {},
): Promise<BestJobsResult> {
  const searchTerms =
    options.searchTerms && options.searchTerms.length > 0
      ? options.searchTerms
      : ["software developer"];
  const maxJobsPerTerm = toPositiveIntOrFallback(options.maxJobsPerTerm, 50);
  const seen = new Set<string>();
  const allJobs: CreateJobInput[] = [];

  try {
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
      for (let si = 0; si < searchTerms.length; si++) {
        if (options.shouldCancel?.()) {
          return { success: true, jobs: allJobs };
        }

        const searchTerm = searchTerms[si];
        const termIndex = si + 1;
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
            ? `${BESTJOBS_BASE_URL}/ro/locuri-de-munca-in-romania?query=${encodeURIComponent(searchTerm)}`
            : `${BESTJOBS_BASE_URL}/ro/locuri-de-munca-in-romania?query=${encodeURIComponent(searchTerm)}&page=${pageNo}`;

          await page.goto(searchUrl, {
            waitUntil: "networkidle",
            timeout: 30_000,
          });

          // Wait for job cards to render
          await page.waitForSelector("h2.line-clamp-2", { timeout: 15_000 }).catch(() => {});

          // Extract job cards via evaluate
          const jobCards = await page.evaluate((baseUrl: string) => {
            const cards: Array<{
              title: string;
              link: string;
              employer: string;
              location: string;
              salary: string;
            }> = [];

            const titleElements = document.querySelectorAll("h2.line-clamp-2");
            for (let ti = 0; ti < titleElements.length; ti++) {
              const titleEl = titleElements[ti] as HTMLElement;
              const title = titleEl.textContent?.trim();
              if (!title) continue;

              const card = titleEl.closest("[class*='flex-col']") || titleEl.closest("[class*='rounded-md']");
              if (!card) continue;

              const linkE = card.querySelector("a[href*='/loc-de-munca/']") as HTMLAnchorElement | null;
              const href = linkE?.getAttribute("href");
              if (!href) continue;

              let jobUrl: string;
              try {
                jobUrl = href.startsWith("http") ? href : new URL(href, baseUrl).toString();
              } catch {
                continue;
              }

              const employerE = card.querySelector(".text-ink-medium") as HTMLElement | null;
              const employer = employerE?.textContent?.trim() ?? "Unknown Employer";

              const locationEls = card.querySelectorAll(".tracking-wider");
              let location = "";
              for (let li = 0; li < locationEls.length; li++) {
                const el = locationEls[li] as HTMLElement;
                const text = el.textContent?.trim();
                if (text && text.length > 3 && !text.includes("Salariu") && !text.includes("Estimare")) {
                  location = text;
                  break;
                }
              }

              const allText = card.textContent ?? "";
              const salaryMatch = allText.match(/(\d[\d\s]*\d\s*(?:lei|€|EUR|RON|euro))\s*(?:[-–]\s*(\d[\d\s]*\d\s*(?:lei|€|EUR|RON|euro)))?/i);
              const salary = salaryMatch ? salaryMatch[0].trim() : "";

              cards.push({
                title,
                link: jobUrl,
                employer,
                location: location || "",
                salary,
              });
            }

            return cards;
          }, BESTJOBS_BASE_URL);

          if (jobCards.length === 0) {
            hasMorePages = false;
            break;
          }

          let jobsFoundPage = 0;
          for (const job of jobCards) {
            if (jobsFoundTerm >= maxJobsPerTerm) break;
            if (options.shouldCancel?.()) return { success: true, jobs: allJobs };

            const dedupeKey = job.link;
            if (seen.has(dedupeKey)) continue;
            seen.add(dedupeKey);

            allJobs.push({
              source: "bestjobs",
              title: job.title,
              employer: job.employer,
              jobUrl: job.link,
              applicationLink: job.link,
              location: job.location || undefined,
              salary: job.salary || undefined,
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
          hasMorePages = await page.evaluate(() => {
            const nextLinks = document.querySelectorAll("a[href*='page=']");
            for (let ni = 0; ni < nextLinks.length; ni++) {
              const link = nextLinks[ni] as HTMLAnchorElement;
              const text = link.textContent?.trim().toLowerCase() ?? "";
              if (text === "next" || text === "urmatoarea" || text === "›" || text === "»") {
                return true;
              }
            }
            const paginationItems = document.querySelectorAll("[class*='pagination'] a, [class*='pagination'] button");
            if (paginationItems.length > 0) {
              const lastItem = paginationItems[paginationItems.length - 1];
              const lastText = lastItem.textContent?.trim().toLowerCase() ?? "";
              return lastText === "next" || lastText === "urmatoarea" || lastText === "›" || lastText === "»";
            }
            return false;
          });

          pageNo += 1;
          if (hasMorePages) {
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
          : "Unexpected error while running BestJobs extractor.";

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