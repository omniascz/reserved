// Globální exception filter — pošle neočekávané chyby do Sentry a zformátuje odpověď.
//
// HttpException (4xx/5xx) z NestJS jsou očekávané: zformátujeme je do JSON odpovědi
// v konvenci API `{ error: { code, message } }` a do Sentry je NEposíláme.
// Skutečné runtime errors (TypeError, neošetřené reject) jdou do Sentry + 500.
//
// POZN.: Dřív tento filtr u HttpException volal `throw exception` (re-throw). Re-throw
// z globálního catch-all filtru ale Nest nezformátuje — výjimka unikne a v async
// request pipeline se stane unhandled rejection, což SHODÍ celý proces. Proto zde
// odpověď zapisujeme přímo (stejný princip jako AuthExceptionFilter).

import {
  type ArgumentsHost,
  Catch,
  type ExceptionFilter,
  HttpException,
  Logger,
} from '@nestjs/common';
import type { Response } from 'express';
import { Sentry } from './sentry.js';

function codeForStatus(status: number): string {
  switch (status) {
    case 400:
      return 'BAD_REQUEST';
    case 401:
      return 'UNAUTHORIZED';
    case 403:
      return 'FORBIDDEN';
    case 404:
      return 'NOT_FOUND';
    case 409:
      return 'CONFLICT';
    case 422:
      return 'UNPROCESSABLE_ENTITY';
    case 429:
      return 'TOO_MANY_REQUESTS';
    default:
      return status >= 500 ? 'INTERNAL' : 'ERROR';
  }
}

/** Zformátuje HttpException do konvence `{ error: { code, message } }`. */
function toPayload(exception: HttpException): Record<string, unknown> {
  const body = exception.getResponse();
  // Naše vlastní výjimky už nesou `{ error: { code, message } }` — necháme být.
  if (typeof body === 'object' && body !== null && 'error' in body) {
    return body as Record<string, unknown>;
  }
  const message =
    typeof body === 'string'
      ? body
      : typeof body === 'object' && body !== null && 'message' in body
        ? String((body as { message: unknown }).message)
        : exception.message;
  return { error: { code: codeForStatus(exception.getStatus()), message } };
}

@Catch()
export class SentryExceptionFilter implements ExceptionFilter {
  private readonly logger = new Logger(SentryExceptionFilter.name);

  catch(exception: unknown, host: ArgumentsHost): void {
    const ctx = host.switchToHttp();
    const res = ctx.getResponse<Response>();

    // Očekávané HTTP chyby — zformátuj a odešli (NEpropaguj do Sentry).
    if (exception instanceof HttpException) {
      res.status(exception.getStatus()).json(toPayload(exception));
      return;
    }

    // Neočekávaná chyba — log + Sentry + 500.
    const message = exception instanceof Error ? exception.message : String(exception);
    this.logger.error(
      `Unhandled exception: ${message}`,
      exception instanceof Error ? exception.stack : undefined,
    );

    if (process.env.SENTRY_DSN) {
      Sentry.captureException(exception, {
        extra: {
          path: ctx.getRequest()?.url,
          method: ctx.getRequest()?.method,
        },
      });
    }

    res.status(500).json({ error: { code: 'INTERNAL', message: 'Vnitřní chyba serveru.' } });
  }
}
