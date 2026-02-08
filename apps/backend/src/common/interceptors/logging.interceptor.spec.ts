import { ExecutionContext, CallHandler } from '@nestjs/common';
import { of, throwError } from 'rxjs';
import { LoggingInterceptor } from './logging.interceptor';

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
          const logCall = logSpy.mock.calls[0];
          const logContext = logCall[1];
          
          expect(logContext).toHaveProperty('duration');
          expect(logContext.duration).toMatch(/\d+ms/);
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
          const logContext = logSpy.mock.calls[0][1];
          
          expect(logContext).toMatchObject({
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
          expect(errorSpy.mock.calls[0][0]).toContain('Error');
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
          const errorContext = errorSpy.mock.calls[0][1];
          
          expect(errorContext).toMatchObject({
            method: 'GET',
            url: '/test',
            error: 'Database connection failed',
            ip: '127.0.0.1',
            userAgent: 'test-agent',
          });
          expect(errorContext.duration).toMatch(/\d+ms/);
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
          const errorContext = errorSpy.mock.calls[0][1];
          expect(errorContext.error).toBe('string error');
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
          const logContext = logSpy.mock.calls[0][1];
          expect(logContext.userAgent).toBe('');
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
          const logContext = logSpy.mock.calls[0][1];
          const durationMatch = logContext.duration.match(/(\d+)ms/);
          
          expect(durationMatch).toBeTruthy();
          const duration = parseInt(durationMatch![1], 10);
          expect(duration).toBeGreaterThanOrEqual(0);
          expect(duration).toBeLessThan(1000); // Should complete in less than 1 second
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
          expect(data).toBe(testData); // Same reference
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
  });
});

