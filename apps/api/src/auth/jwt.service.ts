// Adapted from tixly/jwt-auth/services/jwt.service.ts on 2026-05-10
// Změny vs. tixly:
//   - NestJS @Injectable s DI místo modulu funkcí
//   - Reserved payload: tenantId, role, customRoleId, branchIds (místo isAdmin)
//   - Konfigurace z AuthConfig (Zod-validated env), ne přímé čtení process.env
//   - jose import zachován, HS256 algorithm

import { Inject, Injectable } from '@nestjs/common';
import { SignJWT, jwtVerify, type JWTPayload } from 'jose';
import { randomUUID } from 'node:crypto';
import { APP_ROLES, type AppRole } from '@reserved/rls-multitenancy';
import { AuthConfig } from './auth.config.js';
import { AuthError } from './auth.errors.js';
import type { AccessTokenPayload, RefreshTokenPayload } from './auth.types.js';

const ALGORITHM = 'HS256';

export interface SignAccessTokenInput {
  userId: string;
  tenantId: string;
  role: AppRole;
  customRoleId: string | null;
  branchIds: string[];
  /** UUID master admina pokud token vznikl impersonaci. Jinak undefined. */
  impersonatedBy?: string;
  /** Override TTL v sekundach. Pouziva se napr. pro impersonation tokeny (short-lived). */
  ttlOverrideSeconds?: number;
}

@Injectable()
export class JwtService {
  constructor(@Inject(AuthConfig) private readonly config: AuthConfig) {}

  async signAccessToken(
    input: SignAccessTokenInput,
  ): Promise<{ token: string; jti: string; expiresIn: number }> {
    const jti = randomUUID();
    const now = Math.floor(Date.now() / 1000);
    const ttl = input.ttlOverrideSeconds ?? this.config.accessTtl;
    const exp = now + ttl;

    const claims: Record<string, unknown> = {
      tenantId: input.tenantId,
      role: input.role,
      customRoleId: input.customRoleId,
      branchIds: input.branchIds,
      jti,
    };
    if (input.impersonatedBy) {
      claims.impersonatedBy = input.impersonatedBy;
    }

    const token = await new SignJWT(claims)
      .setProtectedHeader({ alg: ALGORITHM })
      .setSubject(input.userId)
      .setIssuedAt(now)
      .setExpirationTime(exp)
      .setIssuer(this.config.issuer)
      .setAudience(this.config.audience)
      .sign(this.config.secret);

    return { token, jti, expiresIn: ttl };
  }

  async signRefreshToken(userId: string, family: string): Promise<{ token: string; jti: string }> {
    const jti = randomUUID();
    const now = Math.floor(Date.now() / 1000);

    const token = await new SignJWT({ family, jti })
      .setProtectedHeader({ alg: ALGORITHM })
      .setSubject(userId)
      .setIssuedAt(now)
      .setExpirationTime(now + this.config.refreshTtl)
      .setIssuer(this.config.issuer)
      .setAudience(this.config.audience)
      .sign(this.config.secret);

    return { token, jti };
  }

  async verifyAccessToken(token: string): Promise<AccessTokenPayload> {
    try {
      const { payload } = await jwtVerify(token, this.config.secret, {
        algorithms: [ALGORITHM],
        issuer: this.config.issuer,
        audience: this.config.audience,
      });
      return this.extractAccessPayload(payload);
    } catch (err: unknown) {
      if (err instanceof Error && err.name === 'JWTExpired') {
        throw new AuthError('TOKEN_EXPIRED');
      }
      throw new AuthError('TOKEN_INVALID');
    }
  }

  async verifyRefreshToken(token: string): Promise<RefreshTokenPayload> {
    try {
      const { payload } = await jwtVerify(token, this.config.secret, {
        algorithms: [ALGORITHM],
        issuer: this.config.issuer,
        audience: this.config.audience,
      });
      return this.extractRefreshPayload(payload);
    } catch (err: unknown) {
      if (err instanceof Error && err.name === 'JWTExpired') {
        throw new AuthError('TOKEN_EXPIRED');
      }
      throw new AuthError('TOKEN_INVALID');
    }
  }

  private extractAccessPayload(payload: JWTPayload): AccessTokenPayload {
    const { sub, tenantId, role, customRoleId, branchIds, impersonatedBy, iat, exp, jti } =
      payload as JWTPayload & {
        tenantId: unknown;
        role: unknown;
        customRoleId: unknown;
        branchIds: unknown;
        impersonatedBy?: unknown;
      };

    if (
      typeof sub !== 'string' ||
      typeof tenantId !== 'string' ||
      typeof role !== 'string' ||
      typeof iat !== 'number' ||
      typeof exp !== 'number' ||
      typeof jti !== 'string'
    ) {
      throw new AuthError('TOKEN_INVALID');
    }

    if (!(APP_ROLES as readonly string[]).includes(role)) {
      throw new AuthError('TOKEN_INVALID', `Unknown role in token: ${role}`);
    }

    if (customRoleId !== null && typeof customRoleId !== 'string') {
      throw new AuthError('TOKEN_INVALID');
    }

    if (!Array.isArray(branchIds) || branchIds.some((b) => typeof b !== 'string')) {
      throw new AuthError('TOKEN_INVALID');
    }

    if (impersonatedBy !== undefined && typeof impersonatedBy !== 'string') {
      throw new AuthError('TOKEN_INVALID');
    }

    return {
      sub,
      tenantId,
      role: role as AppRole,
      customRoleId: customRoleId as string | null,
      branchIds: branchIds as string[],
      impersonatedBy: (impersonatedBy as string | undefined) ?? null,
      iat,
      exp,
      jti,
    };
  }

  private extractRefreshPayload(payload: JWTPayload): RefreshTokenPayload {
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
