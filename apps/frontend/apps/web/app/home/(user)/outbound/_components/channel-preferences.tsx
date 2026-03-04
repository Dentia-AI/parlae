'use client';

import { useState, useTransition } from 'react';
import { useTranslation } from 'react-i18next';
import { useCsrfToken } from '@kit/shared/hooks/use-csrf-token';
import { toast } from '@kit/ui/sonner';
import { Phone, MessageSquare, Mail, Ban } from 'lucide-react';

const PATIENT_CARE_TYPES = [
  'recall',
  'reminder',
  'followup',
  'noshow',
  'postop',
  'reactivation',
  'welcome',
  'survey',
  'treatment_plan',
] as const;

const FINANCIAL_TYPES = ['payment', 'benefits'] as const;

const CHANNELS = [
  { id: 'none', icon: Ban },
  { id: 'phone', icon: Phone },
  { id: 'sms', icon: MessageSquare },
  { id: 'email', icon: Mail },
] as const;

interface ChannelPreferencesProps {
  channelDefaults: Record<string, string>;
  patientCareEnabled: boolean;
  financialEnabled: boolean;
}

export function ChannelPreferences({
  channelDefaults,
  patientCareEnabled,
  financialEnabled,
}: ChannelPreferencesProps) {
  const { t } = useTranslation();
  const getCsrfToken = useCsrfToken;
  const [defaults, setDefaults] = useState(channelDefaults);
  const [isPending, startTransition] = useTransition();

  const updateChannel = (callType: string, channel: string) => {
    const updated = { ...defaults, [callType]: channel };
    setDefaults(updated);

    startTransition(async () => {
      try {
        const res = await fetch('/api/outbound/settings', {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'x-csrf-token': getCsrfToken(),
          },
          credentials: 'include',
          body: JSON.stringify({
            action: 'setChannelDefaults',
            channelDefaults: { [callType]: channel },
          }),
        });
        if (!res.ok) throw new Error();
        toast.success(t('common:features.saved'));
      } catch {
        setDefaults((prev) => ({ ...prev, [callType]: channelDefaults[callType] || 'phone' }));
        toast.error(t('common:features.saveFailed'));
      }
    });
  };

  const patientCareTypes = patientCareEnabled ? PATIENT_CARE_TYPES : [];
  const financialTypes = financialEnabled ? FINANCIAL_TYPES : [];
  const hasAny = patientCareTypes.length > 0 || financialTypes.length > 0;

  if (!hasAny) return null;

  return (
    <div className="space-y-4">
      {patientCareTypes.length > 0 && (
        <div className="space-y-2">
          <p className="text-xs font-medium text-muted-foreground uppercase tracking-wide">
            {t('common:outbound.channelPrefs.patientCareGroup')}
          </p>
          {patientCareTypes.map((ct) => (
            <ChannelRow
              key={ct}
              callType={ct}
              currentChannel={defaults[ct] || 'phone'}
              onSelect={updateChannel}
              disabled={isPending}
              t={t}
            />
          ))}
        </div>
      )}

      {financialTypes.length > 0 && (
        <div className="space-y-2">
          <p className="text-xs font-medium text-muted-foreground uppercase tracking-wide">
            {t('common:outbound.channelPrefs.financialGroup')}
          </p>
          {financialTypes.map((ct) => (
            <ChannelRow
              key={ct}
              callType={ct}
              currentChannel={defaults[ct] || 'phone'}
              onSelect={updateChannel}
              disabled={isPending}
              t={t}
            />
          ))}
        </div>
      )}

      <p className="text-[11px] text-muted-foreground">
        {t('common:outbound.channelPrefs.comingSoonNote')}
      </p>
    </div>
  );
}

function ChannelRow({
  callType,
  currentChannel,
  onSelect,
  disabled,
  t,
}: {
  callType: string;
  currentChannel: string;
  onSelect: (callType: string, channel: string) => void;
  disabled: boolean;
  t: (key: string) => string;
}) {
  const isNone = currentChannel === 'none';

  return (
    <div className={`flex items-center justify-between rounded-lg border p-3 transition-colors ${isNone ? 'opacity-50' : ''}`}>
      <p className="text-sm font-medium">
        {t(`common:outbound.channelPrefs.types.${callType}`)}
      </p>
      <div className="flex items-center gap-0.5 rounded-lg border bg-muted/40 p-0.5">
        {CHANNELS.map(({ id, icon: Icon }) => {
          const active = currentChannel === id;
          return (
            <button
              key={id}
              type="button"
              disabled={disabled}
              onClick={() => onSelect(callType, id)}
              className={`flex items-center gap-1.5 rounded-md px-2.5 py-1.5 text-xs font-medium transition-all ${
                active
                  ? id === 'none'
                    ? 'bg-destructive/15 text-destructive shadow-sm ring-1 ring-destructive/30'
                    : 'bg-primary text-primary-foreground shadow-sm'
                  : 'text-muted-foreground hover:text-foreground hover:bg-muted/60'
              } ${disabled ? 'opacity-50 cursor-not-allowed' : 'cursor-pointer'}`}
            >
              <Icon className="h-3 w-3" />
              {t(`common:outbound.channelPrefs.channels.${id}`)}
            </button>
          );
        })}
      </div>
    </div>
  );
}
