import { use } from 'react';

import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from '@kit/ui/card';
import { Alert, AlertDescription } from '@kit/ui/alert';
import { Badge } from '@kit/ui/badge';

import { fetchBackendStatus, postToBackend } from '~/lib/server/backend-api';

interface TestApiServerProps {
  userId: string;
  userEmail: string;
}

export function TestApiServer({ userId, userEmail }: TestApiServerProps) {
  const results = use(runServerTests(userId, userEmail));

  return (
    <Card>
      <CardHeader>
        <CardTitle>Server-Side Tests</CardTitle>
        <CardDescription>
          These tests run on the Next.js server and call the NestJS backend
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        {/* Status Check Test */}
        <TestResult
          title="Backend Status Check"
          description="Tests basic connectivity (unauthenticated)"
          result={results.statusCheck}
        />

        {/* Echo Test */}
        <TestResult
          title="Echo Test"
          description="Tests POST request with JSON payload"
          result={results.echoTest}
        />

        {/* Database Test */}
        <TestResult
          title="Database Test (Authenticated)"
          description="Tests full stack: Auth + Backend + Database"
          result={results.dbTest}
        />
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
  statusCheck: TestResult;
  echoTest: TestResult;
  dbTest: TestResult;
};

async function runServerTests(
  userId: string,
  userEmail: string,
): Promise<TestResults> {
  const results: TestResults = {
    statusCheck: {
      success: false,
      message: 'Not run',
    },
    echoTest: {
      success: false,
      message: 'Not run',
    },
    dbTest: {
      success: false,
      message: 'Not run',
    },
  };

  // Test 1: Status Check
  try {
    const status = await fetchBackendStatus();
    results.statusCheck = {
      success: true,
      message: 'Backend is reachable',
      details: {
        message: status.message,
        database: status.database,
        timestamp: status.timestamp,
      },
    };
  } catch (error) {
    results.statusCheck = {
      success: false,
      message: 'Failed to reach backend',
      error: error instanceof Error ? error.message : String(error),
    };
  }

  // Test 2: Echo Test
  try {
    const echo = await postToBackend<{ message: string; timestamp: string }, unknown>(
      '/test/echo',
      {
        message: 'Hello from Next.js!',
        timestamp: new Date().toISOString(),
      },
    );
    results.echoTest = {
      success: true,
      message: 'Echo successful',
      details: echo,
    };
  } catch (error) {
    results.echoTest = {
      success: false,
      message: 'Echo failed',
      error: error instanceof Error ? error.message : String(error),
    };
  }

  // Test 3: Database Test (Authenticated)
  try {
    const dbTest = await postToBackend<Record<string, never>, unknown>(
      '/test/db',
      {},
    );
    results.dbTest = {
      success: true,
      message: 'Database connection successful',
      details: dbTest,
    };
  } catch (error) {
    results.dbTest = {
      success: false,
      message: 'Database test failed',
      error: error instanceof Error ? error.message : String(error),
    };
  }

  return results;
}

