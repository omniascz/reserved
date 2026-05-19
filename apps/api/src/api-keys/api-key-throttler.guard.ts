// ApiKeyThrottlerGuard — rate limit per API klíč (ne per IP).
// Použito na /external/v1/* endpointech.

import { Injectable, ExecutionContext } from '@nestjs/common';
import { ThrottlerGuard, type ThrottlerLimitDetail } from '@nestjs/throttler';
import type { Request } from 'express';

@Injectable()
export class ApiKeyThrottlerGuard extends ThrottlerGuard {
  protected override async getTracker(req: Request): Promise<string> {
    // Pokud je nastaveny apiKey (ApiKeyGuard běžel dřív), klíčuj jím.
    // Jinak fallback na IP (např. pokud guard běží mimo external endpoints).
    if (req.apiKey?.id) {
      return `apikey:${req.apiKey.id}`;
    }
    return req.ip ?? 'unknown';
  }

  protected override throwThrottlingException(
    _context: ExecutionContext,
    _details: ThrottlerLimitDetail,
  ): Promise<void> {
    return Promise.reject(new Error('Rate limit exceeded. Try again later.'));
  }
}
