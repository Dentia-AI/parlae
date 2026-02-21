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
