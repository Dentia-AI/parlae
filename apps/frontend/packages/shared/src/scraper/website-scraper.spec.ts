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
} from './website-scraper';

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

  it('should skip pages with og:type=article', () => {
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
  });

  it('should skip pages with og:type=blog', () => {
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
  });

  it('should remove nav, footer, header noise selectors', () => {
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
    const allText = result.sections.map((s) => s.content).join(' ');
    expect(allText).toContain('actual clinic description');
    expect(allText).not.toContain('Copyright 2024');
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
