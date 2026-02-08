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

@Injectable()
export class LoggingInterceptor implements NestInterceptor {
  private readonly logger = new Logger('HTTP');

  intercept(context: ExecutionContext, next: CallHandler): Observable<any> {
    const request = context.switchToHttp().getRequest<Request>();
    const { method, url, ip } = request;
    const userAgent = request.headers['user-agent'] || '';
    const startTime = Date.now();

    return next.handle().pipe(
      tap({
        next: () => {
          const response = context.switchToHttp().getResponse();
          const { statusCode } = response;
          const duration = Date.now() - startTime;

          this.logger.log(
            `[${method}] ${url} ${statusCode} - ${duration}ms`,
            {
              method,
              url,
              statusCode,
              duration: `${duration}ms`,
              ip,
              userAgent,
            },
          );
        },
        error: (error) => {
          const duration = Date.now() - startTime;
          
          this.logger.error(
            `[${method}] ${url} - Error after ${duration}ms`,
            {
              method,
              url,
              duration: `${duration}ms`,
              error: error instanceof Error ? error.message : String(error),
              ip,
              userAgent,
            },
          );
        },
      }),
    );
  }
}

