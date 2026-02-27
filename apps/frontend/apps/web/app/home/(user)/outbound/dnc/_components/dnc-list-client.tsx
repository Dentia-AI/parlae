'use client';

import { useState, useTransition, useMemo } from 'react';
import { useTranslation } from 'react-i18next';
import { Card, CardContent } from '@kit/ui/card';
import { Button } from '@kit/ui/button';
import { Input } from '@kit/ui/input';
import { Badge } from '@kit/ui/badge';
import { toast } from '@kit/ui/sonner';
import { useRouter } from 'next/navigation';
import { useCsrfToken } from '@kit/shared/hooks/use-csrf-token';
import { Search, Plus, Trash2, ShieldBan } from 'lucide-react';

interface DncEntry {
  id: string;
  phoneNumber: string;
  reason: string | null;
  source: string;
  createdAt: string;
}

interface DncListClientProps {
  accountId: string;
  initialEntries: DncEntry[];
}

const SOURCE_KEYS: Record<string, string> = {
  manual: 'outbound.dnc.source.manual',
  call_analysis: 'outbound.dnc.source.call_analysis',
  patient_request: 'outbound.dnc.source.patient_request',
};

export function DncListClient({ accountId, initialEntries }: DncListClientProps) {
  const { t } = useTranslation('common');
  const csrfToken = useCsrfToken();
  const router = useRouter();
  const [entries, setEntries] = useState(initialEntries);
  const [search, setSearch] = useState('');
  const [newPhone, setNewPhone] = useState('');
  const [newReason, setNewReason] = useState('');
  const [showAdd, setShowAdd] = useState(false);
  const [isPending, startTransition] = useTransition();

  const filtered = useMemo(() => {
    if (!search.trim()) return entries;
    const q = search.toLowerCase();
    return entries.filter(
      (e) =>
        e.phoneNumber.toLowerCase().includes(q) ||
        (e.reason?.toLowerCase() || '').includes(q),
    );
  }, [entries, search]);

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

        const entry = await res.json();
        setEntries((prev) => [
          {
            id: entry.id,
            phoneNumber: entry.phoneNumber,
            reason: entry.reason,
            source: entry.source,
            createdAt: entry.createdAt,
          },
          ...prev.filter((e) => e.phoneNumber !== entry.phoneNumber),
        ]);
        setNewPhone('');
        setNewReason('');
        setShowAdd(false);
        toast.success(t('outbound.dnc.addedSuccess'));
        router.refresh();
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

        setEntries((prev) => prev.filter((e) => e.id !== id));
        toast.success(t('outbound.dnc.removedSuccess'));
        router.refresh();
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
        {filtered.length === 0 ? (
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
                  {filtered.map((entry) => (
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
          </Card>
        )}
      </div>

      <div className="flex-shrink-0 text-xs text-muted-foreground py-2">
        {t('outbound.dnc.totalEntries', { count: entries.length })}
        {search && filtered.length !== entries.length &&
          ` · ${t('outbound.dnc.showing', { count: filtered.length })}`}
      </div>
    </div>
  );
}
