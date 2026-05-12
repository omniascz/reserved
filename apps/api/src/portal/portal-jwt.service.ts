// PortalJwtService — vlastní JWT pro portál zákazníků.
//
// Oddělená audience claim (`reserved-portal`) od admin tokenů (`reserved-api`)
// — admin token nemůže přistoupit k /portal endpointům a opačně.

import { Inject, Injectable } from '@nestjs/common';
import { SignJWT, jwtVerify, type JWTPayload } from 'jose';
import { randomUUID } from 'node:crypto';
import { AuthConfig } from '../auth/auth.config.js';
import { AuthError } from '../auth/auth.errors.js';

const ALGORITHM = 'HS256';
const PORTAL_AUDIENCE_SUFFIX = '-portal';

export interface PortalAccessPayload {
  /** customer.id */
  sub: string;
  tenantId: string;
  iat: number;
  exp: number;
  jti: string;
}

export interface PortalRefreshPayload {
  sub: string;
  family: string;
  jti: string;
  iat: number;
  exp: number;
}

@Injectable()
export class PortalJwtService {
  constructor(@Inject(AuthConfig) private readonly config: AuthConfig) {}

  private get audience(): string {
    return `${this.config.audience}${PORTAL_AUDIENCE_SUFFIX}`;
  }

  async signAccessToken(input: {
    customerId: string;
    tenantId: string;
  }): Promise<{ token: string; jti: string; expiresIn: number }> {
    const jti = randomUUID();
    const now = Math.floor(Date.now() / 1000);
    const exp = now + this.config.accessTtl;

    const token = await new SignJWT({ tenantId: input.tenantId, jti })
      .setProtectedHeader({ alg: ALGORITHM })
      .setSubject(input.customerId)
      .setIssuedAt(now)
      .setExpirationTime(exp)
      .setIssuer(this.config.issuer)
      .setAudience(this.audience)
      .sign(this.config.secret);

    return { token, jti, expiresIn: this.config.accessTtl };
  }

  async signRefreshToken(
    customerId: string,
    family: string,
  ): Promise<{ token: string; jti: string }> {
    const jti = randomUUID();
    const now = Math.floor(Date.now() / 1000);

    const token = await new SignJWT({ family, jti })
      .setProtectedHeader({ alg: ALGORITHM })
      .setSubject(customerId)
      .setIssuedAt(now)
      .setExpirationTime(now + this.config.refreshTtl)
      .setIssuer(this.config.issuer)
      .setAudience(this.audience)
      .sign(this.config.secret);

    return { token, jti };
  }

  async verifyAccessToken(token: string): Promise<PortalAccessPayload> {
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

  async verifyRefreshToken(token: string): Promise<PortalRefreshPayload> {
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

  private extractAccessPayload(payload: JWTPayload): PortalAccessPayload {
    const { sub, tenantId, iat, exp, jti } = payload as JWTPayload & { tenantId: unknown };
    if (
      typeof sub !== 'string' ||
      typeof tenantId !== 'string' ||
      typeof iat !== 'number' ||
      typeof exp !== 'number' ||
      typeof jti !== 'string'
    ) {
      throw new AuthError('TOKEN_INVALID');
    }
    return { sub, tenantId, iat, exp, jti };
  }

  private extractRefreshPayload(payload: JWTPayload): PortalRefreshPayload {
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
