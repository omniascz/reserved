// AuthService — orchestruje:
//   - register: vytvoří tenant + owner user + default branch + onboarding_checklist
//                v jedné transakci (saga). Hash hesla argon2id.
//   - login:    ověří email+password, vrátí access + refresh token pair,
//                vytvoří user_session (refresh token family).
//   - refresh:  rotace refresh tokenu (každý refresh = nový jti, stejná family).
//                Detekce reuse → revoke celé family + force re-login.
//   - logout:   označí session jako revoked.

import { ConflictException, Inject, Injectable, UnauthorizedException } from '@nestjs/common';
import { eq, and } from 'drizzle-orm';
import { schema } from '@reserved/db';
import { serviceContext } from '@reserved/rls-multitenancy';
import { randomUUID } from 'node:crypto';
import { DbService } from '../db/db.service.js';
import { JwtService } from './jwt.service.js';
import { AuthError } from './auth.errors.js';
import { hashPassword, verifyPassword } from './password.js';
import type { RegisterDto } from './dto/register.dto.js';
import type { LoginDto } from './dto/login.dto.js';
import type { TokenPair } from './auth.types.js';

@Injectable()
export class AuthService {
  constructor(
    @Inject(DbService) private readonly dbService: DbService,
    @Inject(JwtService) private readonly jwt: JwtService,
  ) {}

  // ---------------------------------------------------------------------------
  // register: nový tenant + owner user + default branch + onboarding_checklist
  // ---------------------------------------------------------------------------
  async register(dto: RegisterDto): Promise<{
    tenantId: string;
    userId: string;
    tokens: TokenPair;
  }> {
    const passwordHash = await hashPassword(dto.password);
    const family = randomUUID();

    return this.dbService.withRlsContext(serviceContext(), async (tx) => {
      // Slug musí být unikátní
      const existing = await tx
        .select({ id: schema.tenants.id })
        .from(schema.tenants)
        .where(eq(schema.tenants.slug, dto.tenantSlug))
        .limit(1);
      if (existing.length > 0) {
        throw new ConflictException({
          error: {
            code: 'TENANT_SLUG_TAKEN',
            message: `Slug "${dto.tenantSlug}" je již obsazen, zvol jiný.`,
          },
        });
      }

      // 1. Vytvoř tenant
      const [tenant] = await tx
        .insert(schema.tenants)
        .values({
          slug: dto.tenantSlug,
          name: dto.tenantName,
          plan: 'starter',
          status: 'trial',
          locale: dto.locale,
          currency: dto.currency,
          // 14 dní trial
          trialEndsAt: new Date(Date.now() + 14 * 24 * 60 * 60 * 1000),
        })
        .returning({ id: schema.tenants.id });
      if (!tenant) throw new Error('Failed to create tenant');

      // 2. Default branch
      const [branch] = await tx
        .insert(schema.branches)
        .values({
          tenantId: tenant.id,
          name: 'Hlavní pobočka',
          slug: 'hlavni',
          country: dto.locale.endsWith('-CZ') ? 'CZ' : dto.locale.slice(-2),
          isDefault: 'true',
        })
        .returning({ id: schema.branches.id });
      if (!branch) throw new Error('Failed to create branch');

      // 3. Owner user
      const [user] = await tx
        .insert(schema.users)
        .values({
          tenantId: tenant.id,
          email: dto.email,
          passwordHash,
          firstName: dto.firstName,
          lastName: dto.lastName,
          phone: dto.phone ?? null,
          role: 'owner',
          isActive: true,
        })
        .returning({ id: schema.users.id });
      if (!user) throw new Error('Failed to create user');

      // 4. Onboarding checklist (per reserved-docs/17_onboarding_flow.md)
      await tx.insert(schema.onboardingChecklist).values({
        tenantId: tenant.id,
        emailVerified: false,
      });

      // 5. Vydej tokeny
      const access = await this.jwt.signAccessToken({
        userId: user.id,
        tenantId: tenant.id,
        role: 'owner',
        customRoleId: null,
        branchIds: [branch.id],
      });

      const refresh = await this.jwt.signRefreshToken(user.id, family);

      // 6. Persistuj session (refresh token tracking)
      await tx.insert(schema.userSessions).values({
        tenantId: tenant.id,
        userId: user.id,
        family,
        refreshTokenJti: refresh.jti,
        expiresAt: new Date(Date.now() + 30 * 24 * 60 * 60 * 1000), // 30 dní
      });

      return {
        tenantId: tenant.id,
        userId: user.id,
        tokens: {
          accessToken: access.token,
          refreshToken: refresh.token,
          expiresIn: access.expiresIn,
        },
      };
    });
  }

