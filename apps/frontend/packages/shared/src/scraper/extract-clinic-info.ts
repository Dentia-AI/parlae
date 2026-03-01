import { getLogger } from '@kit/shared/logger';

import type { ScrapedPage } from './website-scraper';

export interface ExtractedClinicInfo {
  businessName?: string;
  address?: string;
  contactEmail?: string;
  contactPhone?: string;
  website?: string;
  timezone?: string;
}

/**
 * Extracts structured clinic branding info (name, address, phone, email)
 * from scraped pages using a focused LLM call.  Falls back to regex
 * extraction if OpenAI is unavailable.
 *
 * Only the first ~10 pages are sampled (homepage, about, contact pages
 * are the most useful).  The function is intentionally lightweight — one
 * small LLM call with the combined excerpts.
 */
export async function extractClinicInfo(
  pages: ScrapedPage[],
  websiteUrl: string,
): Promise<ExtractedClinicInfo> {
  const logger = await getLogger();

  const sampled = pages.slice(0, 10);

  const combinedText = sampled
    .map((p) => {
      const body = p.sections.map((s) => s.content).join('\n');
      return `--- Page: ${p.url} ---\n${body.slice(0, 1500)}`;
    })
    .join('\n\n')
    .slice(0, 12_000);

  const apiKey = process.env.OPENAI_API_KEY;

  if (!apiKey) {
    logger.warn('[ClinicExtractor] OPENAI_API_KEY not set, using regex fallback');
    return regexExtract(combinedText, websiteUrl);
  }

  try {
    const res = await fetch('https://api.openai.com/v1/chat/completions', {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${apiKey}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        model: 'gpt-4o-mini',
        messages: [
          {
            role: 'user',
            content: `You are extracting structured contact information from a dental/medical clinic website.

Given the scraped content below, extract the following fields. Only include a field if you are confident it is correct. Do NOT guess or fabricate.

Fields to extract:
- businessName: The official clinic/practice name
- address: Full street address (street, city, province/state, postal code)
- contactEmail: Primary contact email (not personal emails)
- contactPhone: Primary phone number (formatted as found)
- timezone: IANA timezone based on the address (e.g. "America/Toronto", "America/New_York")

Website URL: ${websiteUrl}

Scraped content:

${combinedText}

Respond with ONLY a JSON object. Omit any field you cannot determine with confidence. Example:
{"businessName": "Downtown Dental", "address": "123 Main St, Toronto, ON M5V 2T6", "contactPhone": "(416) 555-1234", "timezone": "America/Toronto"}`,
          },
        ],
        temperature: 0,
        response_format: { type: 'json_object' },
      }),
    });

    if (!res.ok) {
      const errText = await res.text();
      logger.error(
        { status: res.status, error: errText },
        '[ClinicExtractor] OpenAI API error, using regex fallback',
      );
      return regexExtract(combinedText, websiteUrl);
    }

    const data = await res.json();
    const rawContent = data.choices?.[0]?.message?.content;

    if (!rawContent) {
      logger.warn('[ClinicExtractor] Empty OpenAI response, using regex fallback');
      return regexExtract(combinedText, websiteUrl);
    }

    const parsed: Record<string, string> = JSON.parse(rawContent);
    const result: ExtractedClinicInfo = {};

    if (parsed.businessName && typeof parsed.businessName === 'string') {
      result.businessName = parsed.businessName.trim();
    }
    if (parsed.address && typeof parsed.address === 'string') {
      result.address = parsed.address.trim();
    }
    if (parsed.contactEmail && typeof parsed.contactEmail === 'string') {
      result.contactEmail = parsed.contactEmail.trim().toLowerCase();
    }
    if (parsed.contactPhone && typeof parsed.contactPhone === 'string') {
      result.contactPhone = parsed.contactPhone.trim();
    }
    if (parsed.timezone && typeof parsed.timezone === 'string') {
      result.timezone = parsed.timezone.trim();
    }

    logger.info(
      { fields: Object.keys(result) },
      '[ClinicExtractor] Extracted clinic info via LLM',
    );

    return result;
  } catch (err) {
    logger.error(
      { error: err instanceof Error ? err.message : err },
      '[ClinicExtractor] LLM extraction failed, using regex fallback',
    );
    return regexExtract(combinedText, websiteUrl);
  }
}

// ── Regex fallback ──────────────────────────────────────────────────────

const PHONE_RE =
  /(?:\+?1[-.\s]?)?\(?\d{3}\)?[-.\s]?\d{3}[-.\s]?\d{4}/g;

const EMAIL_RE =
  /[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}/g;

function regexExtract(
  text: string,
  websiteUrl: string,
): ExtractedClinicInfo {
  const result: ExtractedClinicInfo = {};

  const phones = text.match(PHONE_RE);
  if (phones && phones.length > 0) {
    result.contactPhone = phones[0]!.trim();
  }

  const emails = text.match(EMAIL_RE);
  if (emails && emails.length > 0) {
    const clinicEmail = emails.find(
      (e) =>
        !e.includes('noreply') &&
        !e.includes('no-reply') &&
        !e.includes('example.com'),
    );
    if (clinicEmail) {
      result.contactEmail = clinicEmail.toLowerCase();
    }
  }

  try {
    const { hostname } = new URL(websiteUrl);
    result.website = websiteUrl;

    const parts = hostname.replace('www.', '').split('.');
    if (parts.length >= 2) {
      result.businessName = parts[0]!
        .split(/[-_]/)
        .map((w) => w.charAt(0).toUpperCase() + w.slice(1))
        .join(' ');
    }
  } catch {
    // ignore
  }

  return result;
}
