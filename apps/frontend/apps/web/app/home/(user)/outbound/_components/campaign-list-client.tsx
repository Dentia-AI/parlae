'use client';

import { useState, useEffect, useCallback } from 'react';
import { useTranslation } from 'react-i18next';
import { Card, CardContent } from '@kit/ui/card';
import { Badge } from '@kit/ui/badge';
import { Button } from '@kit/ui/button';
import { ChevronLeft, ChevronRight, Loader2 } from 'lucide-react';
import { toast } from '@kit/ui/sonner';
import { CampaignCard } from './campaign-card';

interface Pagination {
  page: number;
  limit: number;
  total: number;
  totalPages: number;
}

interface CallTypeSummary {
  campaigns: number;
  active: number;
  contacts: number;
}

interface CampaignListClientProps {
  group: 'PATIENT_CARE' | 'FINANCIAL';
  callTypes: string[];
  callTypeLabelFn: (type: string) => string;
  channelLabelFn: (channel: string) => string;
  emptyMessageKey: string;
  campaignsHeadingKey: string;
  summaryGridCols?: string;
}

const STATUS_SORT_ORDER: Record<string, number> = {
  ACTIVE: 0,
  DRAFT: 1,
  SCHEDULED: 2,
  PAUSED: 3,
  COMPLETED: 4,
  CANCELLED: 5,
};

function sortCampaigns(campaigns: any[]) {
  return [...campaigns].sort((a, b) => {
    const orderA = STATUS_SORT_ORDER[a.status] ?? 3;
    const orderB = STATUS_SORT_ORDER[b.status] ?? 3;
    if (orderA !== orderB) return orderA - orderB;
    return new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime();
  });
}

export function CampaignListClient({
  group,
  callTypes,
  callTypeLabelFn,
  channelLabelFn,
  emptyMessageKey,
  campaignsHeadingKey,
  summaryGridCols = 'sm:grid-cols-3',
}: CampaignListClientProps) {
  const { t } = useTranslation('common');
  const [campaigns, setCampaigns] = useState<any[]>([]);
  const [summary, setSummary] = useState<Record<string, CallTypeSummary>>({});
  const [pagination, setPagination] = useState<Pagination | null>(null);
  const [page, setPage] = useState(1);
  const [loading, setLoading] = useState(true);

  const fetchCampaigns = useCallback(async () => {
    setLoading(true);
    try {
      const params = new URLSearchParams({
        page: String(page),
        limit: '20',
        group,
      });

      const res = await fetch(`/api/outbound/campaigns?${params}`);
      const data = await res.json();

      if (res.ok) {
        setCampaigns(data.campaigns);
        setPagination(data.pagination);
        setSummary(data.summary || {});
      } else {
        toast.error(data.error || 'Failed to fetch campaigns');
      }
    } catch {
      toast.error('Failed to fetch campaigns');
    } finally {
      setLoading(false);
    }
  }, [page, group]);

  useEffect(() => {
    fetchCampaigns();
  }, [fetchCampaigns]);

  if (loading && page === 1) {
    return (
      <div className="flex items-center justify-center py-12">
        <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
      </div>
    );
  }

  return (
    <>
      <div className={`grid ${summaryGridCols} gap-3`}>
        {callTypes.map((type) => {
          const s = summary[type] || { campaigns: 0, active: 0, contacts: 0 };
          return (
            <Card key={type} className="hover:shadow-sm transition-shadow">
              <CardContent className="pt-4 pb-4">
                <div className="flex items-center justify-between mb-2">
                  <p className="text-sm font-medium">{callTypeLabelFn(type)}</p>
                  {s.active > 0 && (
                    <Badge variant="default" className="bg-green-600 text-xs">
                      {t('outbound.campaign.activeCount', { count: s.active })}
                    </Badge>
                  )}
                </div>
                <div className="flex items-center gap-4 text-xs text-muted-foreground">
                  <span>{t('outbound.campaign.campaignsCount', { count: s.campaigns })}</span>
                  <span>{t('outbound.campaign.contactsCount', { count: s.contacts })}</span>
                </div>
              </CardContent>
            </Card>
          );
        })}
      </div>

      <h3 className="text-lg font-semibold">
        {t(campaignsHeadingKey)}
      </h3>

      {campaigns.length === 0 && !loading ? (
        <Card className="border-dashed">
          <CardContent className="pt-8 pb-8 text-center">
            <p className="text-muted-foreground">
              {t(emptyMessageKey)}
            </p>
          </CardContent>
        </Card>
      ) : (
        <div className="space-y-3">
          {loading ? (
            <div className="flex items-center justify-center py-8">
              <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />
            </div>
          ) : (
            sortCampaigns(campaigns).map((campaign) => (
              <CampaignCard
                key={campaign.id}
                campaign={campaign}
                callTypeLabel={callTypeLabelFn(campaign.callType)}
                channelLabel={channelLabelFn(campaign.channel)}
                onDeleted={fetchCampaigns}
              />
            ))
          )}

          {pagination && pagination.totalPages > 1 && (
            <div className="flex items-center justify-between py-3">
              <div className="text-sm text-muted-foreground">
                {t('outbound.campaign.pageInfo', {
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
        </div>
      )}
    </>
  );
}
