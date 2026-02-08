# Central Logging Implementation Guide

This document describes the comprehensive logging infrastructure implemented across the frontend and backend applications.

## Overview

We've implemented centralized error logging and monitoring across both the **Frontend (Next.js)** and **Backend (NestJS)** applications to ensure all errors are captured and logged to CloudWatch for debugging and monitoring.

## Frontend Logging

### 1. API Route Logging (Server-Side)

All API routes now use the centralized logger from `@kit/shared/logger` with comprehensive error logging.

#### Example: Sign-Up API Route

Location: `apps/frontend/apps/web/app/api/auth/sign-up/route.ts`

**Features:**
- Logs schema validation failures with sanitized request bodies
- Logs missing environment variables
- Logs Cognito API errors with full error details
- Logs successful user registrations
- Automatically redacts sensitive fields (passwords, tokens, etc.)

**Log Levels:**
- `logger.info(context, message)` - Successful operations
- `logger.error(context, message)` - All error scenarios with context
- `logger.warn(context, message)` - Warnings (can be added as needed)
- `logger.debug(context, message)` - Debug information (can be added as needed)

**Important:** Pino expects the context object first, then the message:
```typescript
// ✅ Correct
logger.error({ userId, error: 'details' }, 'Operation failed');

// ❌ Wrong
logger.error('Operation failed', { userId, error: 'details' });
```

### 2. Client-Side Error Handler

Location: `apps/frontend/apps/web/lib/api-error-handler.ts`

**ApiErrorHandler Class:**
```typescript
// Handle and log API errors
await ApiErrorHandler.handleError(error, {
  endpoint: '/api/auth/sign-up',
  method: 'POST',
  body: requestData,
});

// Optional: Log successful API calls (dev only)
await ApiErrorHandler.logSuccess({
  endpoint: '/api/auth/sign-up',
  method: 'POST',
  status: 201,
  duration: 150,
});
```

**Features:**
- Automatically sanitizes sensitive data (passwords, tokens, etc.)
- Logs HTTP response errors with status codes and response bodies
- Logs JavaScript errors with stack traces
- Provides structured error context for debugging
- Only logs successful calls in development mode

**Utility Function:**
```typescript
// Use fetchWithLogging for automatic error logging
const response = await fetchWithLogging('/api/users', {
  method: 'POST',
  body: JSON.stringify(data),
});
```

### 3. Client Component Error Logging

Forms and client components should use the `ApiErrorHandler` when making API calls.

#### Example: Sign-Up Form

Location: `apps/frontend/apps/web/app/auth/sign-up/_components/sign-up-form.client.tsx`

```typescript
try {
  const response = await fetch('/api/auth/sign-up', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(values),
  });

  const payload = await response.json();

  if (!response.ok) {
    // Log the error with comprehensive details
    await ApiErrorHandler.handleError(response.clone(), {
      endpoint: '/api/auth/sign-up',
      method: 'POST',
      body: values,
    });
    
    // Handle the error in the UI...
  }
} catch (error) {
  // Log the exception
  await ApiErrorHandler.handleError(error, {
    endpoint: '/api/auth/sign-up',
    method: 'POST',
    body: values,
  });
}
```

### 4. Existing Error Boundaries

The application already has error boundaries that capture React errors:

- `apps/frontend/apps/web/app/error.tsx` - Page-level error boundary
- `apps/frontend/apps/web/app/global-error.tsx` - Global error boundary
- `apps/frontend/apps/web/instrumentation.ts` - Next.js instrumentation with `onRequestError`

These automatically capture and send errors to the monitoring service (Sentry or Console).

## Backend Logging (NestJS)

### 1. Global HTTP Exception Filter

Location: `apps/backend/src/common/filters/http-exception.filter.ts`

**Features:**
- Catches all HTTP exceptions globally
- Logs 5xx errors as `error` level with full stack traces
- Logs 4xx errors as `warn` level
- Automatically sanitizes request bodies (passwords, tokens, etc.)
- Includes comprehensive context:
  - HTTP method and URL
  - Status code
  - Request body, query params, and route params
  - IP address and user agent
  - Timestamp

**Automatic Registration:**
The filter is registered globally in `app.module.ts` and will catch all unhandled exceptions.

### 2. Logging Interceptor

Location: `apps/backend/src/common/interceptors/logging.interceptor.ts`

**Features:**
- Logs all successful HTTP requests
- Logs request duration
- Logs errors that occur during request processing
- Provides structured logging for all API calls

**Log Format:**
```
[HTTP] [GET] /api/users 200 - 45ms
```

### 3. Registration in AppModule

Location: `apps/backend/src/app.module.ts`

Both the global exception filter and logging interceptor are registered as global providers:

```typescript
@Module({
  providers: [
    {
      provide: APP_FILTER,
      useClass: GlobalHttpExceptionFilter,
    },
    {
      provide: APP_INTERCEPTOR,
      useClass: LoggingInterceptor,
    },
  ],
})
export class AppModule {}
```

### 4. Using the Logger in Services

Controllers and services can inject and use NestJS's built-in Logger:

```typescript
import { Logger } from '@nestjs/common';

@Injectable()
export class MyService {
  private readonly logger = new Logger(MyService.name);

  async doSomething() {
    this.logger.log('Starting operation...');
    
    try {
      // ... operation
      this.logger.log('Operation completed successfully');
    } catch (error) {
      this.logger.error('Operation failed', error.stack);
      throw error;
    }
  }
}
```

