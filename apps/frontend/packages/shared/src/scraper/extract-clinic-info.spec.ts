jest.mock('@kit/shared/logger', () => ({
  getLogger: jest.fn(() =>
    Promise.resolve({
      info: jest.fn(),
      warn: jest.fn(),
      error: jest.fn(),
    }),
  ),
}));

const mockFetch = jest.fn();
(global as any).fetch = mockFetch;

import type { ScrapedPage } from './website-scraper';
import { extractClinicInfo } from './extract-clinic-info';

const originalEnv = process.env;

beforeEach(() => {
  jest.clearAllMocks();
  process.env = { ...originalEnv };
});

afterAll(() => {
  process.env = originalEnv;
});

// ── Regex fallback (no OPENAI_API_KEY) ──────────────────────────────

describe('extractClinicInfo — regex fallback', () => {
  beforeEach(() => {
    delete process.env.OPENAI_API_KEY;
  });

  it('should extract phone number from content', async () => {
    const pages: ScrapedPage[] = [
      {
        url: 'https://downtowndental.com/',
        title: 'Home',
        sections: [
          {
            heading: 'Contact',
            content: 'Call us at (514) 555-1234 to book your appointment today.',
          },
        ],
      },
    ];

    const result = await extractClinicInfo(pages, 'https://downtowndental.com/');
    expect(result.contactPhone).toBe('(514) 555-1234');
  });

  it('should extract email from content', async () => {
    const pages: ScrapedPage[] = [
      {
        url: 'https://downtowndental.com/',
        title: 'Home',
        sections: [
          {
            heading: 'Contact',
            content: 'Email us at info@downtowndental.com for inquiries.',
          },
        ],
      },
    ];

    const result = await extractClinicInfo(pages, 'https://downtowndental.com/');
    expect(result.contactEmail).toBe('info@downtowndental.com');
  });

  it('should skip noreply emails', async () => {
    const pages: ScrapedPage[] = [
      {
        url: 'https://downtowndental.com/',
        title: 'Home',
        sections: [
          {
            heading: 'Contact',
            content:
              'Sent from noreply@clinic.com. For real inquiries: front@downtowndental.com.',
          },
        ],
      },
    ];

    const result = await extractClinicInfo(pages, 'https://downtowndental.com/');
    expect(result.contactEmail).toBe('front@downtowndental.com');
  });

  it('should derive business name from hostname', async () => {
    const pages: ScrapedPage[] = [
      {
        url: 'https://downtown-dental.com/',
        title: 'Home',
        sections: [],
      },
    ];

    const result = await extractClinicInfo(
      pages,
      'https://www.downtown-dental.com/',
    );
    expect(result.businessName).toBe('Downtown Dental');
    expect(result.website).toBe('https://www.downtown-dental.com/');
  });

  it('should return empty object when no info found', async () => {
    const pages: ScrapedPage[] = [];
    const result = await extractClinicInfo(pages, 'https://example.com/');
    expect(result.website).toBe('https://example.com/');
    expect(result.contactPhone).toBeUndefined();
    expect(result.contactEmail).toBeUndefined();
  });
});

// ── LLM extraction (with mocked OpenAI) ─────────────────────────────

