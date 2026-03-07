jest.mock('@kit/shared/logger', () => ({
  getLogger: jest.fn(() =>
    Promise.resolve({
      info: jest.fn(),
      warn: jest.fn(),
      error: jest.fn(),
    }),
  ),
}));

import {
  isExcludedUrl,
  urlPriority,
  extractPageContent,
  normalizeUrl,
  isLikelyBlogUrl,
  isLikelyJsRendered,
  extractContactFromNoise,
  extractJsonLd,
} from './website-scraper';
import * as cheerio from 'cheerio';

// ── isExcludedUrl ────────────────────────────────────────────────────

describe('isExcludedUrl', () => {
  it.each([
    'https://clinic.com/blog/my-post',
    'https://clinic.com/blogs/dental-tips',
    'https://clinic.com/news/announcement',
    'https://clinic.com/article/teeth-whitening',
    'https://clinic.com/articles/latest',
    'https://clinic.com/careers/dentist',
    'https://clinic.com/jobs/receptionist',
    'https://clinic.com/shop/toothbrush',
    'https://clinic.com/store/products',
    'https://clinic.com/wp-admin/settings',
    'https://clinic.com/tag/oral-health',
    'https://clinic.com/category/general',
    'https://clinic.com/author/dr-smith',
    'https://clinic.com/events/open-house',
    'https://clinic.com/login',
    'https://clinic.com/signup',
  ])('should exclude %s', (url) => {
    expect(isExcludedUrl(url)).toBe(true);
  });

  it.each([
    // Date-based patterns
    'https://clinic.com/2024/01/my-blog-post',
    'https://clinic.com/2023/12/',
    // Pagination
    'https://clinic.com/page/2',
    'https://clinic.com/page/15',
    // Share/print
    'https://clinic.com/share',
    'https://clinic.com/print',
  ])('should exclude pattern-based URL %s', (url) => {
    expect(isExcludedUrl(url)).toBe(true);
  });

  it.each([
    'https://clinic.com/',
    'https://clinic.com/about',
    'https://clinic.com/about-us',
    'https://clinic.com/services',
    'https://clinic.com/services/teeth-cleaning',
    'https://clinic.com/contact',
    'https://clinic.com/our-team',
    'https://clinic.com/insurance',
    'https://clinic.com/new-patients',
    'https://clinic.com/faq',
    'https://clinic.com/emergency-dental',
  ])('should NOT exclude clinic page %s', (url) => {
    expect(isExcludedUrl(url)).toBe(false);
  });

  it('should handle invalid URLs gracefully', () => {
    expect(isExcludedUrl('not-a-url')).toBe(false);
  });

  it('should be case-insensitive for path segments', () => {
    expect(isExcludedUrl('https://clinic.com/Blog/my-post')).toBe(true);
    expect(isExcludedUrl('https://clinic.com/NEWS/update')).toBe(true);
  });
});

// ── urlPriority ──────────────────────────────────────────────────────

