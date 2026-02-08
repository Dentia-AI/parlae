/**
 * This file is used to register monitoring instrumentation
 * for your Next.js application.
 */
import { type Instrumentation } from 'next';

export async function register() {
  // Log build version on startup
  try {
    const version = '18';
    const gitCommit = process.env.GIT_COMMIT_SHA || process.env.VERCEL_GIT_COMMIT_SHA || 'unknown';
    const buildTimestamp = process.env.BUILD_TIMESTAMP || 'unknown';
    
    const buildId =
      process.env.NEXT_BUILD_ID ??
      process.env.VERCEL_GIT_COMMIT_SHA ??
      process.env.VERCEL_DEPLOYMENT_ID ??
      'unknown';

    const startupInfo = {
      version,
      gitCommit: gitCommit.substring(0, 8),
      buildTimestamp,
      buildId,
      timestamp: new Date().toISOString(),
      nodeEnv: process.env.NODE_ENV,
      nextAuthUrl: process.env.NEXTAUTH_URL,
      cognitoIssuer: process.env.COGNITO_ISSUER?.substring(0, 50) + '...',
      cognitoDomain: process.env.COGNITO_DOMAIN || 'NOT_SET',
    };
    
    console.log(JSON.stringify({
      message: '🚀 Frontend Application Started',
      version: startupInfo.version,
      gitCommit: startupInfo.gitCommit,
      buildTimestamp: startupInfo.buildTimestamp,
      buildId: startupInfo.buildId,
      startedAt: startupInfo.timestamp,
      environment: startupInfo.nodeEnv,
      authUrl: startupInfo.nextAuthUrl,
      cognitoIssuer: startupInfo.cognitoIssuer,
      cognitoDomain: startupInfo.cognitoDomain,
    }));
  } catch (error) {
    console.error(JSON.stringify({
      message: 'Failed to log build info',
      error: error instanceof Error ? error.message : error,
    }));
  }

  const { registerMonitoringInstrumentation } = await import(
    '@kit/monitoring/instrumentation'
  );

  // Register monitoring instrumentation
  // based on the MONITORING_PROVIDER environment variable.
  await registerMonitoringInstrumentation();
}

/**
 * @name onRequestError
 * @description This function is called when an error occurs during the request lifecycle.
 * It is used to capture the error and send it to the monitoring service.
 */
export const onRequestError: Instrumentation.onRequestError = async (
  err,
  request,
  context,
) => {
  console.error(
    JSON.stringify({
      message: '[Instrumentation][RequestError]',
      error: err instanceof Error ? err.message : err,
      stack: err instanceof Error ? err.stack : undefined,
      url: request.url,
      method: request.method,
      routePath: context.routePath,
      timestamp: new Date().toISOString(),
    }),
  );

  const { getServerMonitoringService } = await import('@kit/monitoring/server');

  const service = await getServerMonitoringService();

  await service.ready();

  await service.captureException(
    err as Error,
    {},
    {
      path: request.path,
      headers: request.headers,
      method: request.method,
      routePath: context.routePath,
    },
  );
};
