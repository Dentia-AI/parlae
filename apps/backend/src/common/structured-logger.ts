import { Logger } from '@nestjs/common';

/**
 * Logger that auto-stringifies objects so structured data appears as
 * a single JSON line in CloudWatch instead of "Object:" followed by
 * multi-line pretty-printed output.
 *
 * Drop-in replacement for NestJS Logger — swap the import and the
 * `new Logger(...)` call to `new StructuredLogger(...)`.
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
