import { getLogger } from '@kit/shared/logger';

import type { ScrapedPage } from './website-scraper';

// ── Types ──────────────────────────────────────────────────────────────

export interface KBCategory {
  id: string;
  label: string;
  description: string;
}

export interface CategorizedDocument {
  categoryId: string;
  categoryLabel: string;
  content: string;
  sourcePages: string[];
  charCount: number;
}

export interface CategorizationResult {
  documents: CategorizedDocument[];
  totalSections: number;
  categorizedSections: number;
}

// ── Constants ──────────────────────────────────────────────────────────

export const KB_CATEGORIES: KBCategory[] = [
  {
    id: 'clinic-info',
    label: 'Clinic Information',
    description:
      'Business hours, location, directions, parking, contact details, general about-us information',
  },
  {
    id: 'services',
    label: 'Services & Procedures',
    description:
      'Dental/medical services, treatments, pricing information, special offers',
  },
  {
    id: 'insurance',
    label: 'Insurance & Coverage',
    description:
      'Accepted insurance plans, coverage policies, billing FAQs, payment options',
  },
  {
    id: 'providers',
    label: 'Doctors & Providers',
    description:
      'Doctor biographies, specialties, credentials, team member info',
  },
  {
    id: 'policies',
    label: 'Office Policies',
    description:
      'Cancellation rules, new patient requirements, payment terms, privacy policies',
  },
  {
    id: 'faqs',
    label: 'FAQs',
    description:
      'Frequently asked questions, preparation instructions, aftercare guides',
  },
];

const CATEGORY_LIST_FOR_PROMPT = KB_CATEGORIES.map(
  (c) => `- "${c.id}": ${c.label} — ${c.description}`,
).join('\n');

// ── LLM Categorization ────────────────────────────────────────────────

export interface SectionWithMeta {
  pageUrl: string;
  heading: string;
  content: string;
}

async function classifySections(
  sections: SectionWithMeta[],
): Promise<Record<string, SectionWithMeta[]>> {
  const logger = await getLogger();
  const apiKey = process.env.OPENAI_API_KEY;

  if (!apiKey) {
    logger.warn('[Categorizer] OPENAI_API_KEY not set, using fallback');
    return fallbackClassify(sections);
  }

  const sectionList = sections
    .map(
      (s, i) =>
        `[${i}] Heading: "${s.heading}"\nExcerpt: "${s.content.slice(0, 300)}"`,
    )
    .join('\n\n');

  const prompt = `You are a content classifier for a dental/medical clinic knowledge base.

Given the following content sections scraped from a clinic website, classify each section into exactly one of these categories:

${CATEGORY_LIST_FOR_PROMPT}

Sections to classify:

${sectionList}

Respond with ONLY a JSON object mapping section index (as string) to category id. Example:
{"0": "clinic-info", "1": "services", "2": "faqs"}

If a section doesn't clearly fit, use "clinic-info" as default.`;

  try {
    logger.info(
      { sectionCount: sections.length },
      '[Categorizer] Calling OpenAI for classification',
    );

    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), 30_000);

    let res: Response;
    try {
      res = await fetch('https://api.openai.com/v1/chat/completions', {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${apiKey}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          model: 'gpt-4o-mini',
          messages: [{ role: 'user', content: prompt }],
          temperature: 0,
          response_format: { type: 'json_object' },
        }),
        signal: controller.signal,
      });
    } finally {
      clearTimeout(timeoutId);
    }

    if (!res.ok) {
      const errText = await res.text();
      logger.error(
        { status: res.status, error: errText },
        '[Categorizer] OpenAI API error, using fallback',
      );
      return fallbackClassify(sections);
    }

    const data = await res.json();
    const rawContent = data.choices?.[0]?.message?.content;

    if (!rawContent) {
      logger.warn('[Categorizer] Empty OpenAI response, using fallback');
      return fallbackClassify(sections);
    }

    const mapping: Record<string, string> = JSON.parse(rawContent);
    const result: Record<string, SectionWithMeta[]> = {};

    for (const cat of KB_CATEGORIES) {
      result[cat.id] = [];
    }

    for (let i = 0; i < sections.length; i++) {
      const catId = mapping[String(i)] || 'clinic-info';
      const validCat = KB_CATEGORIES.some((c) => c.id === catId)
        ? catId
        : 'clinic-info';
      result[validCat]!.push(sections[i]!);
    }

    logger.info(
      {
        total: sections.length,
        distribution: Object.fromEntries(
          Object.entries(result).map(([k, v]) => [k, v.length]),
        ),
      },
      '[Categorizer] LLM classification complete',
    );

    return result;
  } catch (err) {
    const errMsg = err instanceof Error ? err.message : String(err);
    const isTimeout = err instanceof Error && err.name === 'AbortError';
    logger.error(
      { error: errMsg, isTimeout },
      `[Categorizer] LLM classification failed${isTimeout ? ' (timeout after 30s)' : ''}, using fallback`,
    );
    return fallbackClassify(sections);
  }
}

/**
 * Keyword-based fallback when OpenAI is unavailable.
 */
