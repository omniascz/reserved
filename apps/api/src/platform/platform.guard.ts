// PlatformGuard — chrání /platform/* endpointy. Verifikuje platform JWT
// (audience `reserved-api-platform`) a attachne adminId na request.

import { CanActivate, ExecutionContext, Inject, Injectable } from '@nestjs/common';
import type { Request } from 'express';
import { AuthError } from '../auth/auth.errors.js';
import { PlatformJwtService, type PlatformAccessPayload } from './platform-jwt.service.js';

declare module 'express' {
  interface Request {
    platformAuth?: PlatformAccessPayload;
  }
}

@Injectable()
export class PlatformGuard implements CanActivate {
  constructor(@Inject(PlatformJwtService) private readonly jwt: PlatformJwtService) {}

  // Pozn.: tento guard NEctie @Public() metadata — pouziva se jen na endpointech,
  // ktere ho explicitne uvedou pres @UseGuards(PlatformGuard). @Public() je
  // urceno pro opt-out z globalniho JwtGuardu, ne pro PlatformGuard.
  async canActivate(ctx: ExecutionContext): Promise<boolean> {
    const req = ctx.switchToHttp().getRequest<Request>();
    const header = req.headers.authorization;

    if (!header || !header.startsWith('Bearer ')) {
      throw new AuthError('TOKEN_MISSING', 'Chybi prihlasovaci token.');
    }

    const token = header.slice('Bearer '.length).trim();
    if (!token) throw new AuthError('TOKEN_MISSING');

    req.platformAuth = await this.jwt.verifyAccessToken(token);
    return true;
  }
}
