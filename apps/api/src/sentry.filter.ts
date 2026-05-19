// Globální exception filter — pošle neočekávané chyby do Sentry.
//
// HttpException (4xx/5xx) z NestJS jsou očekávané a do Sentry je nepošleme.
// Posíláme jen "skutečné" runtime errors (TypeError, neošetřené promise reject).

import {
  type ArgumentsHost,
  Catch,
  type ExceptionFilter,
  HttpException,
  Logger,
} from '@nestjs/common';
import { Sentry } from './sentry.js';

@Catch()
export class SentryExceptionFilter implements ExceptionFilter {
  private readonly logger = new Logger(SentryExceptionFilter.name);

  catch(exception: unknown, host: ArgumentsHost): void {
    // HttpException → klidně proletí, Nest ji zformátuje sám. Nepropaguju do Sentry.
    if (exception instanceof HttpException) {
      throw exception;
    }

    // Neočekávaná chyba — log + Sentry.
    const message = exception instanceof Error ? exception.message : String(exception);
    this.logger.error(
      `Unhandled exception: ${message}`,
      exception instanceof Error ? exception.stack : undefined,
    );

    if (process.env.SENTRY_DSN) {
      Sentry.captureException(exception, {
        extra: {
          path: host.switchToHttp().getRequest()?.url,
          method: host.switchToHttp().getRequest()?.method,
        },
      });
    }

    // Default 500 response (Nest by se postaral, ale ujistíme se).
    throw exception;
  }
}