describe('urlPriority', () => {
  it('should give homepage highest priority (0)', () => {
    expect(urlPriority('https://clinic.com/')).toBe(0);
  });

  it('should give clinic-relevant pages priority 1', () => {
    expect(urlPriority('https://clinic.com/about')).toBe(1);
    expect(urlPriority('https://clinic.com/services')).toBe(1);
    expect(urlPriority('https://clinic.com/contact')).toBe(1);
    expect(urlPriority('https://clinic.com/our-team')).toBe(1);
    expect(urlPriority('https://clinic.com/insurance')).toBe(1);
    expect(urlPriority('https://clinic.com/faq')).toBe(1);
    expect(urlPriority('https://clinic.com/new-patients')).toBe(1);
    expect(urlPriority('https://clinic.com/emergency')).toBe(1);
  });

  it('should give lower priority to deeper/unrecognized paths', () => {
    const aboutPriority = urlPriority('https://clinic.com/about');
    const unknownPriority = urlPriority('https://clinic.com/random-page');
    const deepPriority = urlPriority('https://clinic.com/a/b/c/d');
    expect(unknownPriority).toBeGreaterThan(aboutPriority);
    expect(deepPriority).toBeGreaterThan(unknownPriority);
  });

  it('should sort correctly when used as comparator', () => {
    const urls = [
      'https://clinic.com/a/b/c',
      'https://clinic.com/services',
      'https://clinic.com/',
      'https://clinic.com/random',
      'https://clinic.com/contact-us',
    ];
    urls.sort((a, b) => urlPriority(a) - urlPriority(b));
    expect(urls[0]).toBe('https://clinic.com/');
    expect(urls[1]).toBe('https://clinic.com/services');
    expect(urls[2]).toBe('https://clinic.com/contact-us');
  });

  it('should handle invalid URLs', () => {
    expect(urlPriority('not-a-url')).toBe(100);
  });
});

// ── normalizeUrl ─────────────────────────────────────────────────────

describe('normalizeUrl', () => {
  it('should resolve relative paths', () => {
    expect(normalizeUrl('/about', 'https://clinic.com')).toBe(
      'https://clinic.com/about',
    );
  });

  it('should strip hash and query', () => {
    expect(normalizeUrl('/page?foo=1#bar', 'https://clinic.com')).toBe(
      'https://clinic.com/page',
    );
  });

  it('should return null for invalid hrefs', () => {
    expect(normalizeUrl('', '')).toBeNull();
  });

  it('should handle absolute URLs', () => {
    expect(normalizeUrl('https://other.com/path', 'https://clinic.com')).toBe(
      'https://other.com/path',
    );
  });
});

// ── isLikelyBlogUrl ─────────────────────────────────────────────────

describe('isLikelyBlogUrl', () => {
  it.each([
    'https://clinic.com/blog/dental-tips',
    'https://clinic.com/news/new-office',
    'https://clinic.com/article/whitening',
    'https://clinic.com/posts/my-post',
    'https://clinic.com/2024/01/my-post',
    'https://clinic.com/press/announcement',
    'https://clinic.com/media/video',
  ])('should detect blog URL %s', (url) => {
    expect(isLikelyBlogUrl(url)).toBe(true);
  });

  it.each([
    'https://clinic.com/',
    'https://clinic.com/about',
    'https://clinic.com/services',
    'https://clinic.com/services/cleanings',
    'https://clinic.com/contact',
    'https://clinic.com/our-team',
    'https://clinic.com/insurance',
  ])('should NOT flag clinic page %s as blog', (url) => {
    expect(isLikelyBlogUrl(url)).toBe(false);
  });

  it('should handle invalid URLs', () => {
    expect(isLikelyBlogUrl('not-a-url')).toBe(false);
  });
});

// ── isLikelyJsRendered ──────────────────────────────────────────────

describe('isLikelyJsRendered', () => {
  it('should detect a React SPA shell', () => {
    const html = `
      <html><head><title>App</title></head>
      <body><div id="root"></div><script src="/bundle.js"></script></body>
      </html>`;
    expect(isLikelyJsRendered(html)).toBe(true);
  });

  it('should detect a Next.js shell with minimal content', () => {
    const html = `
      <html><head></head>
      <body><div id="__next"></div></body>
      </html>`;
    expect(isLikelyJsRendered(html)).toBe(true);
  });

  it('should detect a page with almost no text content', () => {
    const html = `<html><body>Loading...</body></html>`;
    expect(isLikelyJsRendered(html)).toBe(true);
  });

  it('should NOT flag a well-populated server-rendered page', () => {
    const html = `
      <html><head><title>Clinic</title></head>
      <body>
        <h1>Welcome to Downtown Dental Clinic</h1>
        <p>We provide quality dental care in downtown Montreal for over 20 years.
           Our team of experienced dentists offers comprehensive dental services.</p>
        <p>Services include cleanings, whitening, implants, crowns, and more.</p>
        <p>Contact us today to schedule your appointment at our convenient location.</p>
      </body>
      </html>`;
    expect(isLikelyJsRendered(html)).toBe(false);
  });

  it('should NOT flag a Next.js page with sufficient server-rendered content', () => {
    const html = `
      <html><head></head>
      <body>
        <div id="__next">
          <h1>Our Dental Services</h1>
          <p>We offer comprehensive dental care for the whole family. Our services
             include preventive care, restorative treatments, and cosmetic dentistry.
             We accept most insurance plans and offer flexible payment options.</p>
        </div>
      </body>
      </html>`;
    expect(isLikelyJsRendered(html)).toBe(false);
  });
});

