'use client';

import { formatDistanceToNow } from 'date-fns';
import { AlertCircle, Bell, Phone, PhoneIncoming, PhoneOutgoing } from 'lucide-react';
import { Badge } from '@kit/ui/badge';
import { ScrollArea } from '@kit/ui/scroll-area';

interface ActionItem {
  id: string;
  contactName: string | null;
  contactPhone: string | null;
  summary: string | null;
  direction: 'INBOUND' | 'OUTBOUND';
  reason: string | null;
  status: string;
  callType: string | null;
  createdAt: string;
}

interface NotificationListProps {
  actionItems: ActionItem[];
  onClose?: () => void;
}

const REASON_LABELS: Record<string, string> = {
  FOLLOW_UP_REQUIRED: 'Follow-up Required',
  TRANSFER_FAILED: 'Transfer Failed',
  NO_RESOLUTION: 'No Resolution',
  EMERGENCY: 'Emergency',
  CALLER_HUNG_UP: 'Caller Hung Up',
  CALL_ERROR: 'Call Error',
  VOICEMAIL_REVIEW: 'Voicemail Review',
};

const REASON_COLORS: Record<string, string> = {
  FOLLOW_UP_REQUIRED: 'bg-orange-100 text-orange-800 dark:bg-orange-900/30 dark:text-orange-300',
  TRANSFER_FAILED: 'bg-red-100 text-red-800 dark:bg-red-900/30 dark:text-red-300',
  NO_RESOLUTION: 'bg-amber-100 text-amber-800 dark:bg-amber-900/30 dark:text-amber-300',
  EMERGENCY: 'bg-red-100 text-red-800 dark:bg-red-900/30 dark:text-red-300',
  CALLER_HUNG_UP: 'bg-gray-100 text-gray-800 dark:bg-gray-800/30 dark:text-gray-300',
  CALL_ERROR: 'bg-red-100 text-red-800 dark:bg-red-900/30 dark:text-red-300',
  VOICEMAIL_REVIEW: 'bg-blue-100 text-blue-800 dark:bg-blue-900/30 dark:text-blue-300',
};

function formatPhone(raw: string | null): string {
  if (!raw) return '';
  const digits = raw.replace(/\D/g, '');
  if (digits.length === 11 && digits[0] === '1') {
    return `(${digits.slice(1, 4)}) ${digits.slice(4, 7)}-${digits.slice(7)}`;
  }
  if (digits.length === 10) {
    return `(${digits.slice(0, 3)}) ${digits.slice(3, 6)}-${digits.slice(6)}`;
  }
  return raw;
}

export function NotificationList({
  actionItems,
  onClose,
}: NotificationListProps) {
  if (actionItems.length === 0) {
    return (
      <div className="py-8 text-center text-muted-foreground">
        <Bell className="h-12 w-12 mx-auto mb-2 opacity-50" />
        <p>No open action items</p>
      </div>
    );
  }

  return (
    <ScrollArea className="h-[400px] pr-4">
      <div className="divide-y">
        {actionItems.map((item) => (
          <a
            key={item.id}
            href="/home/action-items"
            className="flex items-start gap-3 px-4 py-3 hover:bg-muted/50 transition-colors"
            onClick={() => onClose?.()}
          >
            <div className="rounded-full bg-amber-100 dark:bg-amber-900/40 p-1.5 flex-shrink-0 mt-0.5">
              <AlertCircle className="h-3.5 w-3.5 text-amber-600 dark:text-amber-400" />
            </div>
            <div className="flex-1 min-w-0 space-y-1">
              <div className="flex items-center flex-wrap gap-1">
                <Badge className={`text-[10px] px-1.5 py-0 ${REASON_COLORS[item.reason || ''] || 'bg-gray-100 text-gray-800 dark:bg-gray-800/30 dark:text-gray-300'}`}>
                  {REASON_LABELS[item.reason || ''] || item.reason || 'Needs attention'}
                </Badge>
                <Badge variant="outline" className="text-[10px] px-1.5 py-0 gap-0.5">
                  {item.direction === 'INBOUND'
                    ? <><PhoneIncoming className="h-2.5 w-2.5" /> Inbound</>
                    : <><PhoneOutgoing className="h-2.5 w-2.5" /> Outbound</>
                  }
                </Badge>
                {item.callType && (
                  <Badge variant="outline" className="text-[10px] px-1.5 py-0">
                    {item.callType}
                  </Badge>
                )}
              </div>
              <div className="flex items-center gap-1.5">
                <p className="text-sm font-medium truncate">
                  {item.contactName || 'Unknown caller'}
                </p>
                {item.contactPhone && (
                  <span className="inline-flex items-center gap-0.5 text-xs text-muted-foreground flex-shrink-0">
                    <Phone className="h-2.5 w-2.5" />
                    {formatPhone(item.contactPhone)}
                  </span>
                )}
              </div>
              {item.summary && (
                <p className="text-[11px] text-muted-foreground line-clamp-2">
                  {item.summary}
                </p>
              )}
              <p className="text-[10px] text-muted-foreground">
                {formatDistanceToNow(new Date(item.createdAt), {
                  addSuffix: true,
                })}
              </p>
            </div>
          </a>
        ))}
      </div>
    </ScrollArea>
  );
}
