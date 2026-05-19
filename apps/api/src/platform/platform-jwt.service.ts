// PlatformJwtService — JWT pro provozovatele platformy (master admin).
//
// Oddělená audience claim (`reserved-api-platform`) — admin token tenanta
// nemůže přistoupit k /platform endpointům a opačně.

import { Inject, Injectable } from '@nestjs/common';
import { SignJWT, jwtVerify, type JWTPayload } from 'jose';
import { randomUUID } from 'node:crypto';
import { AuthConfig } from '../auth/auth.config.js';
import { AuthError } from '../auth/auth.errors.js';

const ALGORITHM = 'HS256';
const PLATFORM_AUDIENCE_SUFFIX = '-platform';

export interface PlatformAccessPayload {
  /** platform_admins.id */
  sub: string;
  iat: number;
  exp: number;
  jti: string;
}

export interface PlatformRefreshPayload {
  sub: string;
  family: string;
  jti: string;
  iat: number;
  exp: number;
}

@Injectable()
export class PlatformJwtService {
  constructor(@Inject(AuthConfig) private readonly config: AuthConfig) {}

  private get audience(): string {
    return `${this.config.audience}${PLATFORM_AUDIENCE_SUFFIX}`;
  }

  async signAccessToken(input: {
    adminId: string;
  }): Promise<{ token: string; jti: string; expiresIn: number }> {
    const jti = randomUUID();
    const now = Math.floor(Date.now() / 1000);
    const exp = now + this.config.accessTtl;

    const token = await new SignJWT({ jti })
      .setProtectedHeader({ alg: ALGORITHM })
      .setSubject(input.adminId)
      .setIssuedAt(now)
      .setExpirationTime(exp)
      .setIssuer(this.config.issuer)
      .setAudience(this.audience)
      .sign(this.config.secret);

    return { token, jti, expiresIn: this.config.accessTtl };
  }

  async signRefreshToken(adminId: string, family: string): Promise<{ token: string; jti: string }> {
    const jti = randomUUID();
    const now = Math.floor(Date.now() / 1000);

    const token = await new SignJWT({ family, jti })
      .setProtectedHeader({ alg: ALGORITHM })
      .setSubject(adminId)
      .setIssuedAt(now)
      .setExpirationTime(now + this.config.refreshTtl)
      .setIssuer(this.config.issuer)
      .setAudience(this.audience)
      .sign(this.config.secret);

    return { token, jti };
  }

  async verifyAccessToken(token: string): Promise<PlatformAccessPayload> {
    try {
      const { payload } = await jwtVerify(token, this.config.secret, {
        algorithms: [ALGORITHM],
        issuer: this.config.issuer,
        audience: this.audience,
      });
      return this.extractAccessPayload(payload);
    } catch (err: unknown) {
      if (err instanceof Error && err.name === 'JWTExpired') {
        throw new AuthError('TOKEN_EXPIRED');
      }
      throw new AuthError('TOKEN_INVALID');
    }
  }

  async verifyRefreshToken(token: string): Promise<PlatformRefreshPayload> {
    try {
      const { payload } = await jwtVerify(token, this.config.secret, {
        algorithms: [ALGORITHM],
        issuer: this.config.issuer,
        audience: this.audience,
      });
      return this.extractRefreshPayload(payload);
    } catch (err: unknown) {
      if (err instanceof Error && err.name === 'JWTExpired') {
        throw new AuthError('TOKEN_EXPIRED');
      }
      throw new AuthError('TOKEN_INVALID');
    }
  }

  private extractAccessPayload(payload: JWTPayload): PlatformAccessPayload {
    const { sub, iat, exp, jti } = payload;
    if (
      typeof sub !== 'string' ||
      typeof iat !== 'number' ||
      typeof exp !== 'number' ||
      typeof jti !== 'string'
    ) {
      throw new AuthError('TOKEN_INVALID');
    }
    return { sub, iat, exp, jti };
  }

  private extractRefreshPayload(payload: JWTPayload): PlatformRefreshPayload {
    const { sub, family, jti, iat, exp } = payload as JWTPayload & { family: unknown };
    if (
      typeof sub !== 'string' ||
      typeof family !== 'string' ||
      typeof jti !== 'string' ||
      typeof iat !== 'number' ||
      typeof exp !== 'number'
    ) {
      throw new AuthError('TOKEN_INVALID');
    }
    return { sub, family, jti, iat, exp };
  }
}