// ── extractContactFromNoise ─────────────────────────────────────────

describe('extractContactFromNoise', () => {
  const NOISE = 'nav, footer, header';

  it('should extract phone numbers from header/footer', () => {
    const $ = cheerio.load(`
      <html><body>
        <header><p>Call us: (514) 555-1234</p></header>
        <main><p>Main content here with enough characters to be meaningful.</p></main>
        <footer><p>Phone: 1-800-555-6789</p></footer>
      </body></html>
    `);
    const sections = extractContactFromNoise($, NOISE);
    expect(sections).toHaveLength(1);
    expect(sections[0]!.heading).toBe('Contact Information');
    expect(sections[0]!.content).toContain('(514) 555-1234');
    expect(sections[0]!.content).toContain('1-800-555-6789');
  });

  it('should extract email addresses from noise elements', () => {
    const $ = cheerio.load(`
      <html><body>
        <nav><a href="mailto:info@clinic.com">info@clinic.com</a></nav>
        <main><p>Some page content about dental services and patient care.</p></main>
      </body></html>
    `);
    const sections = extractContactFromNoise($, NOISE);
    expect(sections).toHaveLength(1);
    expect(sections[0]!.content).toContain('Email: info@clinic.com');
  });

  it('should deduplicate identical phone numbers', () => {
    const $ = cheerio.load(`
      <html><body>
        <header><p>(514) 555-1234</p></header>
        <footer><p>514-555-1234</p></footer>
      </body></html>
    `);
    const sections = extractContactFromNoise($, NOISE);
    expect(sections).toHaveLength(1);
    const phoneLines = sections[0]!.content
      .split('\n')
      .filter((l) => l.startsWith('Phone:'));
    expect(phoneLines).toHaveLength(1);
  });

  it('should filter out noreply email addresses', () => {
    const $ = cheerio.load(`
      <html><body>
        <footer>
          <p>noreply@clinic.com</p>
          <p>info@clinic.com</p>
        </footer>
      </body></html>
    `);
    const sections = extractContactFromNoise($, NOISE);
    expect(sections).toHaveLength(1);
    expect(sections[0]!.content).not.toContain('noreply');
    expect(sections[0]!.content).toContain('info@clinic.com');
  });

  it('should return empty array when no contact info in noise', () => {
    const $ = cheerio.load(`
      <html><body>
        <nav><a href="/">Home</a><a href="/about">About</a></nav>
        <main><p>Content</p></main>
      </body></html>
    `);
    const sections = extractContactFromNoise($, NOISE);
    expect(sections).toHaveLength(0);
  });
});

// ── extractJsonLd ───────────────────────────────────────────────────

