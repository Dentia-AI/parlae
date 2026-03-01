import * as cheerio from 'cheerio';
import { parseStringPromise } from 'xml2js';
import { getLogger } from '@kit/shared/logger';

const MAX_PAGES = 50;
const FETCH_DELAY_MS = 2000;
const FETCH_TIMEOUT_MS = 10_000;
const USER_AGENT =
  'Mozilla/5.0 (compatible; ParlaeBot/1.0; +https://parlae.com)';

// ── URL Intelligence ──────────────────────────────────────────────────

/**
 * Path segments that indicate non-clinic content (blog posts, news,
 * events, etc.).  Matched case-insensitively against each segment of
 * the URL pathname.
 */
const EXCLUDED_PATH_SEGMENTS = new Set([
  'blog', 'blogs', 'news', 'article', 'articles', 'post', 'posts',
  'press', 'press-release', 'press-releases', 'media',
  'events', 'event', 'webinar', 'webinars', 'podcast', 'podcasts',
  'tag', 'tags', 'category', 'categories', 'author', 'authors',
  'archive', 'archives', 'feed', 'rss',
  'careers', 'jobs', 'job', 'hiring',
  'shop', 'store', 'cart', 'checkout', 'product', 'products',
  'login', 'signup', 'register', 'account', 'dashboard', 'admin',
  'sitemap', 'wp-json', 'wp-admin', 'wp-content', 'wp-includes',
]);

/**
 * Full path patterns (regex) that should be excluded.
 * Catches dated blog URLs like /2024/01/my-post.
 */
const EXCLUDED_PATH_PATTERNS = [
  /\/\d{4}\/\d{2}(\/|$)/,         // /2024/01/...
  /\/page\/\d+/,                    // /page/2, /page/3 (pagination)
  /\/(share|print|embed)\b/i,      // share/print links
];

/**
 * Path segments that strongly suggest clinic-relevant content.
 * Used to prioritize these pages when we have more URLs than MAX_PAGES.
 */
const PRIORITY_PATH_SEGMENTS = new Set([
  'about', 'about-us', 'our-team', 'team', 'staff', 'doctors', 'dentists',
  'providers', 'meet-the-team', 'meet-our-team',
  'services', 'treatments', 'procedures', 'dental-services',
  'contact', 'contact-us', 'location', 'locations', 'directions',
  'hours', 'office-hours', 'schedule',
  'insurance', 'payment', 'payments', 'financing', 'financial',
  'new-patients', 'new-patient', 'patient-info', 'patient-information',
  'forms', 'patient-forms',
  'faq', 'faqs', 'frequently-asked-questions',
  'emergency', 'emergency-dental', 'urgent-care',
  'technology', 'office-tour', 'virtual-tour',
  'reviews', 'testimonials',
  'specials', 'offers', 'promotions',
  'policies', 'privacy', 'accessibility',
]);

export function isExcludedUrl(url: string): boolean {
  try {
    const { pathname } = new URL(url);
    const segments = pathname.toLowerCase().split('/').filter(Boolean);

    if (segments.some((s) => EXCLUDED_PATH_SEGMENTS.has(s))) return true;
    if (EXCLUDED_PATH_PATTERNS.some((re) => re.test(pathname))) return true;

    return false;
  } catch {
    return false;
  }
}

export function urlPriority(url: string): number {
  try {
    const { pathname } = new URL(url);

    // Homepage is highest priority
    if (pathname === '/' || pathname === '') return 0;

    const segments = pathname.toLowerCase().split('/').filter(Boolean);

    if (segments.some((s) => PRIORITY_PATH_SEGMENTS.has(s))) return 1;

    // Shorter paths are generally more important (top-level pages)
    return 2 + segments.length;
  } catch {
    return 100;
  }
}

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

export function normalizeUrl(href: string, baseUrl: string): string | null {
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
  const logger = await getLogger();

  let urls = await discoverViaSitemap(websiteUrl);

  if (urls.length === 0) {
    urls = await discoverViaLinks(websiteUrl);
  }

  if (urls.length === 0) {
    urls = [websiteUrl];
  }

  const unique = [...new Set(urls)];
  const beforeFilter = unique.length;

  const filtered = unique.filter((u) => !isExcludedUrl(u));
  const excluded = beforeFilter - filtered.length;

  // Sort by priority: homepage first, then clinic pages, then the rest
  // (shorter paths before deeper ones within the same priority tier).
  filtered.sort((a, b) => urlPriority(a) - urlPriority(b));

  if (excluded > 0) {
    logger.info(
      { before: beforeFilter, excluded, after: filtered.length },
      '[Scraper] Filtered out non-clinic URLs (blog, news, etc.)',
    );
  }

  return filtered.slice(0, MAX_PAGES);
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

export function extractPageContent(html: string, url: string): ScrapedPage {
  const $ = cheerio.load(html);

  // Check meta/structured-data BEFORE stripping tags (STRIP_SELECTORS removes <meta>).
  const ogType = $('meta[property="og:type"]').attr('content')?.toLowerCase();
  if (ogType === 'article' || ogType === 'blog') {
    return { url, title: '', sections: [] };
  }
  const schemaType = $('[itemtype*="BlogPosting"], [itemtype*="NewsArticle"], [itemtype*="Article"]');
  if (schemaType.length > 0) {
    return { url, title: '', sections: [] };
  }

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
