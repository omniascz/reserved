// JWT Guard — extrahuje Bearer token z Authorization headeru, verifikuje, attachne payload.
//
// Adapted from tixly/jwt-auth/middleware.ts (Edge middleware) — přepracováno na NestJS Guard.
// K6 fix preserved: Guard chrání endpoint, individuální controllery NEMUSÍ kontrolovat token.
// Veřejné endpointy musí explicitně použít @Public() dekorátor.

import { CanActivate, ExecutionContext, Injectable } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import type { Request } from 'express';
import { AuthError } from './auth.errors.js';
import { JwtService } from './jwt.service.js';
import type { AccessTokenPayload } from './auth.types.js';
import { IS_PUBLIC_KEY } from './decorators/public.decorator.js';

declare module 'express' {
  interface Request {
    auth?: AccessTokenPayload;
  }
}

@Injectable()
export class JwtGuard implements CanActivate {
  constructor(
    private readonly jwt: JwtService,
    private readonly reflector: Reflector,
  ) {}

  async canActivate(ctx: ExecutionContext): Promise<boolean> {
    const isPublic = this.reflector.getAllAndOverride<boolean>(IS_PUBLIC_KEY, [
      ctx.getHandler(),
      ctx.getClass(),
    ]);
    if (isPublic) {
      return true;
    }

    const req = ctx.switchToHttp().getRequest<Request>();
    const header = req.headers.authorization;

    if (!header || !header.startsWith('Bearer ')) {
      throw new AuthError('TOKEN_MISSING', 'Authorization header is missing or malformed');
    }

    const token = header.slice('Bearer '.length).trim();
    if (!token) {
      throw new AuthError('TOKEN_MISSING');
    }

    req.auth = await this.jwt.verifyAccessToken(token);
    return true;
  }
}
