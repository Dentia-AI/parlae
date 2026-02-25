import * as cheerio from 'cheerio';
import { parseStringPromise } from 'xml2js';
import { getLogger } from '@kit/shared/logger';

const MAX_PAGES = 50;
const FETCH_DELAY_MS = 2000;
const FETCH_TIMEOUT_MS = 10_000;
const USER_AGENT =
  'Mozilla/5.0 (compatible; ParlaeBot/1.0; +https://parlae.com)';

// ── Types ──────────────────────────────────────────────────────────────

export interface PageSection {
  heading: string;
  content: string;
}

export interface ScrapedPage {
  url: string;
  title: string;
  sections: PageSection[];
}

export interface ScrapeResult {
  pages: ScrapedPage[];
  totalDiscovered: number;
  scrapedCount: number;
  capped: boolean;
}

// ── Helpers ────────────────────────────────────────────────────────────

function sleep(ms: number) {
  return new Promise((r) => setTimeout(r, ms));
}

async function safeFetch(url: string): Promise<string | null> {
  const logger = await getLogger();
  try {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), FETCH_TIMEOUT_MS);

    const res = await fetch(url, {
      headers: {
        'User-Agent': USER_AGENT,
        'Accept-Charset': 'utf-8',
      },
      signal: controller.signal,
      redirect: 'follow',
    });
    clearTimeout(timer);

    if (!res.ok) return null;

    // Many sites don't declare charset — read as bytes and decode as UTF-8
    const buffer = await res.arrayBuffer();
    const decoder = new TextDecoder('utf-8');
    return decoder.decode(buffer);
  } catch (err) {
    logger.warn(
      { url, error: err instanceof Error ? err.message : err },
      '[Scraper] Fetch failed',
    );
    return null;
  }
}

function normalizeUrl(href: string, baseUrl: string): string | null {
  try {
    const resolved = new URL(href, baseUrl);
    resolved.hash = '';
    resolved.search = '';
    return resolved.href;
  } catch {
    return null;
  }
}

// ── Page Discovery ─────────────────────────────────────────────────────

async function discoverViaSitemap(baseUrl: string): Promise<string[]> {
  const logger = await getLogger();
  const origin = new URL(baseUrl).origin;
  const sitemapUrl = `${origin}/sitemap.xml`;

  const xml = await safeFetch(sitemapUrl);
  if (!xml) return [];

  try {
    const parsed = await parseStringPromise(xml, { explicitArray: false });
    const urlSet = parsed?.urlset?.url;
    if (!urlSet) return [];

    const urls: string[] = [];
    const entries = Array.isArray(urlSet) ? urlSet : [urlSet];
    for (const entry of entries) {
      const loc = entry?.loc;
      if (typeof loc === 'string' && loc.startsWith(origin)) {
        urls.push(loc);
      }
    }

    logger.info(
      { count: urls.length },
      '[Scraper] Discovered pages via sitemap.xml',
    );
    return urls;
  } catch (err) {
    logger.warn(
      { error: err instanceof Error ? err.message : err },
      '[Scraper] Failed to parse sitemap.xml',
    );
    return [];
  }
}

async function discoverViaLinks(baseUrl: string): Promise<string[]> {
  const logger = await getLogger();
  const origin = new URL(baseUrl).origin;

  const html = await safeFetch(baseUrl);
  if (!html) return [baseUrl];

  const $ = cheerio.load(html);
  const seen = new Set<string>([baseUrl]);

  $('a[href]').each((_, el) => {
    const href = $(el).attr('href');
    if (!href) return;

    const resolved = normalizeUrl(href, baseUrl);
    if (!resolved) return;

    try {
      const u = new URL(resolved);
      if (u.origin !== origin) return;

      const ext = u.pathname.split('.').pop()?.toLowerCase();
      if (ext && ['pdf', 'jpg', 'png', 'gif', 'svg', 'css', 'js'].includes(ext)) return;

      seen.add(resolved);
    } catch {
      /* ignore invalid urls */
    }
  });

  const urls = Array.from(seen);
  logger.info(
    { count: urls.length },
    '[Scraper] Discovered pages via link crawling',
  );
  return urls;
}

