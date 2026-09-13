// AppThrottlerGuard — GLOBÁLNÍ omezovač požadavků.
//
// PROČ VLASTNÍ:
//   1. ThrottlerModule byl sice nakonfigurovaný, ale nikde se nevynucoval —
//      přihlašovací formulář tak neměl žádnou ochranu proti hádání hesel.
//   2. Výchozí ThrottlerGuard vrací tělo `{statusCode, message}`, což se liší
//      od zbytku API. Tenhle vrací 429 ve tvaru `{ error: { code, message } }`
//      — kód `TOO_MANY_REQUESTS` už zná i sentry.filter.
//   3. Existující ApiKeyThrottlerGuard hází při překročení holou `Error`, což
//      skončí jako HTTP 500. Ten vzor tu ZÁMĚRNĚ nekopírujeme: klient se musí
//      dozvědět, že má zpomalit, ne dostat pád serveru.
//
// Limity se nastavují v app.module (výchozí) a přepisují dekorátorem
// `@Throttle({ short: { limit, ttl } })` na citlivých cestách.

import { HttpException, HttpStatus, Injectable, type ExecutionContext } from '@nestjs/common';
import { ThrottlerGuard, type ThrottlerLimitDetail } from '@nestjs/throttler';
import type { Request } from 'express';

@Injectable()
export class AppThrottlerGuard extends ThrottlerGuard {
  /**
   * Klíčujeme podle IP A CESTY zvlášť. Bez cesty v klíči by vyčerpání limitu
   * na jednom endpointu zablokovalo i všechny ostatní — útočník by tak jedním
   * endpointem odstavil celé API.
   */
  protected override async getTracker(req: Request): Promise<string> {
    const ip = req.ip ?? 'unknown';
    const cesta = (req.baseUrl ?? '') + (req.path ?? '');
    return `${ip}:${cesta}`;
  }

  protected override throwThrottlingException(
    _context: ExecutionContext,
    detail: ThrottlerLimitDetail,
  ): Promise<void> {
    const zaSekund = Math.max(1, Math.ceil(detail?.timeToBlockExpire ?? 60));
    return Promise.reject(
      new HttpException(
        {
          error: {
            code: 'TOO_MANY_REQUESTS',
            message: `Příliš mnoho pokusů. Zkuste to prosím znovu za ${zaSekund} s.`,
            details: { retryAfterSeconds: zaSekund },
          },
        },
        HttpStatus.TOO_MANY_REQUESTS,
      ),
    );
  }
}
