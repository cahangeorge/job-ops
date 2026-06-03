import type { CreateJobInput } from "@shared/types/jobs";

const HIPO_BASE_URL = "https://www.hipo.ro";

export type HipoProgressEvent =
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

export interface RunHipoOptions {
  searchTerms?: string[];
  maxJobsPerTerm?: number;
  onProgress?: (event: HipoProgressEvent) => void;
  shouldCancel?: () => boolean;
}

export interface HipoResult {
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

export async function runHipo(
  options: RunHipoOptions = {},
): Promise<HipoResult> {
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
      locale: "ro-RO",
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
            ? `${HIPO_BASE_URL}/locuri-de-munca/cauta?cuvantCheie=${encodeURIComponent(searchTerm)}`
            : `${HIPO_BASE_URL}/locuri-de-munca/cauta?cuvantCheie=${encodeURIComponent(searchTerm)}&pagina=${pageNo}`;

          console.error(`Hipo: fetching ${searchUrl}`);
          await page.goto(searchUrl, {
            waitUntil: "networkidle",
            timeout: 30_000,
          });

          // Wait for job listing content
          await page.waitForTimeout(2000);

          // Extract job data from the page
          const jobCards = await page.evaluate((baseUrl: string) => {
            const cards: Array<{
              title: string;
              link: string;
              employer: string;
              location: string;
              salary: string;
              datePosted: string;
              description: string;
            }> = [];

            // Hipo job listing cards — look for common patterns
            const listingElements = document.querySelectorAll<HTMLElement>(
              '[class*="job-list-item"], [class*="jobItem"], [class*="listing-item"], tr[class*="job"], [class*="job-listing"], article, [class*="card-job"]',
            );

            // If no structured cards found, look for all links that match Hipo job URL pattern
            let elements: NodeListOf<Element>;
            if (listingElements.length > 0) {
              elements = listingElements;
            } else {
              elements = document.querySelectorAll("a[href*='/loc-de-munca/'], a[href*='/job/'], a[href*='/post/'], h3 a, h2 a");
            }

            for (const el of Array.from(elements)) {
              let card = el;

              // Find the title and link
              let titleEl: HTMLElement | null = null;
              let linkEl: HTMLAnchorElement | null = null;

              if (el.tagName === "A") {
                linkEl = el as HTMLAnchorElement;
                titleEl = el.querySelector("h3, h2, strong, [class*='title'], [class*='position'], b") as HTMLElement;
              } else {
                linkEl = el.querySelector<HTMLAnchorElement>(
                  "a[href*='/loc-de-munca/'], a[href*='/job/'], a[href*='/post/'], h3 a, h2 a, a[class*='title']",
                );
                titleEl = el.querySelector<HTMLElement>(
                  "h3, h2, [class*='title'], [class*='position'], strong, b",
                );
              }

              if (!linkEl) continue;
              const href = linkEl.getAttribute("href");
              if (!href) continue;

              let jobUrl: string;
              try {
                jobUrl = href.startsWith("http") ? href : new URL(href, baseUrl).toString();
              } catch {
                continue;
              }

              const title = titleEl?.textContent?.trim() ?? linkEl.textContent?.trim() ?? "";
              if (!title) continue;

              // Company
              const companyEl = card.querySelector<HTMLElement>(
                '[class*="company"], [class*="employer"], [class*="org"], [class*="firma"], [itemprop*="name"]',
              );
              const employer = companyEl?.textContent?.trim() ?? "";

              // Location
              const locationEl = card.querySelector<HTMLElement>(
                '[class*="location"], [class*="city"], [class*="oras"], [class*="loc"], [itemprop*="addressLocality"]',
              );
              const location = locationEl?.textContent?.trim() ?? "";

              // Salary
              const salaryEl = card.querySelector<HTMLElement>(
                '[class*="salary"], [class*="remunerat"], [class*="pay"], [class*="salariu"]',
              );
              let salary = salaryEl?.textContent?.trim() ?? "";
              if (!salary) {
                const allText = card.textContent ?? "";
                const m = allText.match(/(\d[\d\s]*\d\s*(?:€|EUR|lei|RON|euro|USD))\s*(?:[-–]\s*(\d[\d\s]*\d\s*(?:€|EUR|lei|RON|euro|USD)))?/i);
                if (m) salary = m[0].trim();
              }

              // Date
              const dateEl = card.querySelector<HTMLElement>(
                '[class*="date"], [class*="posted"], [class*="ago"], time, [class*="data"]',
              );
              const datePosted = dateEl?.textContent?.trim() ?? "";

              // Description
              const descEl = card.querySelector<HTMLElement>(
                '[class*="description"], [class*="desc"], [class*="snippet"], p, [class*="descriere"]',
              );
              const description = descEl?.textContent?.trim() ?? "";

              cards.push({
                title,
                link: jobUrl,
                employer,
                location,
                salary,
                datePosted,
                description,
              });
            }

            return cards;
          }, HIPO_BASE_URL);

          console.error(`Hipo: found ${jobCards.length} cards on page ${pageNo}`);

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
              source: "hipo",
              title: job.title,
              employer: job.employer || "Unknown Employer",
              jobUrl: job.link,
              applicationLink: job.link,
              location: job.location || undefined,
              salary: job.salary || undefined,
              datePosted: job.datePosted || undefined,
              jobDescription: job.description || undefined,
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
            const pagLinks = document.querySelectorAll(
              'a[href*="pagina="], [class*="pagination"] a:not([class*="active"])',
            );
            // Check if there's a non-active next page link
            for (let pi = 0; pi < pagLinks.length; pi++) {
              const link = pagLinks[pi] as HTMLAnchorElement;
              const text = link.textContent?.trim().toLowerCase() ?? "";
              if (text === "următoarea" || text === "next" || text === "›" || text === "»") return true;
              // Also check if it's a numbered page beyond what we've seen
              const pageNum = parseInt(text, 10);
              if (!isNaN(pageNum) && pageNum > 0) return true;
            }
            return false;
          });

          pageNo += 1;
          if (hasMorePages) {
            await new Promise((r) => setTimeout(r, 1500));
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
          : "Unexpected error while running Hipo extractor.";

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