describe('extractClinicInfo — LLM', () => {
  beforeEach(() => {
    process.env.OPENAI_API_KEY = 'test-key';
  });

  it('should parse structured response from OpenAI', async () => {
    const llmResponse = {
      businessName: 'Downtown Montreal Dentistry',
      address: '1234 Rue Sainte-Catherine, Montreal, QC H3G 1P1',
      contactPhone: '(514) 555-9999',
      contactEmail: 'info@downtownmontrealdentistry.com',
      timezone: 'America/Toronto',
    };

    mockFetch.mockResolvedValueOnce({
      ok: true,
      json: () =>
        Promise.resolve({
          choices: [
            { message: { content: JSON.stringify(llmResponse) } },
          ],
        }),
    });

    const pages: ScrapedPage[] = [
      {
        url: 'https://downtownmontrealdentistry.com/',
        title: 'DMD',
        sections: [
          {
            heading: 'Welcome',
            content:
              'Downtown Montreal Dentistry is located at 1234 Rue Sainte-Catherine.',
          },
        ],
      },
    ];

    const result = await extractClinicInfo(
      pages,
      'https://downtownmontrealdentistry.com/',
    );

    expect(result.businessName).toBe('Downtown Montreal Dentistry');
    expect(result.address).toBe(
      '1234 Rue Sainte-Catherine, Montreal, QC H3G 1P1',
    );
    expect(result.contactPhone).toBe('(514) 555-9999');
    expect(result.contactEmail).toBe('info@downtownmontrealdentistry.com');
    expect(result.timezone).toBe('America/Toronto');
  });

  it('should omit fields not present in LLM response', async () => {
    mockFetch.mockResolvedValueOnce({
      ok: true,
      json: () =>
        Promise.resolve({
          choices: [
            {
              message: {
                content: JSON.stringify({
                  businessName: 'Smile Clinic',
                }),
              },
            },
          ],
        }),
    });

    const pages: ScrapedPage[] = [
      {
        url: 'https://smileclinic.com/',
        title: 'Smile',
        sections: [{ heading: 'Home', content: 'Welcome to Smile Clinic.' }],
      },
    ];

    const result = await extractClinicInfo(pages, 'https://smileclinic.com/');
    expect(result.businessName).toBe('Smile Clinic');
    expect(result.address).toBeUndefined();
    expect(result.contactPhone).toBeUndefined();
    expect(result.timezone).toBeUndefined();
  });

  it('should fall back to regex when OpenAI returns non-OK', async () => {
    mockFetch.mockResolvedValueOnce({
      ok: false,
      status: 429,
      text: () => Promise.resolve('Rate limited'),
    });

    const pages: ScrapedPage[] = [
      {
        url: 'https://clinic.com/',
        title: 'Home',
        sections: [
          {
            heading: 'Contact',
            content: 'Call (416) 555-0000 for appointments.',
          },
        ],
      },
    ];

    const result = await extractClinicInfo(pages, 'https://clinic.com/');
    expect(result.contactPhone).toBe('(416) 555-0000');
  });

  it('should fall back to regex when fetch throws', async () => {
    mockFetch.mockRejectedValueOnce(new Error('Network error'));

    const pages: ScrapedPage[] = [
      {
        url: 'https://clinic.com/',
        title: 'Home',
        sections: [
          {
            heading: 'Contact',
            content: 'Email: hello@clinic.com for booking.',
          },
        ],
      },
    ];

    const result = await extractClinicInfo(pages, 'https://clinic.com/');
    expect(result.contactEmail).toBe('hello@clinic.com');
  });

  it('should fall back to regex when OpenAI returns empty choices', async () => {
    mockFetch.mockResolvedValueOnce({
      ok: true,
      json: () => Promise.resolve({ choices: [{ message: { content: null } }] }),
    });

    const pages: ScrapedPage[] = [
      {
        url: 'https://clinic.com/',
        title: 'Home',
        sections: [
          {
            heading: 'Contact',
            content: 'Reach us at 514-999-8888 anytime.',
          },
        ],
      },
    ];

    const result = await extractClinicInfo(pages, 'https://clinic.com/');
    expect(result.contactPhone).toBe('514-999-8888');
  });

  it('should only sample first 10 pages', async () => {
    const llmResponse = { businessName: 'Big Clinic' };
    mockFetch.mockResolvedValueOnce({
      ok: true,
      json: () =>
        Promise.resolve({
          choices: [
            { message: { content: JSON.stringify(llmResponse) } },
          ],
        }),
    });

    const pages: ScrapedPage[] = Array.from({ length: 20 }, (_, i) => ({
      url: `https://clinic.com/page${i}`,
      title: `Page ${i}`,
      sections: [{ heading: `H${i}`, content: `Content for page ${i}` }],
    }));

    await extractClinicInfo(pages, 'https://clinic.com/');

    const call = mockFetch.mock.calls[0]!;
    const body = JSON.parse(call[1].body);
    const prompt = body.messages[0].content as string;
    expect(prompt).not.toContain('page15');
    expect(prompt).toContain('page0');
    expect(prompt).toContain('page9');
  });
});
