'use client';

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { Card, CardContent, CardHeader, CardTitle } from '@kit/ui/card';
import { Button } from '@kit/ui/button';
import { Badge } from '@kit/ui/badge';
import { Phone, Clock, ArrowRight } from 'lucide-react';

interface Call {
  id: string;
  contactName: string | null;
  phoneNumber: string;
  outcome: string;
  status: string;
  callType: string;
  duration: number | null;
  callStartedAt: string;
  appointmentSet: boolean;
  insuranceVerified: boolean;
  paymentPlanDiscussed: boolean;
  transferredToStaff: boolean;
  summary: string | null;
}

const outcomeLabels: Record<string, string> = {
  BOOKED: 'Booked',
  TRANSFERRED: 'Transferred',
  INSURANCE_INQUIRY: 'Insurance',
  PAYMENT_PLAN: 'Payment',
  INFORMATION: 'Info',
  VOICEMAIL: 'Voicemail',
  OTHER: 'Other',
};

const outcomeColors: Record<string, string> = {
  BOOKED: 'bg-green-100 text-green-800 dark:bg-green-900 dark:text-green-200',
  TRANSFERRED: 'bg-blue-100 text-blue-800 dark:bg-blue-900 dark:text-blue-200',
  INSURANCE_INQUIRY: 'bg-purple-100 text-purple-800 dark:bg-purple-900 dark:text-purple-200',
  PAYMENT_PLAN: 'bg-amber-100 text-amber-800 dark:bg-amber-900 dark:text-amber-200',
  OTHER: 'bg-gray-100 text-gray-800 dark:bg-gray-800 dark:text-gray-200',
};

export function RecentCallsList() {
  const router = useRouter();
  const [calls, setCalls] = useState<Call[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    fetchRecentCalls();
  }, []);

  const fetchRecentCalls = async () => {
    setLoading(true);
    try {
      const response = await fetch('/api/analytics/calls/recent?limit=5');
      if (response.ok) {
        const data = await response.json();
        setCalls(data.calls);
      }
    } catch (error) {
      console.error('Error fetching recent calls:', error);
    } finally {
      setLoading(false);
    }
  };

  const formatDuration = (seconds: number | null) => {
    if (!seconds) return '--';
    const mins = Math.floor(seconds / 60);
    const secs = seconds % 60;
    return `${mins}:${secs.toString().padStart(2, '0')}`;
  };

  const formatTime = (dateStr: string) => {
    const date = new Date(dateStr);
    const now = new Date();
    const diffMs = now.getTime() - date.getTime();
    const diffMins = Math.floor(diffMs / 60000);

    if (diffMins < 60) return `${diffMins} min ago`;
    if (diffMins < 1440) return `${Math.floor(diffMins / 60)} hr ago`;
    return date.toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
  };

  if (loading) {
    return (
      <Card>
        <CardHeader>
          <CardTitle className="text-base">Recent Calls</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="text-center py-8 text-muted-foreground">
            Loading calls...
          </div>
        </CardContent>
      </Card>
    );
  }

  return (
    <Card className="h-full flex flex-col">
      <CardHeader className="pb-2">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <Phone className="h-4 w-4 text-muted-foreground" />
            <CardTitle className="text-base">Recent Calls</CardTitle>
          </div>
          <Button variant="ghost" size="sm" className="gap-1 text-xs h-7" onClick={() => router.push('/home/call-logs')}>
            View All
            <ArrowRight className="h-3 w-3" />
          </Button>
        </div>
      </CardHeader>
      <CardContent className="p-0 flex-1 overflow-hidden">
        {calls.length === 0 ? (
          <div className="text-center py-8 text-muted-foreground px-6">
            <Phone className="h-10 w-10 mx-auto mb-2 opacity-50" />
            <p className="text-sm">No calls yet. Your AI agent is ready to answer!</p>
          </div>
        ) : (
          <div className="divide-y overflow-y-auto h-full max-h-[320px]">
            {calls.map((call) => (
              <div
                key={call.id}
                onClick={() => router.push(`/home/call-logs/${call.id}`)}
                className="flex items-center gap-2.5 px-4 py-2.5 hover:bg-accent transition-colors cursor-pointer"
              >
                <div className="flex-shrink-0">
                  <div className="w-8 h-8 rounded-full bg-primary/10 flex items-center justify-center">
                    <Phone className="h-3.5 w-3.5 text-primary" />
                  </div>
                </div>

                <div className="flex-1 min-w-0">
                  <div className="flex items-center justify-between gap-1">
                    <p className="font-medium text-sm truncate">
                      {call.contactName || 'Unknown Caller'}
                    </p>
                    <span className="text-[10px] text-muted-foreground whitespace-nowrap flex-shrink-0">
                      {formatTime(call.callStartedAt)}
                    </span>
                  </div>

                  <div className="flex items-center gap-1.5 mt-0.5">
                    <Badge
                      variant="secondary"
                      className={`text-[10px] px-1.5 py-0 ${outcomeColors[call.outcome] || outcomeColors.OTHER}`}
                    >
                      {outcomeLabels[call.outcome] || call.outcome}
                    </Badge>

                    {call.duration && (
                      <span className="flex items-center gap-0.5 text-[10px] text-muted-foreground">
                        <Clock className="h-2.5 w-2.5" />
                        {formatDuration(call.duration)}
                      </span>
                    )}
                  </div>
                </div>
              </div>
            ))}
          </div>
        )}
      </CardContent>
    </Card>
  );
}
