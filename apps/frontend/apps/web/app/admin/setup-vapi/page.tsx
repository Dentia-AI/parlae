'use client';

import { useState } from 'react';
import { Button } from '@kit/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@kit/ui/card';
import { Alert, AlertDescription } from '@kit/ui/alert';
import { CheckCircle, XCircle, Loader2, Phone, ExternalLink } from 'lucide-react';
import { setupTestAgentAction } from './actions';

export default function SetupVapiPage() {
  const [loading, setLoading] = useState(false);
  const [result, setResult] = useState<any>(null);
  const [error, setError] = useState<string | null>(null);

  const setupTestAgent = async () => {
    setLoading(true);
    setError(null);
    setResult(null);

    try {
      const data = await setupTestAgentAction('415');

      if (data.success) {
        setResult(data);
      } else {
        setError(data.message || 'Setup failed');
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Unknown error');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="container mx-auto py-8 max-w-4xl">
      <div className="mb-8">
        <h1 className="text-3xl font-bold">Setup Vapi Test Squad</h1>
        <p className="text-muted-foreground mt-2">
          Create your first AI voice squad (multi-assistant workflow) with a Twilio phone number
        </p>
      </div>

      {!result && !error && (
        <Card>
          <CardHeader>
            <CardTitle>One-Click Setup</CardTitle>
            <CardDescription>
              This will create an AI voice squad (Receptionist + Booking) with a phone number
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <div>
              <p className="text-sm font-medium mb-2">What happens:</p>
              <ul className="list-disc ml-5 space-y-1 text-sm text-muted-foreground">
                <li>Create an AI squad with 2 assistants (Receptionist + Booking)</li>
                <li>Use your existing Twilio phone number (or purchase new if none exist)</li>
                <li>Link the phone number to the squad</li>
              </ul>
            </div>
            
            <Button 
              onClick={setupTestAgent}
              disabled={loading}
              size="lg"
              className="w-full"
            >
              {loading ? (
                <>
                  <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                  Setting up... This may take 30-60 seconds
                </>
              ) : (
                <>
                  <Phone className="mr-2 h-4 w-4" />
                  Setup Test Squad
                </>
              )}
            </Button>
          </CardContent>
        </Card>
      )}

      {error && (
        <Alert variant="destructive">
          <XCircle className="h-4 w-4" />
          <AlertDescription>
            <strong>Setup Failed:</strong> {error}
          </AlertDescription>
        </Alert>
      )}

      {result && (
        <div className="space-y-6">
          <Alert className="bg-green-50 dark:bg-green-950 border-green-200 dark:border-green-800">
            <CheckCircle className="h-4 w-4 text-green-600 dark:text-green-400" />
            <AlertDescription>
              <strong>Success!</strong> Your test squad is ready to use.
            </AlertDescription>
          </Alert>

          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <Phone className="h-5 w-5" />
                Your Phone Number
              </CardTitle>
            </CardHeader>
            <CardContent>
              <div className="text-3xl font-bold text-center py-4">
                {result.phoneNumber.number}
              </div>
              <div className="text-center text-muted-foreground text-sm">
                Twilio SID: {result.phoneNumber.sid}
              </div>
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle>Test Instructions</CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
              <div>
                <h3 className="font-semibold mb-2">1. Call the Number</h3>
                <p className="text-muted-foreground">
                  Use your mobile phone to call: <strong>{result.phoneNumber.number}</strong>
                </p>
              </div>

              <div>
                <h3 className="font-semibold mb-2">2. Test Script</h3>
                <ul className="list-disc ml-5 space-y-1 text-muted-foreground">
                  {result.instructions.testScript.map((instruction: string, i: number) => (
                    <li key={i}>{instruction}</li>
                  ))}
                </ul>
              </div>

              <div>
                <h3 className="font-semibold mb-2">3. Expected Behavior</h3>
                <ul className="list-disc ml-5 space-y-1 text-muted-foreground">
                  <li>Receptionist answers with greeting</li>
                  <li>When you mention "appointment", transfers to Booking Assistant</li>
                  <li>Booking Assistant collects your name, email, and preferences</li>
                  <li>Full conversation with both assistants is recorded</li>
                </ul>
              </div>

              <div>
                <h3 className="font-semibold mb-2">4. Check Logs</h3>
                <p className="text-muted-foreground mb-2">
                  Watch your terminal for webhook events from Vapi
                </p>
              </div>
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle>Vapi Dashboard Links</CardTitle>
            </CardHeader>
            <CardContent className="space-y-3">
              <a
                href={result.squad.vapiUrl}
                target="_blank"
                rel="noopener noreferrer"
                className="flex items-center gap-2 text-primary hover:underline"
              >
                <ExternalLink className="h-4 w-4" />
                View Squad: {result.squad.name}
              </a>

              <div className="border-t pt-3">
                <p className="text-sm font-medium mb-2">Assistants in Squad:</p>
                {result.assistants && result.assistants.map((assistant: any) => (
                  <a
                    key={assistant.id}
                    href={assistant.vapiUrl}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="flex items-center gap-2 text-primary hover:underline ml-4"
                  >
                    <ExternalLink className="h-4 w-4" />
                    {assistant.name}
                  </a>
                ))}
              </div>

              <div className="border-t pt-3">
                <a
                  href={result.phoneNumber.vapiPhoneUrl}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="flex items-center gap-2 text-primary hover:underline"
                >
                  <ExternalLink className="h-4 w-4" />
                  View Phone Number
                </a>
              </div>

              <a
                href="https://dashboard.vapi.ai/calls"
                target="_blank"
                rel="noopener noreferrer"
                className="flex items-center gap-2 text-primary hover:underline"
              >
                <ExternalLink className="h-4 w-4" />
                View Call History
              </a>
            </CardContent>
          </Card>

          <div className="bg-blue-50 dark:bg-blue-950 border border-blue-200 dark:border-blue-800 rounded-lg p-4">
            <h3 className="font-semibold mb-2">What's Next?</h3>
            <ul className="list-disc ml-5 space-y-1 text-sm text-muted-foreground">
              <li>Call the number and test the squad workflow</li>
              <li>Say "I want to book an appointment" to trigger transfer</li>
              <li>Check the Vapi dashboard for call recordings and squad flow</li>
              <li>View transcripts and extracted data</li>
              <li>Once verified, create production squads for your accounts</li>
            </ul>
          </div>
        </div>
      )}
    </div>
  );
}
