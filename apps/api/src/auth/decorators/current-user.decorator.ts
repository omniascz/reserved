// @CurrentUser() — extrakce ověřeného JWT payloadu v controlleru.
// Vyžaduje, aby JwtGuard běžel před tímto decorátorem (v NestJS pořadí je Guard < Pipe < Decorator).

import { createParamDecorator, ExecutionContext } from '@nestjs/common';
import type { Request } from 'express';
import type { AccessTokenPayload } from '../auth.types.js';

export const CurrentUser = createParamDecorator(
  (_data: unknown, ctx: ExecutionContext): AccessTokenPayload => {
    const req = ctx.switchToHttp().getRequest<Request>();
    if (!req.auth) {
      throw new Error(
        'CurrentUser used on a route without JwtGuard. Did you forget @UseGuards or @Public?',
      );
    }
    return req.auth;
  },
);
