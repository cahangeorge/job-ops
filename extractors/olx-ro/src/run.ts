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

const EXTRACTOR_ID = "olx-ro";
const DEFAULT_MAX_JOBS_PER_TERM = 50;
const NAVIGATION_TIMEOUT_MS = 60_000;
const PAGE_DELAY_MS = 2_000;

export type OlxRoProgressEvent =
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

export interface RunOlxRoOptions {
  searchTerms?: string[];
  maxJobsPerTerm?: number;
  onProgress?: (event: OlxRoProgressEvent) => void;
  shouldCancel?: () => boolean;
}

export interface OlxRoResult {
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

function extractOlxListingsFromPage(page: Page): Promise<AnyRecord[]> {
  return page.evaluate(() => {
    const results: AnyRecord[] = [];

    // Common OLX listing card selectors
    const listingCards = document.querySelectorAll(
      '[data-cy*="l-card"], [data-cy*="ad"], [class*="offer-wrapper"], [class*="listing-card"], [class*="listItem"], [class*="css-"] div[class*="offer"], article',
    );

    let cards: NodeListOf<Element>;
    if (listingCards.length > 0) {
      cards = listingCards;
    } else {
      // Fallback: look for link-based cards
      cards = document.querySelectorAll(
        'a[href*="/d/"]:not([href*="/d/aut"]):not([href*="/d/electronice"]):not([href*="/d/casa"]):not([href*="/d/moda"]):not([href*="/d/hobby"]):not([href*="/d/anunturi"])',
      );
    }

    for (const card of Array.from(cards)) {
      // Find anchor with link to listing
      let anchor: HTMLAnchorElement | null = null;
      let link = "";

      if (card.tagName === "A") {
        anchor = card as HTMLAnchorElement;
        link = anchor.href || "";
      } else {
        // Try OLX-specific selectors for the title/link
        const titleLink =
          card.querySelector<HTMLAnchorElement>(
            'a[href*="/d/"], a[class*="title"], a[class*="link"], h4 a, h3 a, a[class*="ListItem"]',
          ) ??
          card.querySelector<HTMLAnchorElement>(
            'a[href*="olx.ro/d/"], [class*="title"] a',
          );
        if (titleLink) {
          anchor = titleLink;
          link = titleLink.href || "";
        }
      }

      if (!anchor || !link) continue;

      // Ensure absolute URL
      const absoluteLink = link.startsWith("http")
        ? link
        : `https://www.olx.ro${link.startsWith("/") ? "" : "/"}${link}`;

      // Title
      const titleEl =
        card.querySelector(
          '[class*="title"], [class*="Title"], h4, h3, [class*="heading"], [class*="ListItemTitle"]',
        ) ?? anchor;
      const title = titleEl?.textContent?.trim() || "";

      // Price / salary
      const priceEl = card.querySelector(
        '[class*="price"], [class*="Price"], [data-testid*="price"], [class*="salary"]',
      );
      const price = priceEl?.textContent?.trim() || null;

      // Location
      const locationEl = card.querySelector(
        '[class*="location"], [class*="Location"], [data-testid*="location"], [class*="city"], [class*="breadcrumb"] span, [class*="region"]',
      );
      let location = locationEl?.textContent?.trim() || null;

      // OLX sometimes includes date in the same line as location, split by "-"
      if (location) {
        location = location.split("-")[0]?.trim() || location;
      }

      // Date posted
      const dateEl = card.querySelector(
        '[class*="date"], [class*="Date"], [class*="time"], [class*="ago"], time, [data-testid*="date"]',
      );
      let datePosted = dateEl?.textContent?.trim() || null;

      // Sometimes date is in the listing breadcrumbs or footer
      if (!datePosted) {
        const footerText =
          card.querySelector('[class*="bottom"], [class*="footer"], [class*="meta"]')?.textContent ||
          "";
        const dateMatch = footerText.match(
          /(azi|ieri|acum \d+ (minut|oră|ore|zi|zile|săptămână|săptămâni|lună|luni))\s*[-–]\s*/i,
        );
        if (dateMatch) {
          datePosted = dateMatch[1];
        }
      }

      // Company / employer (OLX is peer-to-peer, often no company)
      const sellerEl = card.querySelector(
        '[class*="seller"], [class*="Seller"], [class*="user"], [class*="username"], [class*="author"], [class*="by"]',
      );
      const employer = sellerEl?.textContent?.trim() || null;

      // Description snippet
      const descEl = card.querySelector(
        '[class*="description"], [class*="desc"], [class*="snippet"], p, [class*="text"]',
      );
      const description = descEl?.textContent?.trim() || null;

      results.push({
        title,
        link: absoluteLink,
        salary: price,
        location,
        datePosted,
        employer,
        description,
      });
    }

    return results;
  });
}

async function clickNextPage(page: Page): Promise<boolean> {
  await page.evaluate(() => window.scrollTo(0, document.body.scrollHeight));
  await page.waitForTimeout(900);

  // OLX pagination — usually near the bottom
  const nextSelectors = [
    page.getByRole("link", { name: /următoarea|next|înainte|›|»/i }),
    page.getByRole("button", { name: /următoarea|next|înainte|›|»/i }),
    page.locator('a:has-text("Următoarea")'),
    page.locator('a:has-text("Next")'),
    page.locator('[aria-label*="Next" i], [aria-label*="Următoarea" i]'),
    page.locator('[class*="pagination"] a:last-child'),
    page.locator('[class*="pagination"] [rel="next"]'),
    page.locator('[class*="next"] a, [class*="next"] button'),
    page.locator('a[data-testid*="next"]'),
    // OLX specific: page number links
    page.locator('[class*="pagination"] a:not([class*="active"])'),
  ];

  for (const locator of nextSelectors) {
    const count = await locator.count().catch(() => 0);
    if (count === 0) continue;
    const first = locator.first();
    if (!(await first.isVisible().catch(() => false))) continue;
    const isDisabled = await first.getAttribute("disabled").catch(() => null);
    if (isDisabled !== null) continue;

    await first.click({ timeout: 7_000 });
    return true;
  }

  // Try numbered pagination: find the current page link and click the next one
  const paginationLinks = page.locator('[class*="pagination"] a, a[href*="page="]');
  const linkCount = await paginationLinks.count().catch(() => 0);

  // Find current page
  let currentPage = 0;
  for (let i = 0; i < linkCount; i++) {
    const classes = await paginationLinks
      .nth(i)
      .getAttribute("class")
      .catch(() => null);
    const text = (await paginationLinks.nth(i).textContent().catch(() => "")) || "";
    if (
      (classes && classes.includes("active")) ||
      (classes && classes.includes("current"))
    ) {
      currentPage = Number.parseInt(text.trim(), 10);
      break;
    }
  }

  // Try to click the link for the next page number
  if (currentPage > 0) {
    const targetPageText = String(currentPage + 1);
    const nextPageLink = paginationLinks.filter({
      hasText: targetPageText,
    });
    if ((await nextPageLink.count()) > 0) {
      await nextPageLink.first().click({ timeout: 7_000 });
      return true;
    }
  }

  return false;
}

function mapOlxRoJob(raw: Record<string, unknown>): CreateJobInput | null {
  const title = typeof raw.title === "string" ? raw.title : "Unknown Title";
  const link = typeof raw.link === "string" ? raw.link : "";

  if (!link) return null;

  const employer = typeof raw.employer === "string" ? raw.employer : undefined;

  return {
    source: "olx-ro",
    title,
    employer: employer || "OLX România Listing",
    jobUrl: link,
    salary: typeof raw.salary === "string" ? raw.salary : undefined,
    location: typeof raw.location === "string" ? raw.location : undefined,
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
  const searchUrl = new URL(
    `https://www.olx.ro/locuri-de-munca/q-${encodeURIComponent(params.searchTerm)}/`,
  );

  const storageDir = getCloudflareCookieStorageDir();
  const context = await params.browser.newContext({
    viewport: { width: 1440, height: 900 },
    ...(params.userAgent ? { userAgent: params.userAgent } : {}),
  });
  await loadCookies(context, EXTRACTOR_ID, storageDir);
  const page = await context.newPage();
  const jobs: CreateJobInput[] = [];
  const maxPages = Math.max(1, Math.ceil(params.maxJobsPerTerm / 20));

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

    await page.waitForTimeout(3_000);

    // Try to wait for listing content to appear
    try {
      await page.waitForSelector(
        '[data-cy*="l-card"], [class*="offer"], [class*="listing"], [class*="pagination"]',
        { timeout: 10_000 },
      );
    } catch {
      // proceed with what we have
    }

    const firstBatch = await extractOlxListingsFromPage(page);
    const mappedFirstBatch = firstBatch
      .map((j) => mapOlxRoJob(j))
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

      const batch = await extractOlxListingsFromPage(page);
      const mappedBatch = batch
        .map((j) => mapOlxRoJob(j))
        .filter((j): j is CreateJobInput => j !== null);
      jobs.push(...mappedBatch);
      params.onPage(pageNo, mappedBatch);
    }

    return { jobs: jobs.slice(0, params.maxJobsPerTerm) };
  } finally {
    await context.close();
  }
}

export async function runOlxRo(
  options: RunOlxRoOptions = {},
): Promise<OlxRoResult> {
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
          : "Unexpected error while running OLX România extractor.",
    };
  } finally {
    await browser?.close();
  }
}