import type { CreateJobInput } from "@shared/types/jobs";
import {
  createLaunchOptions,
  getCloudflareCookieStorageDir,
  isChallengePage,
  loadCookies,
  readCookieJar,
  saveCookies,
  waitForChallengeResolution,
} from "browser-utils";
import { type Browser, firefox, type Page } from "playwright";

const EXTRACTOR_ID = "undelucram";
const DEFAULT_MAX_JOBS_PER_TERM = 50;
const NAVIGATION_TIMEOUT_MS = 60_000;
const REQUEST_TIMEOUT_MS = 45_000;
const PAGE_DELAY_MS = 1_500;

export type UndelucramProgressEvent =
  | {
      type: "term_start";
      termIndex: number;
      termTotal: number;
      searchTerm: string;
    }
  | {
      type: "page_fetched";
      termIndex: number;
      termTotal: number;
      searchTerm: string;
      pageNo: number;
      resultsOnPage: number;
      totalCollected: number;
    }
  | {
      type: "term_complete";
      termIndex: number;
      termTotal: number;
      searchTerm: string;
      jobsFoundTerm: number;
    };

export interface RunUndelucramOptions {
  searchTerms?: string[];
  maxJobsPerTerm?: number;
  onProgress?: (event: UndelucramProgressEvent) => void;
  shouldCancel?: () => boolean;
}

export interface UndelucramResult {
  success: boolean;
  jobs: CreateJobInput[];
  error?: string;
  challengeRequired?: string;
}

async function launchBrowser(): Promise<{
  browser: Browser;
  userAgent?: string;
}> {
  const storageDir = getCloudflareCookieStorageDir();
  const cookieJar = await readCookieJar(EXTRACTOR_ID, storageDir);
  const { launchOptions } = await createLaunchOptions({ headless: true });
  const browser = await firefox.launch(launchOptions);
  return { browser, userAgent: cookieJar.userAgent };
}

