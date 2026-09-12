// ApiKeyGuard — chrání /external/v1/* endpointy. Verifikuje Authorization:
// Bearer rsk_* token, attachne tenantId a scopes na request.

import { CanActivate, ExecutionContext, Inject, Injectable } from '@nestjs/common';
import type { Request } from 'express';
import { AuthError } from '../auth/auth.errors.js';
import { ApiKeysService } from './api-keys.service.js';
import type { ApiKeyScope } from '@reserved/db';

declare module 'express' {
  interface Request {
    apiKey?: {
      id: string;
      tenantId: string;
      scopes: ApiKeyScope[];
    };
  }
}

@Injectable()
export class ApiKeyGuard implements CanActivate {
  constructor(@Inject(ApiKeysService) private readonly apiKeys: ApiKeysService) {}

  async canActivate(ctx: ExecutionContext): Promise<boolean> {
    const req = ctx.switchToHttp().getRequest<Request>();
    const header = req.headers.authorization;

    if (!header || !header.startsWith('Bearer ')) {
      throw new AuthError('TOKEN_MISSING', 'Chybi Authorization: Bearer rsk_xxx header.');
    }

    const rawKey = header.slice('Bearer '.length).trim();
    if (!rawKey.startsWith('rsk_')) {
      throw new AuthError('TOKEN_INVALID', 'Klic musi zacinat prefixem "rsk_".');
    }

    const key = await this.apiKeys.findValidByRawKey(rawKey);
    if (!key) {
      throw new AuthError('TOKEN_INVALID', 'Klic je neplatny, zneplatneny nebo expirovany.');
    }

    req.apiKey = key;
    return true;
  }
}

/**
 * Helper: zkontroluje, že klíč má požadovaný scope. '*' wildcard prochází vše.
 */
export function requireScope(
  apiKey: { scopes: ApiKeyScope[] } | undefined,
  required: ApiKeyScope,
): void {
  if (!apiKey) {
    throw new AuthError('TOKEN_MISSING');
  }
  if (apiKey.scopes.includes('*') || apiKey.scopes.includes(required)) {
    return;
  }
  throw new AuthError('INSUFFICIENT_ROLE', `Klic nema scope "${required}".`);
}
