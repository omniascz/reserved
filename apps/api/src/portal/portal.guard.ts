// PortalGuard — chrání /portal/* endpointy. Verifikuje portal JWT (audience
// `reserved-portal`) a attachne customerId + tenantId na request.

import { CanActivate, ExecutionContext, Inject, Injectable } from '@nestjs/common';
import type { Request } from 'express';
import { AuthError } from '../auth/auth.errors.js';
import { PortalJwtService, type PortalAccessPayload } from './portal-jwt.service.js';

declare module 'express' {
  interface Request {
    portalAuth?: PortalAccessPayload;
  }
}

@Injectable()
export class PortalGuard implements CanActivate {
  constructor(@Inject(PortalJwtService) private readonly jwt: PortalJwtService) {}

  // Pozn.: tento guard NEctie @Public() metadata — @Public() je urceno pouze
  // pro opt-out z globalniho JwtGuardu, ne pro PortalGuard. Endpointy ktere
  // explicitne pouziji @UseGuards(PortalGuard) vzdy chteji ovrit portal token.
  async canActivate(ctx: ExecutionContext): Promise<boolean> {
    const req = ctx.switchToHttp().getRequest<Request>();
    const header = req.headers.authorization;

    if (!header || !header.startsWith('Bearer ')) {
      throw new AuthError('TOKEN_MISSING', 'Chybí přihlašovací token.');
    }

    const token = header.slice('Bearer '.length).trim();
    if (!token) throw new AuthError('TOKEN_MISSING');

    req.portalAuth = await this.jwt.verifyAccessToken(token);
    return true;
  }
}