  // ---------------------------------------------------------------------------
  // login: ověří heslo + vydá tokeny pro daný tenant
  // ---------------------------------------------------------------------------
  async login(tenantId: string, dto: LoginDto): Promise<TokenPair> {
    const result = await this.dbService.withRlsContext(serviceContext(), async (tx) => {
      const rows = await tx
        .select()
        .from(schema.users)
        .where(and(eq(schema.users.tenantId, tenantId), eq(schema.users.email, dto.email)))
        .limit(1);
      const user = rows[0];

      if (!user || !user.passwordHash || !user.isActive) {
        // Konstantní timing — vždy ověř hash, i když user neexistuje, abychom
        // nezveřejnili existenci e-mailu přes side channel.
        await verifyPassword('$argon2id$v=19$m=19456,t=2,p=1$dummy$dummy', dto.password).catch(
          () => false,
        );
        throw new UnauthorizedException({
          error: { code: 'INVALID_CREDENTIALS', message: 'Špatný email nebo heslo.' },
        });
      }

      const ok = await verifyPassword(user.passwordHash, dto.password);
      if (!ok) {
        throw new UnauthorizedException({
          error: { code: 'INVALID_CREDENTIALS', message: 'Špatný email nebo heslo.' },
        });
      }

      // Update last_login_at
      await tx
        .update(schema.users)
        .set({ lastLoginAt: new Date() })
        .where(eq(schema.users.id, user.id));

      const family = randomUUID();
      const access = await this.jwt.signAccessToken({
        userId: user.id,
        tenantId: user.tenantId,
        role: user.role as 'owner' | 'manager' | 'employee' | 'receptionist',
        customRoleId: user.customRoleId,
        branchIds: [], // TODO: na základě employee_branches v sprintu 1.3
      });
      const refresh = await this.jwt.signRefreshToken(user.id, family);

      await tx.insert(schema.userSessions).values({
        tenantId: user.tenantId,
        userId: user.id,
        family,
        refreshTokenJti: refresh.jti,
        expiresAt: new Date(Date.now() + 30 * 24 * 60 * 60 * 1000),
      });

      return {
        accessToken: access.token,
        refreshToken: refresh.token,
        expiresIn: access.expiresIn,
      };
    });

    return result;
  }

  // ---------------------------------------------------------------------------
  // refresh: rotace tokenu. Detekce reuse → revoke celé family.
  // ---------------------------------------------------------------------------
  async refresh(refreshToken: string): Promise<TokenPair> {
    const payload = await this.jwt.verifyRefreshToken(refreshToken).catch(() => {
      throw new UnauthorizedException({
        error: { code: 'TOKEN_INVALID', message: 'Refresh token je neplatný.' },
      });
    });

    return this.dbService.withRlsContext(serviceContext(), async (tx) => {
      const rows = await tx
        .select()
        .from(schema.userSessions)
        .where(
          and(
            eq(schema.userSessions.userId, payload.sub),
            eq(schema.userSessions.family, payload.family),
          ),
        )
        .orderBy(schema.userSessions.createdAt)
        .limit(50);

      const current = rows.find((r) => r.refreshTokenJti === payload.jti && !r.isRevoked);

      if (!current) {
        // Reuse detection: známá family, ale jti se nezhoduje → někdo opakuje starý token.
        // Revoke celé family.
        if (rows.some((r) => r.family === payload.family)) {
          await tx
            .update(schema.userSessions)
            .set({ isRevoked: true, revokedAt: new Date(), revokedReason: 'reuse_detected' })
            .where(eq(schema.userSessions.family, payload.family));
        }
        throw new AuthError('TOKEN_INVALID', 'Refresh token reuse detected.');
      }

      if (current.expiresAt.getTime() < Date.now()) {
        throw new AuthError('TOKEN_EXPIRED');
      }

      // Načti usera pro role + branchIds
      const userRows = await tx
        .select()
        .from(schema.users)
        .where(eq(schema.users.id, current.userId))
        .limit(1);
      const user = userRows[0];
      if (!user || !user.isActive) {
        throw new AuthError('TOKEN_INVALID', 'User not found or inactive.');
      }

      // Vydej nový pár
      const access = await this.jwt.signAccessToken({
        userId: user.id,
        tenantId: user.tenantId,
        role: user.role as 'owner' | 'manager' | 'employee' | 'receptionist',
        customRoleId: user.customRoleId,
        branchIds: [],
      });
      const newRefresh = await this.jwt.signRefreshToken(user.id, current.family);

      // Mark old session as rotated, insert new session row
      await tx
        .update(schema.userSessions)
        .set({ isRevoked: true, revokedAt: new Date(), revokedReason: 'rotated' })
        .where(eq(schema.userSessions.id, current.id));

      await tx.insert(schema.userSessions).values({
        tenantId: user.tenantId,
        userId: user.id,
        family: current.family,
        refreshTokenJti: newRefresh.jti,
        expiresAt: current.expiresAt, // family expiry zachovává původní deadline
      });

      return {
        accessToken: access.token,
        refreshToken: newRefresh.token,
        expiresIn: access.expiresIn,
      };
    });
  }

  // ---------------------------------------------------------------------------
  // logout: revoke všechny session pro daný refresh token
  // ---------------------------------------------------------------------------
  async logout(refreshToken: string): Promise<void> {
    const payload = await this.jwt.verifyRefreshToken(refreshToken).catch(() => null);
    if (!payload) return; // Idempotent — neplatný token = už odhlášeno

    await this.dbService.withRlsContext(serviceContext(), async (tx) => {
      await tx
        .update(schema.userSessions)
        .set({ isRevoked: true, revokedAt: new Date(), revokedReason: 'logout' })
        .where(eq(schema.userSessions.family, payload.family));
    });
  }
}
