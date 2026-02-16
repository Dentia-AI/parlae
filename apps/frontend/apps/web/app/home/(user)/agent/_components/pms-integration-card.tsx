'use client';

import { useEffect, useState } from 'react';
import { Card, CardContent } from '@kit/ui/card';
import { Button } from '@kit/ui/button';
import { Database, CheckCircle2, XCircle, Loader2, AlertCircle } from 'lucide-react';
import Link from 'next/link';

interface PmsIntegrationCardProps {
  accountId: string;
  initialStatus: string | null;
  initialProvider: string | null;
  initialPracticeName: string | null;
  hasIntegration: boolean;
}

export function PmsIntegrationCard({
  accountId,
  initialStatus,
  initialProvider,
  initialPracticeName,
  hasIntegration,
}: PmsIntegrationCardProps) {
  const [isChecking, setIsChecking] = useState(false);
  const [pmsName, setPmsName] = useState<string | null>(initialProvider);
  const [practiceName, setPracticeName] = useState<string | null>(initialPracticeName);
  const [status, setStatus] = useState<string | null>(initialStatus);
  const [isConnected, setIsConnected] = useState(
    hasIntegration && (initialStatus === 'ACTIVE' || initialStatus === 'active'),
  );

  // On mount, if we have an integration but no PMS name, call the connection-status API
  useEffect(() => {
    if (hasIntegration && !pmsName) {
      checkConnection();
    }
  }, []);

  const checkConnection = async () => {
    setIsChecking(true);
    try {
      const response = await fetch(
        `/api/pms/connection-status?accountId=${accountId}`,
      );
      if (response.ok) {
        const data = await response.json();
        setIsConnected(data.isConnected);
        setStatus(data.status);
        if (data.provider) {
          setPmsName(data.provider);
        }
        if (data.practiceName) {
          setPracticeName(data.practiceName);
        }
      }
    } catch (error) {
      console.error('Failed to check PMS connection:', error);
    } finally {
      setIsChecking(false);
    }
  };

  const connected = isConnected || (hasIntegration && status === 'ACTIVE');

  return (
    <Card>
      <CardContent className="pt-5">
        <div className="flex items-start justify-between">
          <div className="flex items-start gap-3">
            <div
              className={`rounded-lg p-2 ${connected ? 'bg-green-100 dark:bg-green-900/30' : hasIntegration ? 'bg-amber-100 dark:bg-amber-900/30' : 'bg-muted'}`}
            >
              <Database
                className={`h-5 w-5 ${connected ? 'text-green-600 dark:text-green-400' : hasIntegration ? 'text-amber-600 dark:text-amber-400' : 'text-muted-foreground'}`}
              />
            </div>
            <div>
              <h3 className="font-semibold text-sm">
                Practice Management System
              </h3>
              {isChecking ? (
                <div className="flex items-center gap-1.5 mt-1">
                  <Loader2 className="h-3.5 w-3.5 animate-spin text-muted-foreground" />
                  <span className="text-xs text-muted-foreground">
                    Checking connection...
                  </span>
                </div>
              ) : connected ? (
                <>
                  <div className="flex items-center gap-1.5 mt-1">
                    <CheckCircle2 className="h-3.5 w-3.5 text-green-600" />
                    <span className="text-xs text-green-700 dark:text-green-400 font-medium">
                      Connected
                    </span>
                  </div>
                  {pmsName && (
                    <p className="text-xs text-muted-foreground mt-0.5">
                      {pmsName}
                      {practiceName ? ` — ${practiceName}` : ''}
                    </p>
                  )}
                </>
              ) : hasIntegration ? (
                <div className="flex items-center gap-1.5 mt-1">
                  <AlertCircle className="h-3.5 w-3.5 text-amber-500" />
                  <span className="text-xs text-amber-600 dark:text-amber-400 font-medium">
                    {status === 'ERROR'
                      ? 'Connection Error'
                      : 'Setup Required'}
                  </span>
                </div>
              ) : (
                <div className="flex items-center gap-1.5 mt-1">
                  <XCircle className="h-3.5 w-3.5 text-muted-foreground" />
                  <span className="text-xs text-muted-foreground">
                    Not connected
                  </span>
                </div>
              )}
            </div>
          </div>
          <div className="flex items-center gap-2">
            {hasIntegration && !isChecking && (
              <Button
                variant="ghost"
                size="sm"
                onClick={checkConnection}
                className="text-xs h-8 px-2"
              >
                <Loader2
                  className={`h-3 w-3 mr-1 ${isChecking ? 'animate-spin' : ''}`}
                />
                Check
              </Button>
            )}
            <Link href="/home/agent/setup/integrations">
              <Button variant="outline" size="sm">
                {hasIntegration ? 'Manage' : 'Connect'}
              </Button>
            </Link>
          </div>
        </div>
      </CardContent>
    </Card>
  );
}
