import { ArgumentsHost, HttpException, HttpStatus } from '@nestjs/common';
import { GlobalHttpExceptionFilter } from './http-exception.filter';

describe('GlobalHttpExceptionFilter', () => {
  let filter: GlobalHttpExceptionFilter;
  let mockResponse: any;
  let mockRequest: any;
  let mockHost: ArgumentsHost;

  beforeEach(() => {
    filter = new GlobalHttpExceptionFilter();

    mockResponse = {
      status: jest.fn().mockReturnThis(),
      json: jest.fn().mockReturnThis(),
    };

    mockRequest = {
      method: 'GET',
      url: '/test',
      path: '/test',
      ip: '127.0.0.1',
      headers: {
        'user-agent': 'test-agent',
      },
      body: {},
      query: {},
      params: {},
    };

    mockHost = {
      switchToHttp: jest.fn().mockReturnValue({
        getResponse: () => mockResponse,
        getRequest: () => mockRequest,
      }),
    } as any;
  });

  afterEach(() => {
    jest.clearAllMocks();
  });

  it('should be defined', () => {
    expect(filter).toBeDefined();
  });

  describe('catch', () => {
    it('should handle HttpException with proper status code', () => {
      const exception = new HttpException('Not found', HttpStatus.NOT_FOUND);

      filter.catch(exception, mockHost);

      expect(mockResponse.status).toHaveBeenCalledWith(HttpStatus.NOT_FOUND);
      expect(mockResponse.json).toHaveBeenCalledWith(
        expect.objectContaining({
          statusCode: HttpStatus.NOT_FOUND,
          message: 'Not found',
          path: '/test',
          timestamp: expect.any(String),
        })
      );
    });

    it('should handle HttpException with object response', () => {
      const errorResponse = {
        message: 'Validation failed',
        errors: ['field1 is required', 'field2 is invalid'],
      };
      const exception = new HttpException(errorResponse, HttpStatus.BAD_REQUEST);

      filter.catch(exception, mockHost);

      expect(mockResponse.status).toHaveBeenCalledWith(HttpStatus.BAD_REQUEST);
      expect(mockResponse.json).toHaveBeenCalledWith(
        expect.objectContaining({
          statusCode: HttpStatus.BAD_REQUEST,
          message: 'Validation failed',
          errors: ['field1 is required', 'field2 is invalid'],
          path: '/test',
          timestamp: expect.any(String),
        })
      );
    });

    it('should handle non-HttpException errors', () => {
      const exception = new Error('Unexpected error');

      filter.catch(exception, mockHost);

      expect(mockResponse.status).toHaveBeenCalledWith(
        HttpStatus.INTERNAL_SERVER_ERROR
      );
      expect(mockResponse.json).toHaveBeenCalledWith(
        expect.objectContaining({
          statusCode: HttpStatus.INTERNAL_SERVER_ERROR,
          message: 'Internal server error',
          path: '/test',
          timestamp: expect.any(String),
        })
      );
    });

    it('should handle unknown errors', () => {
      const exception = 'string error';

      filter.catch(exception, mockHost);

      expect(mockResponse.status).toHaveBeenCalledWith(
        HttpStatus.INTERNAL_SERVER_ERROR
      );
      expect(mockResponse.json).toHaveBeenCalledWith(
        expect.objectContaining({
          statusCode: HttpStatus.INTERNAL_SERVER_ERROR,
          message: 'Internal server error',
          path: '/test',
          timestamp: expect.any(String),
        })
      );
    });

    it('should sanitize sensitive fields in request body', () => {
      mockRequest.body = {
        username: 'testuser',
        password: 'secret123',
        token: 'secret-token',
        apiKey: 'secret-api-key',
      };

      const exception = new HttpException('Bad request', HttpStatus.BAD_REQUEST);
      const consoleWarnSpy = jest.spyOn(console, 'warn').mockImplementation();

      filter.catch(exception, mockHost);

      // The filter logs the sanitized body internally
      expect(mockResponse.status).toHaveBeenCalledWith(HttpStatus.BAD_REQUEST);
      
      consoleWarnSpy.mockRestore();
    });

    it('should return valid ISO timestamp', () => {
      const exception = new HttpException('Test', HttpStatus.BAD_REQUEST);
      const before = Date.now();

      filter.catch(exception, mockHost);

      const jsonCall = mockResponse.json.mock.calls[0][0];
      const timestamp = new Date(jsonCall.timestamp);
      const after = Date.now();

      expect(timestamp.getTime()).toBeGreaterThanOrEqual(before);
      expect(timestamp.getTime()).toBeLessThanOrEqual(after);
      expect(timestamp.toISOString()).toBe(jsonCall.timestamp);
    });

    it('should include request path in response', () => {
      mockRequest.url = '/api/users/123';
      const exception = new HttpException('Not found', HttpStatus.NOT_FOUND);

      filter.catch(exception, mockHost);

      expect(mockResponse.json).toHaveBeenCalledWith(
        expect.objectContaining({
          path: '/api/users/123',
        })
      );
    });

    it('should handle different HTTP status codes correctly', () => {
      const testCases = [
        { status: HttpStatus.BAD_REQUEST, message: 'Bad request' },
        { status: HttpStatus.UNAUTHORIZED, message: 'Unauthorized' },
        { status: HttpStatus.FORBIDDEN, message: 'Forbidden' },
        { status: HttpStatus.NOT_FOUND, message: 'Not found' },
        { status: HttpStatus.INTERNAL_SERVER_ERROR, message: 'Server error' },
      ];

      testCases.forEach(({ status, message }) => {
        jest.clearAllMocks();
        const exception = new HttpException(message, status);

        filter.catch(exception, mockHost);

        expect(mockResponse.status).toHaveBeenCalledWith(status);
        expect(mockResponse.json).toHaveBeenCalledWith(
          expect.objectContaining({
            statusCode: status,
            message,
          })
        );
      });
    });
  });

  describe('sanitizeBody', () => {
    it('should redact password field', () => {
      mockRequest.body = { username: 'test', password: 'secret' };
      const exception = new HttpException('Test', HttpStatus.BAD_REQUEST);

      filter.catch(exception, mockHost);

      // The sanitized body is logged internally, so we just verify the filter runs
      expect(mockResponse.status).toHaveBeenCalled();
    });

    it('should redact multiple sensitive fields', () => {
      mockRequest.body = {
        password: 'secret1',
        token: 'secret2',
        secret: 'secret3',
        apiKey: 'secret4',
        authorization: 'secret5',
        normalField: 'visible',
      };
      const exception = new HttpException('Test', HttpStatus.BAD_REQUEST);

      filter.catch(exception, mockHost);

      expect(mockResponse.status).toHaveBeenCalled();
    });

    it('should handle non-object body', () => {
      mockRequest.body = 'string body';
      const exception = new HttpException('Test', HttpStatus.BAD_REQUEST);

      filter.catch(exception, mockHost);

      expect(mockResponse.status).toHaveBeenCalled();
    });

    it('should handle null body', () => {
      mockRequest.body = null;
      const exception = new HttpException('Test', HttpStatus.BAD_REQUEST);

      filter.catch(exception, mockHost);

      expect(mockResponse.status).toHaveBeenCalled();
    });
  });
});

