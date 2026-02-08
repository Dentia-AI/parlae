'use client';

import { useState, useTransition } from 'react';

import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from '@kit/ui/card';
import { Button } from '@kit/ui/button';
import { Alert, AlertDescription } from '@kit/ui/alert';
import { Badge } from '@kit/ui/badge';

export function TestApiClient() {
  const [results, setResults] = useState<TestResults | null>(null);
  const [pending, startTransition] = useTransition();

  const runTests = () => {
    startTransition(async () => {
      const newResults: TestResults = {
        frontendToBackend: {
          success: false,
          message: 'Not run',
        },
        frontendApiRoute: {
          success: false,
          message: 'Not run',
        },
      };

      // Test 1: Frontend directly calling backend (via API route proxy)
      try {
        const response = await fetch('/api/test/backend-status');
        const data = await response.json();
        
        if (response.ok) {
          newResults.frontendToBackend = {
            success: true,
            message: 'Successfully called backend via API route',
            details: data,
          };
        } else {
          throw new Error(data.error || 'Request failed');
        }
      } catch (error) {
        newResults.frontendToBackend = {
          success: false,
          message: 'Failed to call backend',
          error: error instanceof Error ? error.message : String(error),
        };
      }

      // Test 2: Frontend API route test
      try {
        const response = await fetch('/api/test/echo', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            message: 'Hello from browser!',
            timestamp: new Date().toISOString(),
          }),
        });
        const data = await response.json();
        
        if (response.ok) {
          newResults.frontendApiRoute = {
            success: true,
            message: 'Frontend API route working',
            details: data,
          };
        } else {
          throw new Error(data.error || 'Request failed');
        }
      } catch (error) {
        newResults.frontendApiRoute = {
          success: false,
          message: 'API route failed',
          error: error instanceof Error ? error.message : String(error),
        };
      }

      setResults(newResults);
    });
  };

  return (
    <Card>
      <CardHeader>
        <CardTitle>Client-Side Tests</CardTitle>
        <CardDescription>
          These tests run in your browser and test frontend API routes
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        <Button onClick={runTests} disabled={pending}>
          {pending ? 'Running Tests...' : 'Run Client Tests'}
        </Button>

        {results && (
          <div className="space-y-4">
            <TestResult
              title="Frontend → Backend (via API Route)"
              description="Tests browser calling Next.js API route that calls NestJS backend"
              result={results.frontendToBackend}
            />

            <TestResult
              title="Frontend API Route"
              description="Tests Next.js API route directly"
              result={results.frontendApiRoute}
            />
          </div>
        )}
      </CardContent>
    </Card>
  );
}

function TestResult({
  title,
  description,
  result,
}: {
  title: string;
  description: string;
  result: TestResult;
}) {
  return (
    <div className="border-b pb-4 last:border-0">
      <div className="mb-2 flex items-center justify-between">
        <div>
          <h4 className="font-medium">{title}</h4>
          <p className="text-muted-foreground text-sm">{description}</p>
        </div>
        <Badge variant={result.success ? 'default' : 'destructive'}>
          {result.success ? 'PASS' : 'FAIL'}
        </Badge>
      </div>
      
      {result.success ? (
        <Alert>
          <AlertDescription>
            <div className="space-y-1 text-sm">
              <div>✅ {result.message}</div>
              {result.details && (
                <pre className="mt-2 overflow-x-auto rounded bg-muted p-2 text-xs">
                  {JSON.stringify(result.details, null, 2)}
                </pre>
              )}
            </div>
          </AlertDescription>
        </Alert>
      ) : (
        <Alert variant="destructive">
          <AlertDescription>
            <div className="text-sm">
              <div>❌ {result.message}</div>
              {result.error && (
                <pre className="mt-2 overflow-x-auto rounded bg-destructive/10 p-2 text-xs">
                  {result.error}
                </pre>
              )}
            </div>
          </AlertDescription>
        </Alert>
      )}
    </div>
  );
}

type TestResult = {
  success: boolean;
  message: string;
  details?: unknown;
  error?: string;
};

type TestResults = {
  frontendToBackend: TestResult;
  frontendApiRoute: TestResult;
};

