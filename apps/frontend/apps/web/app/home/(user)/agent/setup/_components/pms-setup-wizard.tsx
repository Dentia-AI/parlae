'use client';

import { useState, useEffect, useCallback, useRef } from 'react';
import { Button } from '@kit/ui/button';
import { Alert, AlertDescription } from '@kit/ui/alert';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@kit/ui/card';
import {
  CheckCircle2,
  AlertCircle,
  Download,
  Info,
  Loader2,
  Monitor,
  Copy,
  Check,
} from 'lucide-react';
import { toast } from '@kit/ui/sonner';

const SPU_DOWNLOAD_URL =
  'https://sscsetups.s3.amazonaws.com/SikkaUtilityInstaller-Parlae.exe';

const POLL_INTERVAL_MS = 5_000;
const MAX_POLL_DURATION_MS = 10 * 60 * 1000; // 10 minutes

interface PmsSetupWizardProps {
  accountId: string;
  accountEmail: string;
  onConnectionStatusChange?: (
    status: 'pending' | 'connected' | 'not_connected',
  ) => void;
}

export function PmsSetupWizard({
  accountId,
  accountEmail,
  onConnectionStatusChange,
}: PmsSetupWizardProps) {
  const [connectionStatus, setConnectionStatus] = useState<
    'pending' | 'connected' | 'not_connected'
  >('pending');
  const [checkingConnection, setCheckingConnection] = useState(false);
  const [isPolling, setIsPolling] = useState(false);
  const [hasDownloaded, setHasDownloaded] = useState(false);
  const [copied, setCopied] = useState(false);
  const [practiceName, setPracticeName] = useState<string | null>(null);
  const [pmsType, setPmsType] = useState<string | null>(null);
  const pollingRef = useRef(false);
  const pollStartRef = useRef<number>(0);

  useEffect(() => {
    onConnectionStatusChange?.(connectionStatus);
  }, [connectionStatus, onConnectionStatusChange]);

  useEffect(() => {
    checkPmsConnection();
  }, []);

  // Clean up polling on unmount
  useEffect(() => {
    return () => {
      pollingRef.current = false;
    };
  }, []);

  const checkPmsConnection = useCallback(async () => {
    setCheckingConnection(true);
    try {
      const response = await fetch(
        `/api/pms/connection-status?accountId=${accountId}`,
        { credentials: 'include' },
      );
      const data = await response.json();

      if (data.isConnected) {
        setConnectionStatus('connected');
        if (data.practiceName) setPracticeName(data.practiceName);
        if (data.pmsType) setPmsType(data.pmsType);
      } else {
        setConnectionStatus('not_connected');
      }
    } catch {
      setConnectionStatus('not_connected');
    } finally {
      setCheckingConnection(false);
    }
  }, [accountId]);

  const startPolling = useCallback(() => {
    if (pollingRef.current) return;
    pollingRef.current = true;
    pollStartRef.current = Date.now();
    setIsPolling(true);

    const poll = async () => {
      if (!pollingRef.current) return;

      if (Date.now() - pollStartRef.current > MAX_POLL_DURATION_MS) {
        pollingRef.current = false;
        setIsPolling(false);
        toast.info(
          'Auto-check timed out. Click "Check Connection" to try manually.',
        );
        return;
      }

      try {
        const response = await fetch(
          `/api/pms/connection-status?accountId=${accountId}`,
          { credentials: 'include' },
        );
        const data = await response.json();

        if (data.isConnected) {
          pollingRef.current = false;
          setIsPolling(false);
          setConnectionStatus('connected');
          if (data.practiceName) setPracticeName(data.practiceName);
          if (data.pmsType) setPmsType(data.pmsType);
          toast.success(
            `Connected to ${data.practiceName || 'your practice'}!`,
          );
          return;
        }
      } catch {
        // Network error — keep polling
      }

      if (pollingRef.current) {
        setTimeout(poll, POLL_INTERVAL_MS);
      }
    };

    poll();
  }, [accountId]);

  const stopPolling = useCallback(() => {
    pollingRef.current = false;
    setIsPolling(false);
  }, []);

  const handleDownload = () => {
    setHasDownloaded(true);
    window.open(SPU_DOWNLOAD_URL, '_blank');
    // Start auto-polling after download
    setTimeout(() => startPolling(), 2000);
  };

  const handleCopyLink = async () => {
    try {
      await navigator.clipboard.writeText(SPU_DOWNLOAD_URL);
      setCopied(true);
      toast.success('Download link copied to clipboard');
      setTimeout(() => setCopied(false), 3000);
    } catch {
      toast.error('Failed to copy link');
    }
  };

  const handleCheckManually = async () => {
    setCheckingConnection(true);
    try {
      const response = await fetch(
        `/api/pms/connection-status?accountId=${accountId}`,
        { credentials: 'include' },
      );
      const data = await response.json();

      if (data.isConnected) {
        setConnectionStatus('connected');
        if (data.practiceName) setPracticeName(data.practiceName);
        if (data.pmsType) setPmsType(data.pmsType);
        stopPolling();
        toast.success(
          `Connected to ${data.practiceName || 'your practice'}!`,
        );
      } else if (data.status === 'failed' || data.status === 'error') {
        setConnectionStatus('not_connected');
        toast.error(
          data.error || 'Connection not ready yet. Please complete the installer steps.',
        );
      } else {
        setConnectionStatus('not_connected');
        toast.info(
          'Connection not detected yet. Make sure the installer has completed.',
        );
      }
    } catch {
      setConnectionStatus('not_connected');
      toast.error('Failed to check connection');
    } finally {
      setCheckingConnection(false);
    }
  };

  return (
    <div className="space-y-6">
      {/* Connection Status Banner */}
      {checkingConnection && !isPolling && (
        <Alert>
          <AlertCircle className="h-4 w-4 animate-pulse" />
          <AlertDescription>Checking for PMS connection...</AlertDescription>
        </Alert>
      )}

      {!checkingConnection && connectionStatus === 'connected' && (
        <Alert className="border-green-500 bg-green-50 dark:bg-green-950">
          <CheckCircle2 className="h-4 w-4 text-green-600" />
          <AlertDescription className="text-green-600">
            Your practice management system is connected and ready to use!
            {practiceName && (
              <span className="font-medium"> ({practiceName})</span>
            )}
          </AlertDescription>
        </Alert>
      )}

      {!checkingConnection && connectionStatus === 'not_connected' && !isPolling && (
        <Alert>
          <AlertCircle className="h-4 w-4" />
          <AlertDescription>
            No PMS connection detected. Follow the steps below to connect.
          </AlertDescription>
        </Alert>
      )}

      {isPolling && (
        <Alert className="border-blue-500 bg-blue-50 dark:bg-blue-950/30">
          <Loader2 className="h-4 w-4 animate-spin text-blue-600" />
          <AlertDescription className="text-blue-700 dark:text-blue-300">
            Waiting for registration to complete... This will update
            automatically once the installer finishes.
          </AlertDescription>
        </Alert>
      )}

      {/* Setup Instructions */}
      <Card>
        <CardHeader>
          <CardTitle>Connect Your Practice Management System</CardTitle>
          <CardDescription>
            Install the Parlae connector on your practice server to enable
            automated appointment booking and patient management
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-6">
          {/* Step 1: Download & Install */}
          <div className="flex gap-4">
            <div
              className={`flex-shrink-0 w-8 h-8 rounded-full flex items-center justify-center font-semibold ${
                hasDownloaded
                  ? 'bg-green-600 text-white'
                  : 'bg-primary text-primary-foreground'
              }`}
            >
              {hasDownloaded ? (
                <CheckCircle2 className="h-4 w-4" />
              ) : (
                '1'
              )}
            </div>
            <div className="flex-1 space-y-3">
              <h3 className="font-semibold">
                Download &amp; Install PMS Connector
              </h3>
              <p className="text-sm text-muted-foreground">
                Download the Parlae Practice Utility installer. This connects
                your existing PMS (Dentrix, Eaglesoft, Open Dental, etc.) to our
                platform and registers your practice automatically.
              </p>

              <Alert className="border-amber-500 bg-amber-50 dark:bg-amber-950/30 dark:border-amber-800">
                <Monitor className="h-4 w-4 text-amber-600 dark:text-amber-400" />
                <AlertDescription className="text-xs text-amber-800 dark:text-amber-300">
                  <strong>Important:</strong> The installer must be run on the
                  computer or server where your practice management software is
                  installed. If you are not on that machine right now, copy the
                  download link below and open it on your practice server.
                </AlertDescription>
              </Alert>

              <div className="flex flex-wrap gap-2">
                <Button
                  onClick={handleDownload}
                  disabled={connectionStatus === 'connected'}
                  size="sm"
                >
                  <Download className="w-4 h-4 mr-2" />
                  Download Installer
                </Button>
                <Button
                  variant="outline"
                  size="sm"
                  onClick={handleCopyLink}
                >
                  {copied ? (
                    <Check className="w-4 h-4 mr-2 text-green-600" />
                  ) : (
                    <Copy className="w-4 h-4 mr-2" />
                  )}
                  {copied ? 'Copied!' : 'Copy Download Link'}
                </Button>
              </div>

              <Alert>
                <Info className="h-4 w-4" />
                <AlertDescription className="text-xs">
                  The installer will guide you through connecting to your PMS.
                  Once complete, your practice will be automatically linked to
                  your Parlae account ({accountEmail}).
                </AlertDescription>
              </Alert>
            </div>
          </div>

          {/* Step 2: Verify Connection */}
          <div className="flex gap-4">
            <div
              className={`flex-shrink-0 w-8 h-8 rounded-full flex items-center justify-center font-semibold ${
                connectionStatus === 'connected'
                  ? 'bg-green-600 text-white'
                  : 'bg-primary text-primary-foreground'
              }`}
            >
              {connectionStatus === 'connected' ? (
                <CheckCircle2 className="h-4 w-4" />
              ) : (
                '2'
              )}
            </div>
            <div className="flex-1 space-y-3">
              <h3 className="font-semibold">Verify Connection</h3>
              {connectionStatus === 'connected' ? (
                <div className="space-y-2">
                  <p className="text-sm text-green-700 dark:text-green-400 font-medium">
                    Connection verified!
                    {practiceName && ` — ${practiceName}`}
                    {pmsType && pmsType !== 'Unknown' && ` (${pmsType})`}
                  </p>
                </div>
              ) : (
                <>
                  <p className="text-sm text-muted-foreground">
                    {isPolling
                      ? 'We are automatically checking for your connection. This page will update once the installer completes.'
                      : 'After completing the installer, click below to verify the connection — or it will be detected automatically.'}
                  </p>
                  <div className="flex gap-2">
                    <Button
                      onClick={handleCheckManually}
                      variant="outline"
                      disabled={checkingConnection}
                      size="sm"
                    >
                      {checkingConnection ? (
                        <>
                          <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                          Checking...
                        </>
                      ) : (
                        'Check Connection'
                      )}
                    </Button>
                    {!isPolling && hasDownloaded && (
                      <Button
                        onClick={startPolling}
                        variant="ghost"
                        size="sm"
                      >
                        <Loader2 className="w-4 h-4 mr-2" />
                        Start Auto-Check
                      </Button>
                    )}
                    {isPolling && (
                      <Button
                        onClick={stopPolling}
                        variant="ghost"
                        size="sm"
                      >
                        Stop Auto-Check
                      </Button>
                    )}
                  </div>
                </>
              )}
            </div>
          </div>

          {/* Features Info */}
          <div className="mt-6 pt-6 border-t">
            <h3 className="font-semibold mb-3">What You&apos;ll Get</h3>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
              {[
                'Automated appointment booking',
                'Patient lookup & management',
                'Insurance verification',
                'Payment processing',
                'Appointment reminders',
                'Patient notes & records',
              ].map((feature) => (
                <div key={feature} className="flex items-center gap-2">
                  <CheckCircle2 className="w-4 h-4 text-green-600" />
                  <span className="text-sm">{feature}</span>
                </div>
              ))}
            </div>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
