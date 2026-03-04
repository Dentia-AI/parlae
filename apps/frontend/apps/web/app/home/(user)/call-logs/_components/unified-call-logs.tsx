'use client';

import { useState } from 'react';
import { useSearchParams, useRouter } from 'next/navigation';
import { useTranslation } from 'react-i18next';
import { Button } from '@kit/ui/button';
import { PhoneIncoming, PhoneOutgoing, Phone } from 'lucide-react';

import { CallLogsTable } from './call-logs-table';
import { OutboundCallLogsTable } from '../../outbound/call-logs/_components/outbound-call-logs-table';

type Direction = 'inbound' | 'outbound';

const TABS: { value: Direction; labelKey: string; Icon: typeof Phone }[] = [
  { value: 'inbound', labelKey: 'callLogs.directionInbound', Icon: PhoneIncoming },
  { value: 'outbound', labelKey: 'callLogs.directionOutbound', Icon: PhoneOutgoing },
];

export function UnifiedCallLogs() {
  const { t } = useTranslation('common');
  const searchParams = useSearchParams();
  const router = useRouter();

  const initial = (searchParams.get('direction') as Direction) || 'inbound';
  const [direction, setDirection] = useState<Direction>(initial);

  const handleTab = (d: Direction) => {
    setDirection(d);
    const params = new URLSearchParams();
    if (d !== 'inbound') params.set('direction', d);
    const qs = params.toString();
    router.replace(`/home/call-logs${qs ? `?${qs}` : ''}`);
  };

  return (
    <div className="flex flex-col min-h-0 flex-1 overflow-hidden">
      <div className="flex-shrink-0 flex items-center gap-1 mb-3 border-b pb-2">
        {TABS.map(({ value, labelKey, Icon }) => (
          <Button
            key={value}
            variant={direction === value ? 'default' : 'ghost'}
            size="sm"
            className="gap-1.5 text-xs h-8 px-3"
            onClick={() => handleTab(value)}
          >
            <Icon className="h-3.5 w-3.5" />
            {t(labelKey)}
          </Button>
        ))}
      </div>

      <div className="flex flex-col flex-1 min-h-0 overflow-hidden">
        {direction === 'inbound' ? <CallLogsTable /> : <OutboundCallLogsTable basePath="/home/call-logs?direction=outbound" />}
      </div>
    </div>
  );
}
