import {
  CallHandler,
  ExecutionContext,
  Injectable,
  Logger,
  NestInterceptor,
} from '@nestjs/common';
import { Observable } from 'rxjs';
import { tap } from 'rxjs/operators';
import { Request } from 'express';

const SKIP_LOGGING_PATHS = new Set(['/health', '/healthz', '/ready']);

@Injectable()
export class LoggingInterceptor implements NestInterceptor {
  private readonly logger = new Logger('HTTP');

  intercept(context: ExecutionContext, next: CallHandler): Observable<any> {
    const request = context.switchToHttp().getRequest<Request>();
    const { method, url, ip } = request;
    const userAgent = request.headers['user-agent'] || '';
    const startTime = Date.now();

    // Skip logging for health checks to reduce noise
    if (SKIP_LOGGING_PATHS.has(url)) {
      return next.handle();
    }

    return next.handle().pipe(
      tap({
        next: () => {
          const response = context.switchToHttp().getResponse();
          const { statusCode } = response;
          const duration = Date.now() - startTime;

          this.logger.log(
            `[${method}] ${url} ${statusCode} ${duration}ms | ${JSON.stringify({ ip, userAgent })}`,
          );
        },
        error: (error) => {
          const duration = Date.now() - startTime;

          this.logger.error(
            `[${method}] ${url} ERROR ${duration}ms | ${JSON.stringify({ error: error instanceof Error ? error.message : String(error), ip, userAgent })}`,
          );
        },
      }),
    );
  }
}