## Log Viewing in AWS CloudWatch

### Frontend Logs

1. Navigate to AWS CloudWatch
2. Go to Log Groups
3. Find the log group for your ECS service: `/ecs/dentia-frontend`
4. Search for logs using filters:
   - `[Auth][SignUpAPI]` - Sign-up related logs
   - `[API]` - Client-side API call logs
   - `levelLabel: ERROR` - All error logs
   - `level: 50` - All error logs (numeric level)

**Log Format:** With the updated configuration, error logs will now include:
```json
{
  "level": 50,
  "levelLabel": "ERROR",
  "time": 1762276314474,
  "env": "production",
  "email": "user@example.com",
  "cognitoErrorType": "InvalidPasswordException",
  "cognitoErrorMessage": "Password does not conform to policy",
  "msg": "[Auth][SignUpAPI] Cognito signup failed"
}
```

### Backend Logs

1. Navigate to AWS CloudWatch
2. Go to Log Groups
3. Find the log group for your backend service: `/ecs/dentia-backend`
4. Search for logs using filters:
   - `[HTTP]` - All HTTP request logs
   - `GlobalHttpExceptionFilter` - Exception logs
   - `ERROR` - All error logs

## Best Practices

### 1. Always Log Errors with Context

❌ Bad:
```typescript
catch (error) {
  console.error('Error occurred');
}
```

✅ Good:
```typescript
catch (error) {
  logger.error({
    error: error instanceof Error ? {
      name: error.name,
      message: error.message,
      stack: error.stack,
    } : error,
    userId,
    attemptedAction: 'user_registration',
  }, '[MyFeature] Operation failed');
}
```

### 2. Sanitize Sensitive Data

Always redact sensitive information before logging:

```typescript
const sanitized = { 
  ...data, 
  password: '[REDACTED]',
  token: '[REDACTED]',
};
logger.error({ data: sanitized }, 'Failed to process request');
```

### 3. Use Structured Logging

Log objects, not strings:

❌ Bad:
```typescript
logger.error(`User ${userId} failed to sign up with email ${email}`);
```

✅ Good:
```typescript
logger.error({
  userId,
  email,
  reason: 'password_validation_failed',
}, '[Auth] Sign-up failed');
```

### 4. Use Consistent Log Prefixes

Use square brackets for categories:

- `[Auth]` - Authentication related
- `[API]` - API calls
- `[DB]` - Database operations
- `[HTTP]` - HTTP requests/responses

### 5. Choose Appropriate Log Levels

- **ERROR**: Something went wrong that needs attention
- **WARN**: Something unexpected but not critical
- **INFO**: Important business events (user registered, order placed)
- **DEBUG**: Detailed information for debugging (dev only)

## Testing the Logging

### Test Frontend Logging

1. Try to sign up with invalid data
2. Check CloudWatch logs for:
   - Schema validation error logs
   - Request context (sanitized)
   - Error details

### Test Backend Logging

1. Make a request to a protected endpoint without auth
2. Check CloudWatch logs for:
   - HTTP request log (from interceptor)
   - Exception log (from filter)
   - Request context

## Environment Variables

### Frontend

- `LOGGER=pino` - Use Pino logger (default)
- `LOGGER=console` - Use console logger
- `MONITORING_PROVIDER=sentry` - Use Sentry for monitoring
- `NEXT_PUBLIC_SENTRY_DSN` - Sentry DSN for error tracking

### Backend

No additional environment variables needed. NestJS's built-in logger automatically sends logs to stdout, which are captured by CloudWatch when running in ECS.

## Troubleshooting

### Logs Not Appearing in CloudWatch

1. **Check ECS Task Logs Configuration:**
   - Ensure the task definition has `awslogs` driver configured
   - Verify the log group exists in CloudWatch

2. **Check Log Group Retention:**
   - Ensure logs haven't been deleted due to retention policy

3. **Check IAM Permissions:**
   - ECS task execution role needs `logs:CreateLogStream` and `logs:PutLogEvents` permissions

### Too Many Logs

1. Reduce log level in production (ERROR and WARN only)
2. Add sampling for high-frequency logs
3. Adjust CloudWatch retention policies

### Sensitive Data in Logs

1. Review the sanitization logic in `api-error-handler.ts` and `http-exception.filter.ts`
2. Add more fields to the `sensitiveFields` array
3. Test with real data to ensure proper redaction

## Next Steps

1. **Add Metrics**: Implement CloudWatch Metrics for key operations
2. **Add Tracing**: Implement X-Ray tracing for distributed tracing
3. **Add Alerts**: Set up CloudWatch Alarms for critical errors
4. **Add Dashboard**: Create CloudWatch Dashboard for monitoring

## Related Files

### Frontend
- `apps/frontend/apps/web/app/api/auth/sign-up/route.ts` - Sign-up API with logging
- `apps/frontend/apps/web/lib/api-error-handler.ts` - Client-side error handler
- `apps/frontend/apps/web/instrumentation.ts` - Next.js instrumentation
- `apps/frontend/packages/shared/src/logger/index.ts` - Logger implementation

### Backend
- `apps/backend/src/common/filters/http-exception.filter.ts` - Global exception filter
- `apps/backend/src/common/interceptors/logging.interceptor.ts` - Logging interceptor
- `apps/backend/src/app.module.ts` - Application module with global providers

