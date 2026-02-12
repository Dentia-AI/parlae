'use client';

import { useState, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { Button } from '@kit/ui/button';
import { Alert, AlertDescription } from '@kit/ui/alert';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@kit/ui/card';
import { CheckCircle2, AlertCircle, ExternalLink, Info } from 'lucide-react';
import { toast } from '@kit/ui/sonner';

interface PmsSetupWizardProps {
  accountId: string;
  accountEmail: string;
  onConnectionStatusChange?: (status: 'pending' | 'connected' | 'not_connected') => void;
}

export function PmsSetupWizard({ accountId, accountEmail, onConnectionStatusChange }: PmsSetupWizardProps) {
  const router = useRouter();
  const [hasConnected, setHasConnected] = useState(false);
  const [checkingConnection, setCheckingConnection] = useState(false);
  const [connectionStatus, setConnectionStatus] = useState<'pending' | 'connected' | 'not_connected'>('pending');
  
  // Notify parent of connection status changes
  useEffect(() => {
    onConnectionStatusChange?.(connectionStatus);
  }, [connectionStatus, onConnectionStatusChange]);

  // Check if PMS is already connected
  useEffect(() => {
    checkPmsConnection();
  }, []);

  const checkPmsConnection = async () => {
    setCheckingConnection(true);
    try {
      const response = await fetch(`/api/pms/connection-status?accountId=${accountId}`, {
        credentials: 'include',
      });
      const data = await response.json();
      
      if (data.isConnected) {
        setConnectionStatus('connected');
        setHasConnected(true);
      } else {
        setConnectionStatus('not_connected');
      }
    } catch (error) {
      setConnectionStatus('not_connected');
    } finally {
      setCheckingConnection(false);
    }
  };

  const handleConnectSikka = () => {
    // Create OAuth state (contains accountId for callback)
    const state = {
      accountId,
      timestamp: Date.now(),
      nonce: Math.random().toString(36).substring(2, 15),
    };
    const stateString = btoa(JSON.stringify(state));

    // Construct Sikka OAuth URL
    const sikkaAppId = process.env.NEXT_PUBLIC_SIKKA_APP_ID;
    const redirectUri = `${window.location.origin}/api/pms/sikka/oauth/callback`;
    const oauthUrl = `https://api.sikkasoft.com/portal/authapp.aspx?app_id=${sikkaAppId}&redirect_uri=${encodeURIComponent(redirectUri)}&state=${encodeURIComponent(stateString)}`;

    // Redirect to Sikka OAuth
    window.location.href = oauthUrl;
  };

  const handleCheckAgain = async () => {
    setCheckingConnection(true);
    try {
      const response = await fetch(`/api/pms/connection-status?accountId=${accountId}`, {
        credentials: 'include',
      });
      const data = await response.json();
      
      if (data.isConnected) {
        setConnectionStatus('connected');
        setHasConnected(true);
        toast.success(`Successfully connected to ${data.practiceName || 'your practice'}!`);
      } else if (data.status === 'failed') {
        setConnectionStatus('not_connected');
        toast.error(data.error || 'Connection not found. Please complete the authorization steps.');
      } else {
        setConnectionStatus('not_connected');
        toast.error('Connection not found. Please complete the authorization steps.');
      }
    } catch (error) {
      setConnectionStatus('not_connected');
      toast.error('Failed to check connection');
    } finally {
      setCheckingConnection(false);
    }
  };

  return (
    <div className="space-y-6">
      {/* Connection Status Banner */}
      {checkingConnection && (
        <Alert>
          <AlertCircle className="h-4 w-4 animate-pulse" />
          <AlertDescription>
            Checking for PMS connection...
          </AlertDescription>
        </Alert>
      )}

      {!checkingConnection && connectionStatus === 'connected' && (
        <Alert className="border-green-500 bg-green-50 dark:bg-green-950">
          <CheckCircle2 className="h-4 w-4 text-green-600" />
          <AlertDescription className="text-green-600">
            Your practice management system is connected and ready to use!
          </AlertDescription>
        </Alert>
      )}

      {!checkingConnection && connectionStatus === 'not_connected' && (
        <Alert>
          <AlertCircle className="h-4 w-4" />
          <AlertDescription>
            No PMS connection detected. Follow the steps below to connect.
          </AlertDescription>
        </Alert>
      )}

      {/* Setup Instructions */}
      <Card>
        <CardHeader>
          <CardTitle>Connect Your Practice Management System</CardTitle>
          <CardDescription>
            Follow these simple steps to enable automated appointment booking and patient management
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-6">
          {/* Step 1 */}
          <div className="flex gap-4">
            <div className="flex-shrink-0 w-8 h-8 rounded-full bg-primary text-primary-foreground flex items-center justify-center font-semibold">
              1
            </div>
            <div className="flex-1 space-y-3">
              <h3 className="font-semibold">Install Sikka SPU</h3>
              <p className="text-sm text-muted-foreground">
                Download and install the Sikka Practice Utility (SPU) on your practice server. You should have received installation instructions via email.
              </p>
              <Alert className="border-blue-500 bg-blue-50 dark:bg-blue-950/30 dark:border-blue-800">
                <Info className="h-4 w-4 text-blue-600 dark:text-blue-400" />
                <AlertDescription className="text-xs text-blue-800 dark:text-blue-300">
                  <strong>Important:</strong> The SPU connects your existing PMS (Dentrix, Eaglesoft, Open Dental, etc.) to Sikka's cloud platform. Make sure it's running and connected to your PMS before proceeding.
                </AlertDescription>
              </Alert>
              <Button 
                variant="outline" 
                size="sm"
                onClick={() => window.open('https://support.sikkasoft.com/spu-installation', '_blank')}
              >
                <ExternalLink className="w-4 h-4 mr-2" />
                View Installation Guide
              </Button>
            </div>
          </div>

          {/* Step 2 */}
          <div className="flex gap-4">
            <div className="flex-shrink-0 w-8 h-8 rounded-full bg-primary text-primary-foreground flex items-center justify-center font-semibold">
              2
            </div>
            <div className="flex-1 space-y-3">
              <h3 className="font-semibold">Authorize Parlae via Sikka</h3>
              <p className="text-sm text-muted-foreground">
                Click the button below to authorize Parlae to access your practice data through Sikka's secure OAuth portal.
              </p>
              <Button onClick={handleConnectSikka} disabled={connectionStatus === 'connected'}>
                Authorize via Sikka
              </Button>
              <Alert>
                <Info className="h-4 w-4" />
                <AlertDescription className="text-xs">
                  You'll be redirected to Sikka's authorization page where you'll see your practice name and PMS type. Click "Allow" to grant access.
                </AlertDescription>
              </Alert>
            </div>
          </div>

          {/* Step 3 */}
          <div className="flex gap-4">
            <div className="flex-shrink-0 w-8 h-8 rounded-full bg-primary text-primary-foreground flex items-center justify-center font-semibold">
              3
            </div>
            <div className="flex-1 space-y-3">
              <h3 className="font-semibold">Verify Connection</h3>
              <p className="text-sm text-muted-foreground">
                After completing the authorization, click "Check Connection" to verify everything is working properly.
              </p>
              <Button 
                onClick={handleCheckAgain} 
                variant="outline"
                disabled={checkingConnection}
              >
                {checkingConnection ? 'Checking...' : 'Check Connection'}
              </Button>
            </div>
          </div>

          {/* Features Info */}
          <div className="mt-6 pt-6 border-t">
            <h3 className="font-semibold mb-3">What You'll Get</h3>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
              <div className="flex items-center gap-2">
                <CheckCircle2 className="w-4 h-4 text-green-600" />
                <span className="text-sm">Automated appointment booking</span>
              </div>
              <div className="flex items-center gap-2">
                <CheckCircle2 className="w-4 h-4 text-green-600" />
                <span className="text-sm">Patient lookup & management</span>
              </div>
              <div className="flex items-center gap-2">
                <CheckCircle2 className="w-4 h-4 text-green-600" />
                <span className="text-sm">Insurance verification</span>
              </div>
              <div className="flex items-center gap-2">
                <CheckCircle2 className="w-4 h-4 text-green-600" />
                <span className="text-sm">Payment processing</span>
              </div>
              <div className="flex items-center gap-2">
                <CheckCircle2 className="w-4 h-4 text-green-600" />
                <span className="text-sm">Appointment reminders</span>
              </div>
              <div className="flex items-center gap-2">
                <CheckCircle2 className="w-4 h-4 text-green-600" />
                <span className="text-sm">Patient notes & records</span>
              </div>
            </div>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
