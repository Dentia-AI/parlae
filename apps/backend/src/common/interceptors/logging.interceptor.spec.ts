import { ExecutionContext, CallHandler } from '@nestjs/common';
import { of, throwError } from 'rxjs';
import { LoggingInterceptor } from './logging.interceptor';

/**
 * Parse the single-line log message produced by the interceptor.
 * Format: "[METHOD] /url STATUS DURATIONms | {json}"
 * Error:  "[METHOD] /url ERROR DURATIONms | {json}"
 */
function parseLogMessage(message: string) {
  const pipeIndex = message.indexOf(' | ');
  const prefix = pipeIndex >= 0 ? message.slice(0, pipeIndex) : message;
  const jsonPart = pipeIndex >= 0 ? message.slice(pipeIndex + 3) : '{}';

  const json = JSON.parse(jsonPart);
  const durationMatch = prefix.match(/(\d+)ms/);
  const methodMatch = prefix.match(/\[(\w+)\]/);
  const urlMatch = prefix.match(/\]\s+(\S+)/);
  const statusMatch = prefix.match(/\]\s+\S+\s+(\d+)\s+\d+ms/);

  return {
    ...json,
    method: methodMatch ? methodMatch[1] : undefined,
    url: urlMatch ? urlMatch[1] : undefined,
    statusCode: statusMatch ? parseInt(statusMatch[1], 10) : undefined,
    duration: durationMatch ? `${durationMatch[1]}ms` : undefined,
  };
}

