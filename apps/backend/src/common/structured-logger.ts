import { ConsoleLogger, Logger } from '@nestjs/common';

/**
 * Global ConsoleLogger override that serialises objects to a single
 * JSON line.  Set once via `NestFactory.create(AppModule, { logger })`
 * and every `new Logger(...)` in every service will emit flat JSON —
 * no more "Object:" + multi-line output splitting CloudWatch entries.
 */
export class StructuredConsoleLogger extends ConsoleLogger {
  log(message: unknown, ...optionalParams: any[]) {
    super.log(stringify(message), ...optionalParams);
  }

  warn(message: unknown, ...optionalParams: any[]) {
    super.warn(stringify(message), ...optionalParams);
  }

  error(message: unknown, ...optionalParams: any[]) {
    if (message instanceof Error) {
      super.error(message.message, message.stack, ...optionalParams);
    } else {
      super.error(stringify(message), ...optionalParams);
    }
  }

  debug(message: unknown, ...optionalParams: any[]) {
    super.debug(stringify(message), ...optionalParams);
  }

  verbose(message: unknown, ...optionalParams: any[]) {
    super.verbose(stringify(message), ...optionalParams);
  }
}

/**
 * Per-service logger that auto-stringifies objects so structured data
 * appears as a single JSON line in CloudWatch instead of "Object:"
 * followed by multi-line pretty-printed output.
 *
 * Drop-in replacement for NestJS Logger — swap the import and the
 * `new Logger(...)` call to `new StructuredLogger(...)`.
 *
 * NOTE: With StructuredConsoleLogger set globally in main.ts, this is
 * only needed if you want the PMS_VERBOSE_LOGGING gate on verbose().
 */
export class StructuredLogger extends Logger {
  log(message: unknown, ...optionalParams: unknown[]) {
    super.log(stringify(message), ...optionalParams);
  }

  warn(message: unknown, ...optionalParams: unknown[]) {
    super.warn(stringify(message), ...optionalParams);
  }

  error(message: unknown, ...optionalParams: unknown[]) {
    if (message instanceof Error) {
      super.error(message.message, message.stack, ...optionalParams);
    } else {
      super.error(stringify(message), ...optionalParams);
    }
  }

  /**
   * Verbose/debug log that only emits when PMS_VERBOSE_LOGGING=true.
   * Use for temporary diagnostic output (PMS API calls, payloads,
   * responses).  Disable in production to reduce CloudWatch costs.
   */
  verbose(message: unknown, ...optionalParams: unknown[]) {
    if (process.env.PMS_VERBOSE_LOGGING !== 'true') return;
    super.log(`[VERBOSE] ${stringify(message)}`, ...optionalParams);
  }
}

function stringify(value: unknown): string {
  if (typeof value === 'string') return value;
  if (value === null || value === undefined) return String(value);
  try {
    return JSON.stringify(value);
  } catch {
    return String(value);
  }
}
