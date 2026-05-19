import { createParamDecorator, ExecutionContext } from '@nestjs/common';
import type { Request } from 'express';
import type { PlatformAccessPayload } from '../platform-jwt.service.js';

/**
 * @CurrentPlatformAdmin() — extrahuje platform admin payload z requestu.
 *
 * Pouzitelne pouze v handlerech chranenych PlatformGuard. Pro @Public()
 * endpointy je payload undefined.
 */
export const CurrentPlatformAdmin = createParamDecorator(
  (_data: unknown, ctx: ExecutionContext): PlatformAccessPayload | undefined => {
    const req = ctx.switchToHttp().getRequest<Request>();
    return req.platformAuth;
  },
);
