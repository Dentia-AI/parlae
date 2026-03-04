'use client';

import { useState, useEffect, useCallback, useTransition } from 'react';
import { useTranslation } from 'react-i18next';
import { Card, CardContent } from '@kit/ui/card';
import { Button } from '@kit/ui/button';
import { Input } from '@kit/ui/input';
import { Badge } from '@kit/ui/badge';
import { toast } from '@kit/ui/sonner';
import { useCsrfToken } from '@kit/shared/hooks/use-csrf-token';
import { Search, Plus, Trash2, ShieldBan, ChevronLeft, ChevronRight, Loader2 } from 'lucide-react';

interface DncEntry {
  id: string;
  phoneNumber: string;
  reason: string | null;
  source: string;
  createdAt: string;
}

interface Pagination {
  page: number;
  limit: number;
  total: number;
  totalPages: number;
}

interface DncListClientProps {
  accountId: string;
}

const SOURCE_KEYS: Record<string, string> = {
  manual: 'outbound.dnc.source.manual',
  call_analysis: 'outbound.dnc.source.call_analysis',
  patient_request: 'outbound.dnc.source.patient_request',
};

export function DncListClient({ accountId }: DncListClientProps) {
  const { t } = useTranslation('common');
  const csrfToken = useCsrfToken();
  const [entries, setEntries] = useState<DncEntry[]>([]);
  const [pagination, setPagination] = useState<Pagination | null>(null);
  const [page, setPage] = useState(1);
  const [search, setSearch] = useState('');
  const [debouncedSearch, setDebouncedSearch] = useState('');
  const [loading, setLoading] = useState(true);
  const [newPhone, setNewPhone] = useState('');
  const [newReason, setNewReason] = useState('');
  const [showAdd, setShowAdd] = useState(false);
  const [isPending, startTransition] = useTransition();

  // Debounce search input
  useEffect(() => {
    const timer = setTimeout(() => {
      setDebouncedSearch(search);
      setPage(1);
    }, 300);
    return () => clearTimeout(timer);
  }, [search]);

  const fetchEntries = useCallback(async () => {
    setLoading(true);
    try {
      const params = new URLSearchParams({ page: String(page), limit: '20' });
      if (debouncedSearch.trim()) params.set('search', debouncedSearch.trim());

      const res = await fetch(`/api/outbound/dnc?${params}`);
      const data = await res.json();

      if (res.ok) {
        setEntries(data.entries);
        setPagination(data.pagination);
      } else {
        toast.error(data.error || 'Failed to fetch DNC entries');
      }
    } catch {
      toast.error('Failed to fetch DNC entries');
    } finally {
      setLoading(false);
    }
  }, [page, debouncedSearch]);

  useEffect(() => {
    fetchEntries();
  }, [fetchEntries]);

  const handleAdd = () => {
    if (!newPhone.trim()) return;

    startTransition(async () => {
      try {
        const res = await fetch('/api/outbound/dnc', {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'x-csrf-token': csrfToken,
          },
          credentials: 'include',
          body: JSON.stringify({
            phoneNumber: newPhone.trim(),
            reason: newReason.trim() || 'manual',
          }),
        });

        if (!res.ok) throw new Error('Failed to add');

        setNewPhone('');
        setNewReason('');
        setShowAdd(false);
        toast.success(t('outbound.dnc.addedSuccess'));
        setPage(1);
        fetchEntries();
      } catch {
        toast.error(t('outbound.dnc.addedError'));
      }
    });
  };

  const handleRemove = (id: string) => {
    startTransition(async () => {
      try {
        const res = await fetch('/api/outbound/dnc', {
          method: 'DELETE',
          headers: {
            'Content-Type': 'application/json',
            'x-csrf-token': csrfToken,
          },
          credentials: 'include',
          body: JSON.stringify({ id }),
        });

        if (!res.ok) throw new Error('Failed to remove');

        toast.success(t('outbound.dnc.removedSuccess'));
        fetchEntries();
      } catch {
        toast.error(t('outbound.dnc.removedError'));
      }
    });
  };

  return (
    <div className="flex flex-col min-h-0 flex-1 space-y-3">
      <div className="flex items-center gap-2 flex-shrink-0">
        <div className="relative flex-1">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
          <Input
            placeholder={t('outbound.dnc.searchPlaceholder')}
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="pl-9"
          />
        </div>
        <Button size="sm" onClick={() => setShowAdd(!showAdd)}>
          <Plus className="h-4 w-4 mr-1" />
          {t('outbound.dnc.addNumber')}
        </Button>
      </div>

      {showAdd && (
        <Card>
          <CardContent className="pt-4 pb-4">
            <div className="flex items-end gap-3">
              <div className="flex-1">
                <label className="text-sm font-medium mb-1 block">
                  {t('outbound.dnc.phoneLabel')}
                </label>
                <Input
                  placeholder="+1 (555) 123-4567"
                  value={newPhone}
                  onChange={(e) => setNewPhone(e.target.value)}
                />
              </div>
              <div className="flex-1">
                <label className="text-sm font-medium mb-1 block">
                  {t('outbound.dnc.reasonLabel')}
                </label>
                <Input
                  placeholder={t('outbound.dnc.reasonPlaceholder')}
                  value={newReason}
                  onChange={(e) => setNewReason(e.target.value)}
                />
              </div>
              <Button onClick={handleAdd} disabled={isPending || !newPhone.trim()}>
                {t('outbound.dnc.add')}
              </Button>
            </div>
          </CardContent>
        </Card>
      )}

      <div className="flex-1 overflow-auto min-h-0">
        {loading ? (
          <div className="flex items-center justify-center py-12">
            <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
          </div>
        ) : entries.length === 0 ? (
          <Card className="border-dashed">
            <CardContent className="pt-10 pb-10 text-center">
              <ShieldBan className="h-12 w-12 text-muted-foreground mx-auto mb-4" />
              <h3 className="text-lg font-semibold mb-2">
                {t('outbound.dnc.emptyTitle')}
              </h3>
              <p className="text-muted-foreground max-w-md mx-auto">
                {t('outbound.dnc.emptyDesc')}
              </p>
            </CardContent>
          </Card>
        ) : (
          <Card>
            <CardContent className="pt-0 pb-0">
              <table className="w-full">
                <thead>
                  <tr className="border-b text-left text-sm text-muted-foreground">
                    <th className="py-3 font-medium">{t('outbound.dnc.colPhone')}</th>
                    <th className="py-3 font-medium">{t('outbound.dnc.colReason')}</th>
                    <th className="py-3 font-medium">{t('outbound.dnc.colSource')}</th>
                    <th className="py-3 font-medium">{t('outbound.dnc.colDate')}</th>
                    <th className="py-3 font-medium w-16"></th>
                  </tr>
                </thead>
                <tbody>
                  {entries.map((entry) => (
                    <tr key={entry.id} className="border-b last:border-0">
                      <td className="py-3 text-sm font-medium">{entry.phoneNumber}</td>
                      <td className="py-3 text-sm text-muted-foreground">
                        {entry.reason || '--'}
                      </td>
                      <td className="py-3">
                        <Badge variant="outline" className="text-xs">
                          {SOURCE_KEYS[entry.source] ? t(SOURCE_KEYS[entry.source]!) : entry.source}
                        </Badge>
                      </td>
                      <td className="py-3 text-sm text-muted-foreground">
                        {new Date(entry.createdAt).toLocaleDateString()}
                      </td>
                      <td className="py-3">
                        <Button
                          variant="ghost"
                          size="sm"
                          onClick={() => handleRemove(entry.id)}
                          disabled={isPending}
                          className="h-8 w-8 p-0 text-destructive hover:text-destructive"
                        >
                          <Trash2 className="h-4 w-4" />
                        </Button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </CardContent>

            {pagination && pagination.totalPages > 1 && (
              <div className="flex items-center justify-between px-6 py-3 border-t">
                <div className="text-sm text-muted-foreground">
                  {t('outbound.dnc.pageInfo', {
                    page: pagination.page,
                    totalPages: pagination.totalPages,
                    total: pagination.total,
                    defaultValue: `Page ${pagination.page} of ${pagination.totalPages} (${pagination.total} total)`,
                  })}
                </div>
                <div className="flex items-center gap-2">
                  <Button
                    variant="outline"
                    size="sm"
                    disabled={page <= 1}
                    onClick={() => setPage((p) => p - 1)}
                  >
                    <ChevronLeft className="h-4 w-4" />
                    {t('activityLog.previous', 'Previous')}
                  </Button>
                  <Button
                    variant="outline"
                    size="sm"
                    disabled={page >= pagination.totalPages}
                    onClick={() => setPage((p) => p + 1)}
                  >
                    {t('activityLog.next', 'Next')}
                    <ChevronRight className="h-4 w-4" />
                  </Button>
                </div>
              </div>
            )}
          </Card>
        )}
      </div>

      {pagination && (
        <div className="flex-shrink-0 text-xs text-muted-foreground py-2">
          {t('outbound.dnc.totalEntries', { count: pagination.total })}
        </div>
      )}
    </div>
  );
}
