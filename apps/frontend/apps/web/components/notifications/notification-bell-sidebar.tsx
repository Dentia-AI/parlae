'use client';

import { useState } from 'react';
import { AlertCircle, ArrowRight, Bell, Phone, PhoneIncoming, PhoneOutgoing } from 'lucide-react';
import { Button } from '@kit/ui/button';
import { Badge } from '@kit/ui/badge';
import { Card } from '@kit/ui/card';
import { useNotifications } from './use-notifications';
import { formatDistanceToNow } from 'date-fns';

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

export function NotificationBellSidebar() {
  const [expanded, setExpanded] = useState(false);
  const { actionItems, actionItemCount } = useNotifications();

  return (
    <div className="w-full">
      <Button
        variant="ghost"
        className="w-full justify-start relative"
        onClick={() => setExpanded(!expanded)}
      >
        <Bell className="h-5 w-5 text-gray-700 dark:text-gray-100 group-data-[minimized=false]/sidebar:mr-2" />
        <span className="flex-1 text-left group-data-[minimized=true]/sidebar:hidden">Action Items</span>
        {actionItemCount > 0 && (
          <Badge
            variant="destructive"
            className="h-5 min-w-5 rounded-full px-1 text-xs absolute -top-1 -right-1 group-data-[minimized=false]/sidebar:static"
          >
            {actionItemCount > 9 ? '9+' : actionItemCount}
          </Badge>
        )}
      </Button>

      {expanded && actionItems.length > 0 && (
        <div className="mt-2 space-y-2 px-2">
          {actionItems.slice(0, 3).map((item) => {
            const callLogPath = item.direction === 'OUTBOUND'
              ? `/home/outbound/call-logs/${item.callId}`
              : `/home/call-logs/${item.callId}`;

            return (
              <Card key={item.id} className="p-3 hover:bg-muted/50 transition-colors">
                <div className="flex items-start gap-2">
                  <AlertCircle className="h-4 w-4 text-amber-600 dark:text-amber-400 flex-shrink-0 mt-0.5" />
                  <div className="flex-1 min-w-0 space-y-1">
                    <div className="flex items-center flex-wrap gap-1">
                      <Badge className={`text-[10px] px-1 py-0 ${REASON_COLORS[item.reason || ''] || 'bg-gray-100 text-gray-800 dark:bg-gray-800/30 dark:text-gray-300'}`}>
                        {REASON_LABELS[item.reason || ''] || item.reason || 'Needs attention'}
                      </Badge>
                      <Badge variant="outline" className="text-[10px] px-1 py-0 gap-0.5">
                        {item.direction === 'INBOUND'
                          ? <><PhoneIncoming className="h-2.5 w-2.5" /> In</>
                          : <><PhoneOutgoing className="h-2.5 w-2.5" /> Out</>
                        }
                      </Badge>
                      {item.callType && (
                        <Badge variant="outline" className="text-[10px] px-1 py-0">
                          {item.callType}
                        </Badge>
                      )}
                    </div>
                    <div className="flex items-center gap-1">
                      <p className="text-sm font-medium truncate">
                        {item.contactName || 'Unknown caller'}
                      </p>
                      {item.contactPhone && (
                        <span className="inline-flex items-center gap-0.5 text-[10px] text-muted-foreground flex-shrink-0">
                          <Phone className="h-2.5 w-2.5" />
                          {formatPhone(item.contactPhone)}
                        </span>
                      )}
                    </div>
                    {item.summary && (
                      <p className="text-[11px] text-muted-foreground line-clamp-1">
                        {item.summary}
                      </p>
                    )}
                    <p className="text-[10px] text-muted-foreground">
                      {formatDistanceToNow(new Date(item.createdAt), {
                        addSuffix: true,
                      })}
                    </p>
                    <div className="flex items-center gap-2 pt-0.5">
                      <a
                        href={callLogPath}
                        className="inline-flex items-center gap-0.5 text-[10px] text-primary hover:underline"
                      >
                        View Call <ArrowRight className="h-2 w-2" />
                      </a>
                      {item.campaignId && (
                        <a
                          href="/home/outbound"
                          className="inline-flex items-center gap-0.5 text-[10px] text-primary hover:underline"
                        >
                          Campaign <ArrowRight className="h-2 w-2" />
                        </a>
                      )}
                    </div>
                  </div>
                </div>
              </Card>
            );
          })}

          {actionItemCount > 3 && (
            <Button
              variant="ghost"
              size="sm"
              className="w-full"
              onClick={() => {
                window.location.href = '/home/action-items';
              }}
            >
              View all {actionItemCount} action items
            </Button>
          )}
        </div>
      )}

      {expanded && actionItems.length === 0 && (
        <div className="mt-2 px-2">
          <Card className="p-4 text-center">
            <p className="text-sm text-muted-foreground">
              No open action items
            </p>
          </Card>
        </div>
      )}
    </div>
  );
}
