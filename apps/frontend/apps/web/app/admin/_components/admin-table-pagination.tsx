'use client';

import { Button } from '@kit/ui/button';
import { ChevronLeft, ChevronRight, ChevronsLeft, ChevronsRight } from 'lucide-react';

interface AdminTablePaginationProps {
  page: number;
  totalPages: number;
  total: number;
  limit: number;
  onPageChange: (page: number) => void;
}

export function AdminTablePagination({
  page,
  totalPages,
  total,
  limit,
  onPageChange,
}: AdminTablePaginationProps) {
  const start = (page - 1) * limit + 1;
  const end = Math.min(page * limit, total);

  return (
    <div className="flex items-center justify-between pt-4">
      <span className="text-sm text-muted-foreground">
        {total > 0 ? `${start}–${end} of ${total}` : 'No results'}
      </span>
      <div className="flex items-center gap-1">
        <Button
          variant="outline"
          size="icon"
          className="h-8 w-8"
          disabled={page <= 1}
          onClick={() => onPageChange(1)}
        >
          <ChevronsLeft className="h-4 w-4" />
        </Button>
        <Button
          variant="outline"
          size="icon"
          className="h-8 w-8"
          disabled={page <= 1}
          onClick={() => onPageChange(page - 1)}
        >
          <ChevronLeft className="h-4 w-4" />
        </Button>
        <span className="px-3 text-sm">
          Page {page} of {totalPages || 1}
        </span>
        <Button
          variant="outline"
          size="icon"
          className="h-8 w-8"
          disabled={page >= totalPages}
          onClick={() => onPageChange(page + 1)}
        >
          <ChevronRight className="h-4 w-4" />
        </Button>
        <Button
          variant="outline"
          size="icon"
          className="h-8 w-8"
          disabled={page >= totalPages}
          onClick={() => onPageChange(totalPages)}
        >
          <ChevronsRight className="h-4 w-4" />
        </Button>
      </div>
    </div>
  );
}

interface SelectAllBannerProps {
  totalMatching: number;
  excludeCount: number;
  onClear: () => void;
}

/**
 * Shows when "Select All Matching" mode is active, indicating
 * all matching accounts across all pages are selected (minus exclusions).
 */
export function SelectAllBanner({ totalMatching, excludeCount, onClear }: SelectAllBannerProps) {
  const effectiveCount = totalMatching - excludeCount;

  return (
    <div className="bg-primary/10 border border-primary/30 rounded-md px-4 py-2 flex items-center justify-between text-sm">
      <span>
        All <strong>{effectiveCount}</strong> matching account{effectiveCount !== 1 ? 's' : ''} selected
        {excludeCount > 0 && (
          <span className="text-muted-foreground ml-1">
            ({excludeCount} excluded)
          </span>
        )}
      </span>
      <Button variant="ghost" size="sm" onClick={onClear}>
        Clear selection
      </Button>
    </div>
  );
}
