import { getLogger } from '@kit/shared/logger';

export interface ApiError {
  status?: number;
  message: string;
  field?: string;
  details?: unknown;
}

export class ApiErrorHandler {
  /**
   * Handle API errors with comprehensive logging
   */
  static async handleError(
    error: unknown,
    context: {
      endpoint: string;
      method: string;
      body?: unknown;
    },
  ): Promise<ApiError> {
    const logger = await getLogger();

    // Sanitize body to prevent logging sensitive data
    const sanitizedBody = this.sanitizeBody(context.body);

    if (error instanceof Response) {
      // HTTP Response error
      let responseBody: unknown;
      
      try {
        responseBody = await error.json();
      } catch {
        responseBody = await error.text().catch(() => 'Unable to parse response');
      }

      logger.error({
        endpoint: context.endpoint,
        method: context.method,
        status: error.status,
        statusText: error.statusText,
        requestBody: sanitizedBody,
        responseBody,
      }, '[API] HTTP Error');

      return {
        status: error.status,
        message: typeof responseBody === 'object' && responseBody !== null && 'message' in responseBody
          ? String(responseBody.message)
          : 'An error occurred',
        details: responseBody,
      };
    }

    if (error instanceof Error) {
      // JavaScript Error
      logger.error({
        endpoint: context.endpoint,
        method: context.method,
        error: {
          name: error.name,
          message: error.message,
          stack: error.stack,
        },
        requestBody: sanitizedBody,
      }, '[API] Request Error');

      return {
        message: error.message,
        details: error,
      };
    }

    // Unknown error type
    logger.error({
      endpoint: context.endpoint,
      method: context.method,
      error,
      requestBody: sanitizedBody,
    }, '[API] Unknown Error');

    return {
      message: 'An unexpected error occurred',
      details: error,
    };
  }

  /**
   * Log successful API calls (optional, for debugging)
   */
  static async logSuccess(
    context: {
      endpoint: string;
      method: string;
      status: number;
      duration?: number;
    },
  ): Promise<void> {
    // Only log in development
    if (process.env.NODE_ENV === 'development') {
      const logger = await getLogger();
      
      logger.debug({
        endpoint: context.endpoint,
        method: context.method,
        status: context.status,
        duration: context.duration ? `${context.duration}ms` : undefined,
      }, '[API] Success');
    }
  }

  /**
   * Sanitize request body to prevent logging sensitive information
   */
  private static sanitizeBody(body: unknown): unknown {
    if (!body || typeof body !== 'object') {
      return body;
    }

    const sanitized = { ...body as Record<string, unknown> };
    const sensitiveFields = [
      'password',
      'confirmPassword',
      'token',
      'secret',
      'apiKey',
      'authorization',
      'accessToken',
      'refreshToken',
    ];

    for (const field of sensitiveFields) {
      if (field in sanitized) {
        sanitized[field] = '[REDACTED]';
      }
    }

    return sanitized;
  }
}

/**
 * Wrapper for fetch with automatic error handling and logging
 */
export async function fetchWithLogging(
  url: string,
  options?: RequestInit,
): Promise<Response> {
  const startTime = Date.now();
  const method = options?.method || 'GET';

  try {
    const response = await fetch(url, options);
    const duration = Date.now() - startTime;

    if (!response.ok) {
      await ApiErrorHandler.handleError(response.clone(), {
        endpoint: url,
        method,
        body: options?.body,
      });
    } else {
      await ApiErrorHandler.logSuccess({
        endpoint: url,
        method,
        status: response.status,
        duration,
      });
    }

    return response;
  } catch (error) {
    await ApiErrorHandler.handleError(error, {
      endpoint: url,
      method,
      body: options?.body,
    });
    
    throw error;
  }
}

