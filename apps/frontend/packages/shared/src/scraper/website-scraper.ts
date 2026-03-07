import * as cheerio from 'cheerio';
import { parseStringPromise } from 'xml2js';
import { getLogger } from '@kit/shared/logger';

const MAX_PAGES = 50;
const FETCH_DELAY_MS = 2000;
const FETCH_TIMEOUT_MS = 10_000;
const RENDER_FETCH_TIMEOUT_MS = 30_000;
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
  skipReason?: string;
}

export interface ScrapeResult {
  pages: ScrapedPage[];
  totalDiscovered: number;
  scrapedCount: number;
  capped: boolean;
  skippedPages: { url: string; reason: string }[];
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

    if (!res.ok) {
      logger.warn(
        { url, status: res.status },
        '[Scraper] Fetch returned non-OK status',
      );
      return null;
    }

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

// ── Blog URL Detection ──────────────────────────────────────────────────

const BLOG_URL_SEGMENTS = new Set([
  'blog', 'blogs', 'news', 'article', 'articles', 'post', 'posts',
  'press', 'press-release', 'press-releases', 'media',
]);

export function isLikelyBlogUrl(url: string): boolean {
  try {
    const { pathname } = new URL(url);
    const segments = pathname.toLowerCase().split('/').filter(Boolean);
    if (segments.some((s) => BLOG_URL_SEGMENTS.has(s))) return true;
    if (/\/\d{4}\/\d{2}(\/|$)/.test(pathname)) return true;
    return false;
  } catch {
    return false;
  }
}

// ── JS-Rendered Detection ───────────────────────────────────────────────

export function isLikelyJsRendered(html: string): boolean {
  const $ = cheerio.load(html);

  const frameworkRoots = [
    '#__next', '#root', '#app', 'app-root', '[data-reactroot]',
    '[ng-app]', '[data-n-head]',
  ];
  const hasFrameworkRoot = frameworkRoots.some((sel) => $(sel).length > 0);

  $('script, style, noscript, link, meta, svg').remove();
  const bodyText = $('body').text().replace(/\s+/g, ' ').trim();

  if (hasFrameworkRoot && bodyText.length < 200) return true;
  if (bodyText.length < 50) return true;

  return false;
}

// ── Contact Extraction from Noise Elements ──────────────────────────────

const CONTACT_PHONE_RE = /(?:\+?1[-.\s]?)?\(?\d{3}\)?[-.\s]?\d{3}[-.\s]?\d{4}/g;
const CONTACT_EMAIL_RE = /[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}/g;

export function extractContactFromNoise(
  $: ReturnType<typeof cheerio.load>,
  noiseSelector: string,
): PageSection[] {
  const contactLines: string[] = [];
  const seen = new Set<string>();

  $(noiseSelector).each((_, el) => {
    const text = $(el).text().replace(/\s+/g, ' ').trim();

    const phones = text.match(CONTACT_PHONE_RE);
    if (phones) {
      for (const p of phones) {
        const normalized = p.replace(/\D/g, '');
        if (!seen.has(normalized) && normalized.length >= 10) {
          seen.add(normalized);
          contactLines.push(`Phone: ${p.trim()}`);
        }
      }
    }

    const emails = text.match(CONTACT_EMAIL_RE);
    if (emails) {
      for (const e of emails) {
        const lower = e.toLowerCase();
        if (
          !seen.has(lower) &&
          !lower.includes('noreply') &&
          !lower.includes('no-reply')
        ) {
          seen.add(lower);
          contactLines.push(`Email: ${e}`);
        }
      }
    }
  });

  if (contactLines.length > 0) {
    return [{ heading: 'Contact Information', content: contactLines.join('\n') }];
  }
  return [];
}

// ── JSON-LD Extraction ──────────────────────────────────────────────────

function isBusinessSchema(item: any): boolean {
  if (!item || !item['@type']) return false;
  const type = typeof item['@type'] === 'string' ? item['@type'] : '';
  const businessTypes = [
    'LocalBusiness', 'Dentist', 'MedicalBusiness', 'HealthAndBeautyBusiness',
    'MedicalClinic', 'Physician', 'DentalClinic', 'ProfessionalService',
    'Organization',
  ];
  return businessTypes.some((t) => type.includes(t));
}

function formatSchemaAddress(addr: any): string {
  if (!addr) return '';
  if (typeof addr === 'string') return addr;
  const parts = [
    addr.streetAddress,
    addr.addressLocality,
    addr.addressRegion,
    addr.postalCode,
    addr.addressCountry,
  ].filter(Boolean);
  return parts.join(', ');
}

export function extractJsonLd(
  $: ReturnType<typeof cheerio.load>,
): PageSection[] {
  const sections: PageSection[] = [];

  $('script[type="application/ld+json"]').each((_, el) => {
    try {
      const raw = $(el).text().trim();
      if (!raw) return;

      const data = JSON.parse(raw);
      const items = Array.isArray(data) ? data : [data];

      for (const item of items) {
        if (!isBusinessSchema(item)) continue;

        const lines: string[] = [];
        if (item.name) lines.push(`Business Name: ${item.name}`);
        if (item.telephone) lines.push(`Phone: ${item.telephone}`);
        if (item.email) lines.push(`Email: ${item.email}`);

        const addr = formatSchemaAddress(item.address);
        if (addr) lines.push(`Address: ${addr}`);

        if (item.openingHours) {
          const hours = Array.isArray(item.openingHours)
            ? item.openingHours.join(', ')
            : item.openingHours;
          lines.push(`Hours: ${hours}`);
        }

        if (item.openingHoursSpecification) {
          const specs = Array.isArray(item.openingHoursSpecification)
            ? item.openingHoursSpecification
            : [item.openingHoursSpecification];
          for (const spec of specs) {
            const days = Array.isArray(spec.dayOfWeek)
              ? spec.dayOfWeek.join(', ')
              : spec.dayOfWeek;
            if (days && spec.opens && spec.closes) {
              lines.push(`${days}: ${spec.opens} - ${spec.closes}`);
            }
          }
        }

        if (item.description) {
          lines.push('');
          lines.push(item.description);
        }

        if (lines.length > 0) {
          sections.push({
            heading: item.name || 'Business Information',
            content: lines.join('\n'),
          });
        }
      }
    } catch {
      // Invalid JSON-LD — skip silently
    }
  });

  return sections;
}

// ── Render-Service Fallback ─────────────────────────────────────────────

async function safeFetchRendered(url: string): Promise<string | null> {
  const renderUrl = process.env.SCRAPER_RENDER_URL;
  if (!renderUrl) return null;

  const logger = await getLogger();
  try {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), RENDER_FETCH_TIMEOUT_MS);