describe('extractJsonLd', () => {
  it('should extract business info from LocalBusiness JSON-LD', () => {
    const $ = cheerio.load(`
      <html><head>
        <script type="application/ld+json">{
          "@context": "https://schema.org",
          "@type": "Dentist",
          "name": "Pearl Dental",
          "telephone": "+15145551234",
          "email": "info@pearldental.com",
          "address": {
            "@type": "PostalAddress",
            "streetAddress": "123 Main St",
            "addressLocality": "Montreal",
            "addressRegion": "QC",
            "postalCode": "H2X 1A1"
          },
          "openingHours": ["Mo-Fr 09:00-17:00", "Sa 10:00-14:00"]
        }</script>
      </head><body></body></html>
    `);
    const sections = extractJsonLd($);
    expect(sections).toHaveLength(1);
    expect(sections[0]!.heading).toBe('Pearl Dental');
    expect(sections[0]!.content).toContain('Business Name: Pearl Dental');
    expect(sections[0]!.content).toContain('Phone: +15145551234');
    expect(sections[0]!.content).toContain('Email: info@pearldental.com');
    expect(sections[0]!.content).toContain('123 Main St');
    expect(sections[0]!.content).toContain('Mo-Fr 09:00-17:00');
  });

  it('should extract from MedicalClinic schema', () => {
    const $ = cheerio.load(`
      <html><head>
        <script type="application/ld+json">{
          "@type": "MedicalClinic",
          "name": "Downtown Medical",
          "telephone": "(416) 555-9999"
        }</script>
      </head><body></body></html>
    `);
    const sections = extractJsonLd($);
    expect(sections).toHaveLength(1);
    expect(sections[0]!.content).toContain('Downtown Medical');
    expect(sections[0]!.content).toContain('(416) 555-9999');
  });

  it('should handle openingHoursSpecification', () => {
    const $ = cheerio.load(`
      <html><head>
        <script type="application/ld+json">{
          "@type": "Dentist",
          "name": "Test Clinic",
          "openingHoursSpecification": [
            { "dayOfWeek": ["Monday", "Tuesday"], "opens": "09:00", "closes": "17:00" },
            { "dayOfWeek": "Saturday", "opens": "10:00", "closes": "14:00" }
          ]
        }</script>
      </head><body></body></html>
    `);
    const sections = extractJsonLd($);
    expect(sections).toHaveLength(1);
    expect(sections[0]!.content).toContain('Monday, Tuesday: 09:00 - 17:00');
    expect(sections[0]!.content).toContain('Saturday: 10:00 - 14:00');
  });

  it('should skip non-business schemas like BlogPosting', () => {
    const $ = cheerio.load(`
      <html><head>
        <script type="application/ld+json">{
          "@type": "BlogPosting",
          "headline": "Dental Tips",
          "author": "Dr. Smith"
        }</script>
      </head><body></body></html>
    `);
    const sections = extractJsonLd($);
    expect(sections).toHaveLength(0);
  });

  it('should handle malformed JSON-LD gracefully', () => {
    const $ = cheerio.load(`
      <html><head>
        <script type="application/ld+json">{ invalid json }</script>
      </head><body></body></html>
    `);
    const sections = extractJsonLd($);
    expect(sections).toHaveLength(0);
  });

  it('should handle JSON-LD arrays with mixed types', () => {
    const $ = cheerio.load(`
      <html><head>
        <script type="application/ld+json">[
          { "@type": "BlogPosting", "headline": "Tips" },
          { "@type": "Dentist", "name": "Smile Clinic", "telephone": "555-1234" }
        ]</script>
      </head><body></body></html>
    `);
    const sections = extractJsonLd($);
    expect(sections).toHaveLength(1);
    expect(sections[0]!.content).toContain('Smile Clinic');
  });

  it('should handle string addresses', () => {
    const $ = cheerio.load(`
      <html><head>
        <script type="application/ld+json">{
          "@type": "LocalBusiness",
          "name": "City Dental",
          "address": "456 Queen St W, Toronto, ON"
        }</script>
      </head><body></body></html>
    `);
    const sections = extractJsonLd($);
    expect(sections).toHaveLength(1);
    expect(sections[0]!.content).toContain('456 Queen St W, Toronto, ON');
  });
});

// ── extractPageContent ───────────────────────────────────────────────