async function assertNoBlockingChallenge(
  page: Page,
  url: string,
): Promise<string | null> {
  if (await isChallengePage(page)) {
    const challenge = await waitForChallengeResolution(page, 30_000);
    if (challenge.status === "passed") {
      await saveCookies(page.context(), EXTRACTOR_ID);
      return null;
    }
    return url;
  }
  return null;
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type AnyRecord = Record<string, any>;

function extractJobsFromPage(page: Page): Promise<AnyRecord[]> {
  return page.evaluate(() => {
    const results: AnyRecord[] = [];

    // Undelucram job cards — selectors based on the site's DOM structure
    const jobCards = document.querySelectorAll(
      '[class*="job-card"], [class*="JobCard"], article, [class*="card-job"], .job-item, [data-testid*="job"]',
    );

    // Fallback: try finding elements by common patterns
    const cards: NodeListOf<Element> =
      jobCards.length > 0
        ? jobCards
        : document.querySelectorAll("a[href*='/jobs/'], a[href*='/job/']");

    for (const card of Array.from(cards)) {
      // Try to get the link from an anchor within the card or the card itself
      const anchor =
        card.tagName === "A"
          ? (card as HTMLAnchorElement)
          : card.querySelector("a[href*='/jobs/'], a[href*='/job/']");

      if (!anchor) continue;

      const href = (anchor as HTMLAnchorElement).href || anchor.getAttribute("href") || "";
      if (!href) continue;

      // Build absolute URL
      const absoluteLink = href.startsWith("http")
        ? href
        : `https://www.undelucram.ro${href.startsWith("/") ? "" : "/"}${href}`;

      // Title
      const titleEl =
        card.querySelector('[class*="title"], [class*="Title"], [class*="position"], [class*="job-title"], h2, h3') ?? anchor;
      const title = titleEl.textContent?.trim() || "";

      // Company
      const companyEl = card.querySelector('[class*="company"], [class*="Company"], [class*="employer"], [class*="org"]');
      const company = companyEl?.textContent?.trim() || "";

      // Company URL (if there's a link to the company page)
      const companyAnchor = card.querySelector('a[href*="/companii/"], a[href*="/company/"]');
      const companyUrl = (companyAnchor as HTMLAnchorElement | null)?.href || null;

      // Location
      const locationEl = card.querySelector('[class*="location"], [class*="Location"], [class*="city"], [class*="loc"]');
      const location = locationEl?.textContent?.trim() || null;

      // Salary
      const salaryEl = card.querySelector('[class*="salary"], [class*="Salary"], [class*="pay"], [class*="remunerat"]');
      let salary = salaryEl?.textContent?.trim() || null;

      // Try to find salary in text that matches a pattern
      if (!salary) {
        const allText = card.textContent || "";
        const salaryMatch = allText.match(
          /(\d[\d.,]*\s*[-–]\s*\d[\d.,]*\s*(?:€|EUR|lei|RON|pe lună)?)|(\d[\d.,]*\s*(?:€|EUR|lei|RON)\s*\/\s*lună)/i,
        );
        if (salaryMatch) {
          salary = salaryMatch[0].trim();
        }
      }

      // Date posted
      const dateEl = card.querySelector('[class*="date"], [class*="Date"], [class*="posted"], [class*="ago"], time');
      const datePosted = dateEl?.textContent?.trim() || null;

      // Description snippet
      const descEl = card.querySelector('[class*="description"], [class*="desc"], [class*="snippet"], p');
      const description = descEl?.textContent?.trim() || null;

      results.push({
        title,
        company,
        companyUrl,
        link: absoluteLink,
        location,
        salary,
        datePosted,
        description,
      });
    }

    return results;
  });
}

async function clickNextPage(page: Page): Promise<boolean> {
  // Scroll down to load pagination
  await page.evaluate(() => window.scrollTo(0, document.body.scrollHeight));
  await page.waitForTimeout(900);

  // Try various selectors for "next page" / "următoarea"
  const nextSelectors = [
    page.getByRole("link", { name: /următoarea|next|›|»/i }),
    page.getByRole("button", { name: /următoarea|next|›|»/i }),
    page.locator('a:has-text("Următoarea")'),
    page.locator('a:has-text("Next")'),
    page.locator('[aria-label*="Next" i], [aria-label*="Următoarea" i]'),
    page.locator('[class*="pagination"] a:last-child'),
    page.locator('[class*="pagination"] [rel="next"]'),
    page.locator('[class*="next"] a, [class*="next"] button'),
    // For infinite scroll sites — scroll a bit more
  ];

  for (const locator of nextSelectors) {
    const count = await locator.count().catch(() => 0);
    if (count === 0) continue;
    const first = locator.first();
    if (!(await first.isVisible().catch(() => false))) continue;

    const isDisabled = await first
      .getAttribute("disabled")
      .catch(() => null);
    if (isDisabled !== null) continue;

    await first.click({ timeout: 7_000 });
    return true;
  }

  // Try finding a next-page link in a numbered pagination (e.g., page=2)
  const paginationLinks = page.locator('[class*="pagination"] a');
  const linkCount = await paginationLinks.count().catch(() => 0);
  for (let i = 0; i < linkCount; i++) {
    const href = await paginationLinks.nth(i).getAttribute("href").catch(() => null);
    if (href && href.includes("page=")) {
      const currentUrl = page.url();
      const currentPageMatch = currentUrl.match(/[?&]page=(\d+)/);
      const linkPageMatch = href.match(/[?&]page=(\d+)/);
      if (
        linkPageMatch &&
        currentPageMatch &&
        Number.parseInt(linkPageMatch[1], 10) ===
          Number.parseInt(currentPageMatch[1], 10) + 1
      ) {
        await paginationLinks.nth(i).click({ timeout: 7_000 });
        return true;
      }
    }
  }

  return false;
}

function mapUndelucramJob(
  raw: Record<string, unknown>,
): CreateJobInput | null {
  const title = typeof raw.title === "string" ? raw.title : "Unknown Title";
  const employer = typeof raw.company === "string" ? raw.company : "Unknown Employer";
  const link = typeof raw.link === "string" ? raw.link : "";

  if (!link) return null;

  return {
    source: "undelucram",
    title,
    employer,
    employerUrl: typeof raw.companyUrl === "string" ? raw.companyUrl : undefined,
    jobUrl: link,
    location: typeof raw.location === "string" ? raw.location : undefined,
    salary: typeof raw.salary === "string" ? raw.salary : undefined,
    datePosted: typeof raw.datePosted === "string" ? raw.datePosted : undefined,
    jobDescription: typeof raw.description === "string" ? raw.description : undefined,
  };
}

async function collectForTerm(params: {
  browser: Browser;
  userAgent?: string;
  searchTerm: string;
  maxJobsPerTerm: number;
  onPage: (pageNo: number, jobs: CreateJobInput[]) => void;
  shouldCancel?: () => boolean;
}): Promise<{ jobs: CreateJobInput[]; challengeRequired?: string }> {
  const searchUrl = new URL("https://www.undelucram.ro/jobs");
  searchUrl.searchParams.set("q", params.searchTerm);

  const storageDir = getCloudflareCookieStorageDir();
  const context = await params.browser.newContext({
    viewport: { width: 1440, height: 900 },
    ...(params.userAgent ? { userAgent: params.userAgent } : {}),
  });
  await loadCookies(context, EXTRACTOR_ID, storageDir);
  const page = await context.newPage();
  const jobs: CreateJobInput[] = [];
  const maxPages = Math.max(1, Math.ceil(params.maxJobsPerTerm / 15));

  try {
    await page.goto(searchUrl.toString(), {
      waitUntil: "domcontentloaded",
      timeout: NAVIGATION_TIMEOUT_MS,
    });
    const firstChallenge = await assertNoBlockingChallenge(
      page,
      searchUrl.toString(),
    );
    if (firstChallenge) {
      return { jobs: [], challengeRequired: firstChallenge };
    }

    // Wait for job cards to load
    await page.waitForTimeout(2_000);

    // Try to wait for content to appear
    try {
      await page.waitForSelector(
        '[class*="job-card"], [class*="JobCard"], article, [class*="card-job"], [class*="pagination"], [class*="result"]',
        { timeout: 10_000 },
      );
    } catch {
      // Page loaded without matching selectors — that's okay, extractJobsFromPage will handle it
    }

    const firstBatch = await extractJobsFromPage(page);
    const mappedFirstBatch = firstBatch
      .map((j) => mapUndelucramJob(j))
      .filter((j): j is CreateJobInput => j !== null);
    jobs.push(...mappedFirstBatch);
    params.onPage(1, mappedFirstBatch);

    for (let pageNo = 2; pageNo <= maxPages; pageNo += 1) {
      if (params.shouldCancel?.() || jobs.length >= params.maxJobsPerTerm) {
        break;
      }

      const clicked = await clickNextPage(page);
      if (!clicked) break;

      await page.waitForTimeout(PAGE_DELAY_MS);

      const challenge = await assertNoBlockingChallenge(page, page.url());
      if (challenge) {
        return { jobs: [], challengeRequired: challenge };
      }

      const batch = await extractJobsFromPage(page);
      const mappedBatch = batch
        .map((j) => mapUndelucramJob(j))
        .filter((j): j is CreateJobInput => j !== null);
      jobs.push(...mappedBatch);
      params.onPage(pageNo, mappedBatch);
    }

    return { jobs: jobs.slice(0, params.maxJobsPerTerm) };
  } finally {
    await context.close();
  }
}

export async function runUndelucram(
  options: RunUndelucramOptions = {},
): Promise<UndelucramResult> {
  const searchTerms =
    options.searchTerms && options.searchTerms.length > 0
      ? options.searchTerms
      : ["software engineer"];
  const maxJobsPerTerm = options.maxJobsPerTerm ?? DEFAULT_MAX_JOBS_PER_TERM;
  const termTotal = searchTerms.length;
  const allJobs: CreateJobInput[] = [];
  let browser: Browser | undefined;
  let userAgent: string | undefined;

  try {
    const launched = await launchBrowser();
    browser = launched.browser;
    userAgent = launched.userAgent;

    for (let i = 0; i < searchTerms.length; i += 1) {
      if (options.shouldCancel?.()) {
        return { success: true, jobs: allJobs };
      }

      const searchTerm = searchTerms[i];
      const termIndex = i + 1;

      options.onProgress?.({
        type: "term_start",
        termIndex,
        termTotal,
        searchTerm,
      });

      let totalCollected = 0;
      const result = await collectForTerm({
        browser,
        userAgent,
        searchTerm,
        maxJobsPerTerm,
        shouldCancel: options.shouldCancel,
        onPage: (pageNo, pageJobs) => {
          totalCollected += pageJobs.length;
          options.onProgress?.({
            type: "page_fetched",
            termIndex,
            termTotal,
            searchTerm,
            pageNo,
            resultsOnPage: pageJobs.length,
            totalCollected,
          });
        },
      });

      if (result.challengeRequired) {
        return {
          success: false,
          jobs: [],
          challengeRequired: result.challengeRequired,
        };
      }

      allJobs.push(...result.jobs);
      options.onProgress?.({
        type: "term_complete",
        termIndex,
        termTotal,
        searchTerm,
        jobsFoundTerm: result.jobs.length,
      });
    }

    return { success: true, jobs: allJobs };
  } catch (error) {
    return {
      success: false,
      jobs: [],
      error:
        error instanceof Error
          ? error.message
          : "Unexpected error while running Undelucram extractor.",
    };
  } finally {
    await browser?.close();
  }
}