export function fallbackClassify(
  sections: SectionWithMeta[],
): Record<string, SectionWithMeta[]> {
  const result: Record<string, SectionWithMeta[]> = {};
  for (const cat of KB_CATEGORIES) {
    result[cat.id] = [];
  }

  const rules: [string, RegExp][] = [
    ['faqs', /\bfaq|frequently\s+asked|q\s*&\s*a|question/i],
    [
      'insurance',
      /\binsurance|coverage|billing|copay|deductible|payment\s+plan/i,
    ],
    [
      'providers',
      /\bdoctor|dentist|provider|dr\.\s|dds|dmd|hygienist|team\s+member|our\s+team|staff|biography|credentials/i,
    ],
    [
      'services',
      /\bservice|procedure|treatment|cleaning|whitening|implant|crown|filling|orthodont|braces|invisalign|cosmetic|emergency|extraction|root\s+canal|veneer/i,
    ],
    [
      'policies',
      /\bpolic|cancellation|no-show|new\s+patient|consent|hipaa|privacy|terms|payment\s+term/i,
    ],
  ];

  for (const section of sections) {
    const text = `${section.heading} ${section.content}`;
    let assigned = false;
    for (const [catId, regex] of rules) {
      if (regex.test(text)) {
        result[catId]!.push(section);
        assigned = true;
        break;
      }
    }
    if (!assigned) {
      result['clinic-info']!.push(section);
    }
  }

  return result;
}

// ── Document Generation ────────────────────────────────────────────────

export function generateDocument(
  categoryId: string,
  categoryLabel: string,
  sections: SectionWithMeta[],
): CategorizedDocument | null {
  if (sections.length === 0) return null;

  const lines: string[] = [`# ${categoryLabel}`, ''];
  const sourcePages = new Set<string>();
  const seenContent = new Set<string>();
  let lastHeading = '';

  for (const section of sections) {
    sourcePages.add(section.pageUrl);

    // Deduplicate identical content blocks within the same category
    const contentFp = section.content.toLowerCase().replace(/\s+/g, '');
    if (seenContent.has(contentFp)) continue;
    seenContent.add(contentFp);

    if (section.heading !== lastHeading) {
      // Also skip duplicate headings that hold no new content
      const headingFp = section.heading.toLowerCase().replace(/\s+/g, '');
      if (!seenContent.has(headingFp)) {
        seenContent.add(headingFp);
        lines.push(`## ${section.heading}`);
        lines.push('');
      }
      lastHeading = section.heading;
    }

    lines.push(section.content);
    lines.push('');
  }

  const content = lines.join('\n').trim();

  if (content.length <= categoryLabel.length + 5) return null;

  return {
    categoryId,
    categoryLabel,
    content,
    sourcePages: [...sourcePages],
    charCount: content.length,
  };
}

// ── Main ───────────────────────────────────────────────────────────────

/**
 * Takes scraped pages and produces categorized KB documents ready for upload.
 *
 * Sections are sent to OpenAI in batches for classification (with keyword
 * fallback) and then merged into one text document per category.
 */
export async function categorizeContent(
  pages: ScrapedPage[],
): Promise<CategorizationResult> {
  const logger = await getLogger();

  // Flatten and deduplicate sections across all pages.
  // Footer/header/copyright blocks appear on every page — keep only the first.
  // We deduplicate by content-only fingerprint as well, since the same info
  // may appear under different headings ("CONTACT US" vs "CONTACT INFORMATION").
  const allSections: SectionWithMeta[] = [];
  const seenFull = new Set<string>();
  const seenContent = new Set<string>();

  for (const page of pages) {
    for (const section of page.sections) {
      // Skip copyright / legal boilerplate lines
      if (/©|copyright|\ball rights reserved\b|droits d'auteur/i.test(section.content)) continue;
      if (/©|copyright|\ball rights reserved\b|droits d'auteur/i.test(section.heading)) continue;

      const contentFp = section.content.toLowerCase().replace(/\s+/g, '');
      const fullFp = (section.heading + '|' + section.content).toLowerCase().replace(/\s+/g, '');

      // Skip if we've seen this exact heading+content or this exact content under a different heading
      if (seenFull.has(fullFp)) continue;
      if (contentFp.length > 30 && seenContent.has(contentFp)) continue;

      seenFull.add(fullFp);
      seenContent.add(contentFp);

      allSections.push({
        pageUrl: page.url,
        heading: section.heading,
        content: section.content,
      });
    }
  }

  logger.info(
    { totalSections: allSections.length },
    '[Categorizer] Starting categorization',
  );

  if (allSections.length === 0) {
    return { documents: [], totalSections: 0, categorizedSections: 0 };
  }

  // Batch into chunks of 40 to keep within token limits
  const BATCH_SIZE = 40;
  const merged: Record<string, SectionWithMeta[]> = {};
  for (const cat of KB_CATEGORIES) {
    merged[cat.id] = [];
  }

  for (let i = 0; i < allSections.length; i += BATCH_SIZE) {
    const batch = allSections.slice(i, i + BATCH_SIZE);
    const batchResult = await classifySections(batch);

    for (const [catId, sections] of Object.entries(batchResult)) {
      merged[catId]!.push(...sections);
    }
  }

  const documents: CategorizedDocument[] = [];
  let categorizedSections = 0;

  for (const cat of KB_CATEGORIES) {
    const sections = merged[cat.id] || [];
    categorizedSections += sections.length;

    const doc = generateDocument(cat.id, cat.label, sections);
    if (doc) {
      documents.push(doc);
    }
  }

  logger.info(
    {
      totalSections: allSections.length,
      categorizedSections,
      documentsGenerated: documents.length,
    },
    '[Categorizer] Categorization complete',
  );

  return {
    documents,
    totalSections: allSections.length,
    categorizedSections,
  };
}
