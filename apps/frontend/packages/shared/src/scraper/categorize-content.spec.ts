jest.mock('@kit/shared/logger', () => ({
  getLogger: jest.fn(() =>
    Promise.resolve({
      info: jest.fn(),
      warn: jest.fn(),
      error: jest.fn(),
    }),
  ),
}));

import type { ScrapedPage } from './website-scraper';
import {
  fallbackClassify,
  generateDocument,
  categorizeContent,
  KB_CATEGORIES,
  type SectionWithMeta,
} from './categorize-content';

// ── fallbackClassify ─────────────────────────────────────────────────

describe('fallbackClassify', () => {
  it('should initialize all category buckets', () => {
    const result = fallbackClassify([]);
    for (const cat of KB_CATEGORIES) {
      expect(result[cat.id]).toEqual([]);
    }
  });

  it('should classify FAQ sections', () => {
    const sections: SectionWithMeta[] = [
      {
        pageUrl: 'https://clinic.com/faq',
        heading: 'Frequently Asked Questions',
        content: 'Q: How do I book? A: Call us or use our online scheduler.',
      },
    ];
    const result = fallbackClassify(sections);
    expect(result['faqs']).toHaveLength(1);
    expect(result['faqs']![0]!.heading).toBe('Frequently Asked Questions');
  });

  it('should classify insurance sections', () => {
    const sections: SectionWithMeta[] = [
      {
        pageUrl: 'https://clinic.com/insurance',
        heading: 'Insurance Plans',
        content:
          'We accept most major insurance plans including Sun Life and Manulife.',
      },
      {
        pageUrl: 'https://clinic.com/billing',
        heading: 'Billing',
        content: 'Payment plans are available. We accept billing from major providers.',
      },
    ];
    const result = fallbackClassify(sections);
    expect(result['insurance']).toHaveLength(2);
  });

  it('should classify provider/doctor sections', () => {
    const sections: SectionWithMeta[] = [
      {
        pageUrl: 'https://clinic.com/team',
        heading: 'Our Team',
        content:
          'Dr. Sarah Johnson, DDS, has over 15 years of experience in cosmetic dentistry.',
      },
    ];
    const result = fallbackClassify(sections);
    expect(result['providers']).toHaveLength(1);
  });

  it('should classify services sections', () => {
    const sections: SectionWithMeta[] = [
      {
        pageUrl: 'https://clinic.com/services',
        heading: 'Dental Services',
        content:
          'We offer teeth whitening, dental implants, and Invisalign treatment.',
      },
    ];
    const result = fallbackClassify(sections);
    expect(result['services']).toHaveLength(1);
  });

  it('should classify policies sections', () => {
    const sections: SectionWithMeta[] = [
      {
        pageUrl: 'https://clinic.com/policies',
        heading: 'Cancellation Policy',
        content:
          '24-hour cancellation notice required. No-show fees may apply.',
      },
    ];
    const result = fallbackClassify(sections);
    expect(result['policies']).toHaveLength(1);
  });

  it('should default unrecognized content to clinic-info', () => {
    const sections: SectionWithMeta[] = [
      {
        pageUrl: 'https://clinic.com/',
        heading: 'Welcome',
        content:
          'Located in the heart of downtown, we have been serving our community since 1990.',
      },
    ];
    const result = fallbackClassify(sections);
    expect(result['clinic-info']).toHaveLength(1);
  });

  it('should only assign each section to one category (first match)', () => {
    const sections: SectionWithMeta[] = [
      {
        pageUrl: 'https://clinic.com/',
        heading: 'FAQ about Insurance',
        content: 'Frequently asked questions about insurance coverage and billing.',
      },
    ];
    const result = fallbackClassify(sections);
    const totalAssigned = Object.values(result).reduce(
      (sum, arr) => sum + arr.length,
      0,
    );
    expect(totalAssigned).toBe(1);
    expect(result['faqs']).toHaveLength(1);
  });
});

// ── generateDocument ─────────────────────────────────────────────────