    const res = await fetch(
      `${renderUrl}?url=${encodeURIComponent(url)}`,
      { headers: { 'User-Agent': USER_AGENT }, signal: controller.signal },
    );
    clearTimeout(timer);

    if (!res.ok) {
      logger.warn({ url, status: res.status }, '[Scraper] Render service error');
      return null;
    }

    return await res.text();
  } catch (err) {
    logger.warn(
      { url, error: err instanceof Error ? err.message : err },
      '[Scraper] Render service fetch failed',
    );
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

  // ── 1. Extract JSON-LD structured data (available even on thin pages) ──
  const jsonLdSections = extractJsonLd($);

  // ── 2. Blog detection: og:type + URL heuristic ──
  // Only skip when og:type says article/blog AND the URL also looks blog-like.
  // Many WordPress themes set og:type=article on every page, so og:type alone
  // is insufficient.
  const ogType = $('meta[property="og:type"]').attr('content')?.toLowerCase();
  const hasArticleOgType = ogType === 'article' || ogType === 'blog';

  if (hasArticleOgType && isLikelyBlogUrl(url)) {
    return { url, title: '', sections: [], skipReason: 'og-type-with-blog-url' };
  }

  // BlogPosting / NewsArticle schema are specific enough to always skip.
  // Generic "Article" schema is NOT checked — too many CMS themes use it
  // on service pages.
  const blogSchema = $(
    '[itemtype*="BlogPosting"], [itemtype*="NewsArticle"]',
  );
  if (blogSchema.length > 0) {
    return { url, title: '', sections: [], skipReason: 'schema-blog-posting' };
  }

  // ── 3. Extract contact info from noise elements BEFORE removing them ──
  const contactSections = extractContactFromNoise($, NOISE_SELECTORS);

  // ── 4. Strip non-content and noise ──
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

  // ── 5. Merge all content sources ──
  const allSections = [...sections, ...contactSections, ...jsonLdSections];

  if (allSections.length === 0) {
    return { url, title, sections: [], skipReason: 'no-extractable-content' };
  }

  return { url, title, sections: allSections };
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
  const skippedPages: { url: string; reason: string }[] = [];

  for (let i = 0; i < allUrls.length; i++) {
    const url = allUrls[i]!;
    onProgress?.(i + 1, allUrls.length);

    let html = await safeFetch(url);
    if (!html) {
      logger.warn({ url, index: i }, '[Scraper] Skipping page (fetch failed)');
      skippedPages.push({ url, reason: 'fetch-failed' });
      continue;
    }

    // Detect JS-rendered pages and retry with render service if available
    if (isLikelyJsRendered(html)) {
      logger.info({ url }, '[Scraper] Page appears JS-rendered, attempting render service');
      const rendered = await safeFetchRendered(url);
      if (rendered) {
        html = rendered;
        logger.info({ url }, '[Scraper] Got rendered HTML from render service');
      } else {
        logger.warn(
          { url, renderConfigured: !!process.env.SCRAPER_RENDER_URL },
          '[Scraper] JS-rendered page — no rendered HTML available',
        );
      }
    }

    const page = extractPageContent(html, url);

    if (page.sections.length > 0) {
      pages.push(page);
    } else {
      const reason = page.skipReason || 'empty-after-extraction';
      logger.warn(
        { url, reason, index: i },
        '[Scraper] Page produced no content',
      );
      skippedPages.push({ url, reason });
    }

    if (i < allUrls.length - 1) {
      await sleep(FETCH_DELAY_MS);
    }
  }

  if (skippedPages.length > 0) {
    logger.info(
      {
        skippedCount: skippedPages.length,
        reasons: skippedPages.reduce<Record<string, number>>((acc, s) => {
          acc[s.reason] = (acc[s.reason] || 0) + 1;
          return acc;
        }, {}),
      },
      '[Scraper] Pages skipped summary',
    );
  }

  logger.info(
    { scrapedCount: pages.length, totalDiscovered, skipped: skippedPages.length },
    '[Scraper] Scraping complete',
  );

  return {
    pages,
    totalDiscovered,
    scrapedCount: pages.length,
    capped,
    skippedPages,
  };
}