describe('LoggingInterceptor', () => {
  let interceptor: LoggingInterceptor;
  let mockExecutionContext: ExecutionContext;
  let mockCallHandler: CallHandler;
  let mockRequest: any;
  let mockResponse: any;

  beforeEach(() => {
    interceptor = new LoggingInterceptor();

    mockRequest = {
      method: 'GET',
      url: '/test',
      ip: '127.0.0.1',
      headers: {
        'user-agent': 'test-agent',
      },
    };

    mockResponse = {
      statusCode: 200,
    };

    mockExecutionContext = {
      switchToHttp: jest.fn().mockReturnValue({
        getRequest: () => mockRequest,
        getResponse: () => mockResponse,
      }),
    } as any;

    mockCallHandler = {
      handle: jest.fn(),
    };
  });

  afterEach(() => {
    jest.clearAllMocks();
  });

  it('should be defined', () => {
    expect(interceptor).toBeDefined();
  });

  describe('intercept', () => {
    it('should log successful request', (done) => {
      mockCallHandler.handle = jest.fn().mockReturnValue(of({ data: 'test' }));
      const logSpy = jest.spyOn(interceptor['logger'], 'log');

      const result$ = interceptor.intercept(mockExecutionContext, mockCallHandler);

      result$.subscribe({
        next: (data) => {
          expect(data).toEqual({ data: 'test' });
          expect(logSpy).toHaveBeenCalled();
          expect(logSpy.mock.calls[0][0]).toContain('[GET]');
          expect(logSpy.mock.calls[0][0]).toContain('/test');
          expect(logSpy.mock.calls[0][0]).toContain('200');
          expect(logSpy.mock.calls[0][0]).toContain('ms');
          done();
        },
      });
    });

    it('should log request duration', (done) => {
      mockCallHandler.handle = jest.fn().mockReturnValue(of({ data: 'test' }));
      const logSpy = jest.spyOn(interceptor['logger'], 'log');

      const result$ = interceptor.intercept(mockExecutionContext, mockCallHandler);

      result$.subscribe({
        next: () => {
          const logMessage = logSpy.mock.calls[0][0];
          const parsed = parseLogMessage(logMessage);

          expect(parsed.duration).toBeDefined();
          expect(parsed.duration).toMatch(/\d+ms/);
          done();
        },
      });
    });

    it('should log request metadata', (done) => {
      mockRequest.method = 'POST';
      mockRequest.url = '/api/users';
      mockRequest.ip = '192.168.1.1';
      mockRequest.headers['user-agent'] = 'Mozilla/5.0';
      mockResponse.statusCode = 201;

      mockCallHandler.handle = jest.fn().mockReturnValue(of({ success: true }));
      const logSpy = jest.spyOn(interceptor['logger'], 'log');

      const result$ = interceptor.intercept(mockExecutionContext, mockCallHandler);

      result$.subscribe({
        next: () => {
          const logMessage = logSpy.mock.calls[0][0];
          const parsed = parseLogMessage(logMessage);

          expect(parsed).toMatchObject({
            method: 'POST',
            url: '/api/users',
            statusCode: 201,
            ip: '192.168.1.1',
            userAgent: 'Mozilla/5.0',
          });
          done();
        },
      });
    });

    it('should log error on request failure', (done) => {
      const error = new Error('Test error');
      mockCallHandler.handle = jest.fn().mockReturnValue(throwError(() => error));
      const errorSpy = jest.spyOn(interceptor['logger'], 'error');

      const result$ = interceptor.intercept(mockExecutionContext, mockCallHandler);

      result$.subscribe({
        error: () => {
          expect(errorSpy).toHaveBeenCalled();
          expect(errorSpy.mock.calls[0][0]).toContain('[GET]');
          expect(errorSpy.mock.calls[0][0]).toContain('/test');
          expect(errorSpy.mock.calls[0][0]).toContain('ERROR');
          expect(errorSpy.mock.calls[0][0]).toContain('ms');
          done();
        },
      });
    });

    it('should log error message in context', (done) => {
      const error = new Error('Database connection failed');
      mockCallHandler.handle = jest.fn().mockReturnValue(throwError(() => error));
      const errorSpy = jest.spyOn(interceptor['logger'], 'error');

      const result$ = interceptor.intercept(mockExecutionContext, mockCallHandler);

      result$.subscribe({
        error: () => {
          const errorMessage = errorSpy.mock.calls[0][0];
          const parsed = parseLogMessage(errorMessage);

          expect(parsed).toMatchObject({
            method: 'GET',
            url: '/test',
            error: 'Database connection failed',
            ip: '127.0.0.1',
            userAgent: 'test-agent',
          });
          expect(parsed.duration).toMatch(/\d+ms/);
          done();
        },
      });
    });

    it('should handle error that is not an Error instance', (done) => {
      const error = 'string error';
      mockCallHandler.handle = jest.fn().mockReturnValue(throwError(() => error));
      const errorSpy = jest.spyOn(interceptor['logger'], 'error');

      const result$ = interceptor.intercept(mockExecutionContext, mockCallHandler);

      result$.subscribe({
        error: () => {
          const errorMessage = errorSpy.mock.calls[0][0];
          const parsed = parseLogMessage(errorMessage);
          expect(parsed.error).toBe('string error');
          done();
        },
      });
    });

    it('should handle missing user-agent header', (done) => {
      delete mockRequest.headers['user-agent'];
      mockCallHandler.handle = jest.fn().mockReturnValue(of({ data: 'test' }));
      const logSpy = jest.spyOn(interceptor['logger'], 'log');

      const result$ = interceptor.intercept(mockExecutionContext, mockCallHandler);

      result$.subscribe({
        next: () => {
          const logMessage = logSpy.mock.calls[0][0];
          const parsed = parseLogMessage(logMessage);
          expect(parsed.userAgent).toBe('');
          done();
        },
      });
    });

    it('should measure time accurately', (done) => {
      mockCallHandler.handle = jest.fn().mockReturnValue(of({ data: 'test' }));
      const logSpy = jest.spyOn(interceptor['logger'], 'log');

      const result$ = interceptor.intercept(mockExecutionContext, mockCallHandler);

      result$.subscribe({
        next: () => {
          const logMessage = logSpy.mock.calls[0][0];
          const parsed = parseLogMessage(logMessage);
          const durationMatch = parsed.duration.match(/(\d+)ms/);

          expect(durationMatch).toBeTruthy();
          const duration = parseInt(durationMatch![1], 10);
          expect(duration).toBeGreaterThanOrEqual(0);
          expect(duration).toBeLessThan(1000);
          done();
        },
      });
    });

    it('should call next handler', (done) => {
      mockCallHandler.handle = jest.fn().mockReturnValue(of({ data: 'test' }));

      const result$ = interceptor.intercept(mockExecutionContext, mockCallHandler);

      result$.subscribe({
        next: () => {
          expect(mockCallHandler.handle).toHaveBeenCalled();
          done();
        },
      });
    });

    it('should pass through response data unchanged', (done) => {
      const testData = { id: 1, name: 'Test', nested: { value: 'test' } };
      mockCallHandler.handle = jest.fn().mockReturnValue(of(testData));

      const result$ = interceptor.intercept(mockExecutionContext, mockCallHandler);

      result$.subscribe({
        next: (data) => {
          expect(data).toEqual(testData);
          expect(data).toBe(testData);
          done();
        },
      });
    });

    it('should work with different HTTP methods', (done) => {
      const methods = ['GET', 'POST', 'PUT', 'DELETE', 'PATCH'];
      let completed = 0;

      methods.forEach((method) => {
        mockRequest.method = method;
        mockCallHandler.handle = jest.fn().mockReturnValue(of({ data: 'test' }));
        const logSpy = jest.spyOn(interceptor['logger'], 'log');

        const result$ = interceptor.intercept(mockExecutionContext, mockCallHandler);

        result$.subscribe({
          next: () => {
            expect(logSpy.mock.calls[0][0]).toContain(`[${method}]`);
            completed++;
            if (completed === methods.length) {
              done();
            }
          },
        });

        jest.clearAllMocks();
      });
    });

    it('should work with different status codes', (done) => {
      const statusCodes = [200, 201, 204, 400, 404, 500];
      let completed = 0;

      statusCodes.forEach((statusCode) => {
        mockResponse.statusCode = statusCode;
        mockCallHandler.handle = jest.fn().mockReturnValue(of({ data: 'test' }));
        const logSpy = jest.spyOn(interceptor['logger'], 'log');

        const result$ = interceptor.intercept(mockExecutionContext, mockCallHandler);

        result$.subscribe({
          next: () => {
            expect(logSpy.mock.calls[0][0]).toContain(String(statusCode));
            completed++;
            if (completed === statusCodes.length) {
              done();
            }
          },
        });

        jest.clearAllMocks();
      });
    });

    it('should skip logging for health check paths', (done) => {
      mockRequest.url = '/health';
      mockCallHandler.handle = jest.fn().mockReturnValue(of({ status: 'ok' }));
      const logSpy = jest.spyOn(interceptor['logger'], 'log');

      const result$ = interceptor.intercept(mockExecutionContext, mockCallHandler);

      result$.subscribe({
        next: (data) => {
          expect(data).toEqual({ status: 'ok' });
          expect(logSpy).not.toHaveBeenCalled();
          done();
        },
      });
    });
  });
});