describe('generateDocument', () => {
  it('should return null for empty sections', () => {
    expect(generateDocument('services', 'Services', [])).toBeNull();
  });

  it('should generate a markdown document with heading and content', () => {
    const sections: SectionWithMeta[] = [
      {
        pageUrl: 'https://clinic.com/services',
        heading: 'Teeth Cleaning',
        content:
          'Professional teeth cleaning removes plaque and tartar buildup.',
      },
      {
        pageUrl: 'https://clinic.com/services',
        heading: 'Whitening',
        content:
          'Our in-office whitening treatment can brighten your smile in one visit.',
      },
    ];
    const doc = generateDocument('services', 'Services & Procedures', sections);
    expect(doc).not.toBeNull();
    expect(doc!.categoryId).toBe('services');
    expect(doc!.categoryLabel).toBe('Services & Procedures');
    expect(doc!.content).toContain('# Services & Procedures');
    expect(doc!.content).toContain('## Teeth Cleaning');
    expect(doc!.content).toContain('## Whitening');
    expect(doc!.sourcePages).toEqual(['https://clinic.com/services']);
    expect(doc!.charCount).toBe(doc!.content.length);
  });

  it('should track multiple source pages', () => {
    const sections: SectionWithMeta[] = [
      {
        pageUrl: 'https://clinic.com/page1',
        heading: 'Info A',
        content: 'Content from page 1 with enough text to pass threshold.',
      },
      {
        pageUrl: 'https://clinic.com/page2',
        heading: 'Info B',
        content: 'Content from page 2 with enough text to pass threshold.',
      },
    ];
    const doc = generateDocument('clinic-info', 'Clinic Information', sections);
    expect(doc!.sourcePages).toHaveLength(2);
    expect(doc!.sourcePages).toContain('https://clinic.com/page1');
    expect(doc!.sourcePages).toContain('https://clinic.com/page2');
  });

  it('should deduplicate identical content blocks', () => {
    const sections: SectionWithMeta[] = [
      {
        pageUrl: 'https://clinic.com/page1',
        heading: 'Hours',
        content: 'Mon-Fri 9am to 5pm Saturday 10am to 2pm Sunday closed',
      },
      {
        pageUrl: 'https://clinic.com/page2',
        heading: 'Hours',
        content: 'Mon-Fri 9am to 5pm Saturday 10am to 2pm Sunday closed',
      },
    ];
    const doc = generateDocument('clinic-info', 'Clinic Information', sections);
    expect(doc).not.toBeNull();
    const occurrences = doc!.content.split('Mon-Fri 9am to 5pm').length - 1;
    expect(occurrences).toBe(1);
  });

  it('should return null when all content is deduplicated away', () => {
    const sections: SectionWithMeta[] = [
      {
        pageUrl: 'https://clinic.com/page1',
        heading: 'Hours',
        content: 'Monday to Friday 9am to 5pm for all patient appointments.',
      },
      {
        pageUrl: 'https://clinic.com/page2',
        heading: 'Hours',
        content: 'Monday to Friday 9am to 5pm for all patient appointments.',
      },
    ];
    const doc = generateDocument('clinic-info', 'Clinic Information', sections);
    expect(doc).not.toBeNull();

    const contentLines = doc!.content.split('\n').filter(Boolean);
    const hoursLines = contentLines.filter((l) =>
      l.includes('Monday to Friday'),
    );
    expect(hoursLines).toHaveLength(1);
  });
});

// ── categorizeContent (integration with fallback) ────────────────────

describe('categorizeContent', () => {
  const originalEnv = process.env;

  beforeEach(() => {
    process.env = { ...originalEnv };
    delete process.env.OPENAI_API_KEY;
  });

  afterAll(() => {
    process.env = originalEnv;
  });

  it('should return empty result for no pages', async () => {
    const result = await categorizeContent([]);
    expect(result.documents).toEqual([]);
    expect(result.totalSections).toBe(0);
    expect(result.categorizedSections).toBe(0);
  });

  it('should categorize pages using keyword fallback when no API key', async () => {
    const pages: ScrapedPage[] = [
      {
        url: 'https://clinic.com/services',
        title: 'Services',
        sections: [
          {
            heading: 'Teeth Whitening',
            content:
              'Professional whitening treatment to brighten your smile in just one visit at our clinic.',
          },
          {
            heading: 'Dental Implants',
            content:
              'We offer permanent dental implant solutions for single or multiple missing teeth.',
          },
        ],
      },
      {
        url: 'https://clinic.com/faq',
        title: 'FAQ',
        sections: [
          {
            heading: 'Frequently Asked Questions',
            content:
              'Q: What is the cost of a cleaning? A: We bill directly to most insurance plans.',
          },
        ],
      },
    ];

    const result = await categorizeContent(pages);
    expect(result.totalSections).toBe(3);
    expect(result.categorizedSections).toBe(3);
    expect(result.documents.length).toBeGreaterThan(0);

    const serviceDocs = result.documents.filter(
      (d) => d.categoryId === 'services',
    );
    expect(serviceDocs.length).toBe(1);

    const faqDocs = result.documents.filter((d) => d.categoryId === 'faqs');
    expect(faqDocs.length).toBe(1);
  });

  it('should skip copyright/boilerplate sections', async () => {
    const pages: ScrapedPage[] = [
      {
        url: 'https://clinic.com/',
        title: 'Home',
        sections: [
          {
            heading: 'Welcome',
            content:
              'Welcome to our downtown dental clinic with state of the art facilities and services.',
          },
          {
            heading: 'Footer',
            content: '© 2024 Downtown Dental. All rights reserved.',
          },
        ],
      },
    ];

    const result = await categorizeContent(pages);
    expect(result.totalSections).toBe(1);
  });

  it('should deduplicate identical sections across pages', async () => {
    const sharedSection = {
      heading: 'Call Us',
      content:
        'Contact us at (514) 555-1234 for appointments and general inquiries about our services.',
    };
    const pages: ScrapedPage[] = [
      {
        url: 'https://clinic.com/page1',
        title: 'Page 1',
        sections: [sharedSection],
      },
      {
        url: 'https://clinic.com/page2',
        title: 'Page 2',
        sections: [sharedSection],
      },
    ];

    const result = await categorizeContent(pages);
    expect(result.totalSections).toBe(1);
  });
});