export async function discoverPages(websiteUrl: string): Promise<string[]> {
  let urls = await discoverViaSitemap(websiteUrl);

  if (urls.length === 0) {
    urls = await discoverViaLinks(websiteUrl);
  }

  if (urls.length === 0) {
    urls = [websiteUrl];
  }

  return [...new Set(urls)].slice(0, MAX_PAGES);
}

// ── Content Extraction ─────────────────────────────────────────────────

const STRIP_SELECTORS = [
  'script',
  'style',
  'noscript',
  'svg',
  'iframe',
  'link',
  'meta',
].join(', ');

const NOISE_SELECTORS = [
  'nav',
  'footer',
  'header',
  '[role="navigation"]',
  '[role="banner"]',
  '.cookie-banner',
  '.cookie-consent',
  '#cookie-consent',
].join(', ');

function extractPageContent(html: string, url: string): ScrapedPage {
  const $ = cheerio.load(html);

  $(STRIP_SELECTORS).remove();
  $(NOISE_SELECTORS).remove();

  const title =
    $('title').text().trim() ||
    $('h1').first().text().trim() ||
    url;

  const sections: PageSection[] = [];
  let currentHeading = title;
  let currentContent: string[] = [];
  const seenLines = new Set<string>();

  function flushSection() {
    const text = currentContent.join('\n').trim();
    if (text.length > 20) {
      sections.push({ heading: currentHeading, content: text });
    }
    currentContent = [];
  }

  const body = $('body').length ? $('body') : $.root();

  body.find('h1, h2, h3, h4, h5, h6, p, li, td, th, dt, dd, blockquote, details, [aria-label]').each((_, el) => {
    const tag = (el as cheerio.Element).tagName?.toLowerCase();
    const text = $(el).text().replace(/\s+/g, ' ').trim();

    if (!text || text.length < 3) return;

    // Skip duplicate lines within the same page (responsive layout dupes)
    const fingerprint = text.toLowerCase().replace(/\s+/g, '');
    if (seenLines.has(fingerprint)) return;
    seenLines.add(fingerprint);

    if (tag && /^h[1-6]$/.test(tag)) {
      flushSection();
      currentHeading = text;
    } else {
      currentContent.push(text);
    }
  });

  flushSection();

  $('[data-content], [data-text], [data-description]').each((_, el) => {
    for (const attr of ['data-content', 'data-text', 'data-description']) {
      const val = $(el).attr(attr);
      if (val && val.length > 20) {
        const fp = val.toLowerCase().replace(/\s+/g, '');
        if (!seenLines.has(fp)) {
          seenLines.add(fp);
          sections.push({ heading: 'Additional Info', content: val.trim() });
        }
      }
    }
  });

  return { url, title, sections };
}

// ── Main Scraper ───────────────────────────────────────────────────────

export async function scrapeWebsite(
  websiteUrl: string,
  onProgress?: (current: number, total: number) => void,
): Promise<ScrapeResult> {
  const logger = await getLogger();

  logger.info({ websiteUrl }, '[Scraper] Starting website scrape');

  const allUrls = await discoverPages(websiteUrl);
  const totalDiscovered = allUrls.length;
  const capped = totalDiscovered >= MAX_PAGES;

  logger.info(
    { totalDiscovered, capped },
    '[Scraper] Page discovery complete',
  );

  const pages: ScrapedPage[] = [];

  for (let i = 0; i < allUrls.length; i++) {
    const url = allUrls[i]!;
    onProgress?.(i + 1, allUrls.length);

    const html = await safeFetch(url);
    if (!html) {
      logger.warn({ url }, '[Scraper] Skipping page (fetch failed)');
      continue;
    }

    const page = extractPageContent(html, url);
    if (page.sections.length > 0) {
      pages.push(page);
    }

    if (i < allUrls.length - 1) {
      await sleep(FETCH_DELAY_MS);
    }
  }

  logger.info(
    { scrapedCount: pages.length, totalDiscovered },
    '[Scraper] Scraping complete',
  );

  return {
    pages,
    totalDiscovered,
    scrapedCount: pages.length,
    capped,
  };
}