describe('extractPageContent', () => {
  it('should extract title and sections from basic HTML', () => {
    const html = `
      <html>
      <head><title>Downtown Dental</title></head>
      <body>
        <h1>Welcome</h1>
        <p>We provide quality dental care in downtown Montreal for over 20 years.</p>
        <h2>Our Services</h2>
        <p>We offer teeth cleaning, whitening, and implant services for all patients.</p>
      </body>
      </html>
    `;
    const result = extractPageContent(html, 'https://clinic.com/');
    expect(result.title).toBe('Downtown Dental');
    expect(result.sections.length).toBeGreaterThanOrEqual(1);
    expect(result.sections.some((s) => s.heading === 'Our Services')).toBe(
      true,
    );
  });

  it('should skip pages with og:type=article AND blog URL', () => {
    const html = `
      <html>
      <head>
        <meta property="og:type" content="article" />
        <title>Blog Post</title>
      </head>
      <body><p>This is a blog post about dental care and teeth whitening tips.</p></body>
      </html>
    `;
    const result = extractPageContent(html, 'https://clinic.com/blog/post');
    expect(result.sections).toHaveLength(0);
    expect(result.title).toBe('');
    expect(result.skipReason).toBe('og-type-with-blog-url');
  });

  it('should NOT skip pages with og:type=article but non-blog URL', () => {
    const html = `
      <html>
      <head>
        <meta property="og:type" content="article" />
        <title>Our Services</title>
      </head>
      <body>
        <h1>Dental Services</h1>
        <p>We offer comprehensive dental services including cleanings, fillings, and crowns for all ages.</p>
      </body>
      </html>
    `;
    const result = extractPageContent(html, 'https://clinic.com/services');
    expect(result.sections.length).toBeGreaterThan(0);
    expect(result.skipReason).toBeUndefined();
  });

  it('should skip pages with og:type=blog AND blog URL', () => {
    const html = `
      <html>
      <head>
        <meta property="og:type" content="blog" />
        <title>Blog</title>
      </head>
      <body><p>Blog listing page for the clinic news and information hub.</p></body>
      </html>
    `;
    const result = extractPageContent(html, 'https://clinic.com/blog');
    expect(result.sections).toHaveLength(0);
    expect(result.skipReason).toBe('og-type-with-blog-url');
  });

  it('should skip pages with BlogPosting schema markup', () => {
    const html = `
      <html>
      <head><title>Post</title></head>
      <body>
        <article itemtype="https://schema.org/BlogPosting">
          <p>Blog post content about dental hygiene tips for your family.</p>
        </article>
      </body>
      </html>
    `;
    const result = extractPageContent(html, 'https://clinic.com/blog/1');
    expect(result.sections).toHaveLength(0);
    expect(result.skipReason).toBe('schema-blog-posting');
  });

  it('should skip pages with NewsArticle schema markup', () => {
    const html = `
      <html>
      <head><title>News</title></head>
      <body>
        <div itemtype="http://schema.org/NewsArticle">
          <p>A news article about recent developments in dental technology worldwide.</p>
        </div>
      </body>
      </html>
    `;
    const result = extractPageContent(html, 'https://clinic.com/news/1');
    expect(result.sections).toHaveLength(0);
    expect(result.skipReason).toBe('schema-blog-posting');
  });

  it('should NOT skip pages with generic Article schema', () => {
    const html = `
      <html>
      <head><title>Services</title></head>
      <body>
        <article itemtype="https://schema.org/Article">
          <h1>Our Dental Services</h1>
          <p>We offer a wide range of dental services including cleanings, fillings, and crowns for patients.</p>
        </article>
      </body>
      </html>
    `;
    const result = extractPageContent(html, 'https://clinic.com/services');
    expect(result.sections.length).toBeGreaterThan(0);
    expect(result.skipReason).toBeUndefined();
  });

  it('should extract contact info from header/footer before stripping', () => {
    const html = `
      <html>
      <head><title>Clinic</title></head>
      <body>
        <header><p>Call us: (514) 555-1234 | info@clinic.com</p></header>
        <h1>Main Content</h1>
        <p>This is the actual clinic description with important information about services.</p>
        <footer><p>Copyright 2024 All rights reserved to downtown dental clinic.</p></footer>
      </body>
      </html>
    `;
    const result = extractPageContent(html, 'https://clinic.com/');
    const contactSection = result.sections.find(
      (s) => s.heading === 'Contact Information',
    );
    expect(contactSection).toBeDefined();
    expect(contactSection!.content).toContain('(514) 555-1234');
    expect(contactSection!.content).toContain('info@clinic.com');
  });

  it('should still remove nav/footer text from main content extraction', () => {
    const html = `
      <html>
      <head><title>Clinic</title></head>
      <body>
        <nav><p>Home | About | Contact links for navigation bar</p></nav>
        <h1>Main Content</h1>
        <p>This is the actual clinic description with important information about services.</p>
        <footer><p>Copyright 2024 All rights reserved to downtown dental clinic.</p></footer>
      </body>
      </html>
    `;
    const result = extractPageContent(html, 'https://clinic.com/');
    const mainSections = result.sections.filter(
      (s) => s.heading !== 'Contact Information',
    );
    const allText = mainSections.map((s) => s.content).join(' ');
    expect(allText).toContain('actual clinic description');
    expect(allText).not.toContain('Copyright 2024');
  });

  it('should extract JSON-LD business data', () => {
    const html = `
      <html>
      <head>
        <title>Clinic</title>
        <script type="application/ld+json">{
          "@type": "Dentist",
          "name": "Downtown Dental",
          "telephone": "+15145551234",
          "address": {
            "streetAddress": "100 University",
            "addressLocality": "Montreal",
            "addressRegion": "QC"
          }
        }</script>
      </head>
      <body>
        <h1>Welcome</h1>
        <p>Quality dental care for the entire family in downtown Montreal.</p>
      </body>
      </html>
    `;
    const result = extractPageContent(html, 'https://clinic.com/');
    const jsonLdSection = result.sections.find(
      (s) => s.heading === 'Downtown Dental',
    );
    expect(jsonLdSection).toBeDefined();
    expect(jsonLdSection!.content).toContain('+15145551234');
    expect(jsonLdSection!.content).toContain('100 University');
  });

  it('should set skipReason when page has no extractable content', () => {
    const html = `
      <html>
      <head><title>Empty</title></head>
      <body><p>Hi</p></body>
      </html>
    `;
    const result = extractPageContent(html, 'https://clinic.com/empty');
    expect(result.sections).toHaveLength(0);
    expect(result.skipReason).toBe('no-extractable-content');
  });

  it('should deduplicate identical text blocks', () => {
    const html = `
      <html>
      <head><title>Clinic</title></head>
      <body>
        <h1>Services</h1>
        <p>We offer teeth cleaning and whitening services at competitive prices.</p>
        <p>We offer teeth cleaning and whitening services at competitive prices.</p>
        <p>Also implants and other treatments for complete dental care patients.</p>
      </body>
      </html>
    `;
    const result = extractPageContent(html, 'https://clinic.com/');
    const contentBlocks = result.sections.flatMap((s) =>
      s.content.split('\n').filter(Boolean),
    );
    const uniqueBlocks = new Set(contentBlocks);
    expect(contentBlocks.length).toBe(uniqueBlocks.size);
  });

  it('should use URL as title if no title or h1 found', () => {
    const html = `
      <html>
      <head></head>
      <body>
        <p>Some content about the clinic services and patient information.</p>
      </body>
      </html>
    `;
    const result = extractPageContent(html, 'https://clinic.com/page');
    expect(result.url).toBe('https://clinic.com/page');
  });
});
