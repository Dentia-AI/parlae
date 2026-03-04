/**
 * Shared pagination and filtering utilities for admin API routes.
 */

export interface PaginationParams {
  page: number;
  limit: number;
  search: string;
  templateId: string;
  version: string;
  status: string;
}

export interface PaginationResult {
  page: number;
  limit: number;
  total: number;
  totalPages: number;
}

export function parsePaginationParams(url: URL): PaginationParams {
  return {
    page: Math.max(1, parseInt(url.searchParams.get('page') || '1', 10)),
    limit: Math.min(100, Math.max(1, parseInt(url.searchParams.get('limit') || '50', 10))),
    search: url.searchParams.get('search') || '',
    templateId: url.searchParams.get('templateId') || '',
    version: url.searchParams.get('version') || '',
    status: url.searchParams.get('status') || '',
  };
}

export function buildPagination(page: number, limit: number, total: number): PaginationResult {
  return {
    page,
    limit,
    total,
    totalPages: Math.ceil(total / limit),
  };
}

/**
 * Build a Prisma `where` clause for searching accounts by name or email.
 * Merges with any additional conditions provided.
 */
export function buildAccountSearchWhere(
  search: string,
  additionalWhere: Record<string, unknown> = {},
): Record<string, unknown> {
  const where: Record<string, unknown> = { ...additionalWhere };

  if (search.trim()) {
    where.OR = [
      { name: { contains: search.trim(), mode: 'insensitive' } },
      { email: { contains: search.trim(), mode: 'insensitive' } },
    ];
  }

  return where;
}

/**
 * Resolve account IDs for a bulk deploy-all request.
 * Applies the same filters as version-overview to find matching accounts,
 * then excludes any in the exclusion list.
 */
export function excludeFromIds(allIds: string[], excludeIds: string[]): string[] {
  const excludeSet = new Set(excludeIds);
  return allIds.filter((id) => !excludeSet.has(id));
}
