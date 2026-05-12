// PortalGuard — chrání /portal/* endpointy. Verifikuje portal JWT (audience
// `reserved-portal`) a attachne customerId + tenantId na request.

import { CanActivate, ExecutionContext, Injectable } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import type { Request } from 'express';
import { AuthError } from '../auth/auth.errors.js';
import { IS_PUBLIC_KEY } from '../auth/decorators/public.decorator.js';
import { PortalJwtService, type PortalAccessPayload } from './portal-jwt.service.js';

declare module 'express' {
  interface Request {
    portalAuth?: PortalAccessPayload;
  }
}

@Injectable()
export class PortalGuard implements CanActivate {
  constructor(
    private readonly jwt: PortalJwtService,
    private readonly reflector: Reflector,
  ) {}

  async canActivate(ctx: ExecutionContext): Promise<boolean> {
    const isPublic = this.reflector.getAllAndOverride<boolean>(IS_PUBLIC_KEY, [
      ctx.getHandler(),
      ctx.getClass(),
    ]);
    if (isPublic) return true;

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
