// PortalAuthService — auth flow pro zákazníky portálu.
//
// Magic-link flow:
//   1. requestMagicLink: ulož hash tokenu do customer_magic_links, pošli e-mail
//   2. verifyMagicLink:  ověř token (hash + nespotřebovaný + neexpirovaný),
//                        vytvoř/najdi customera, vydej JWT pár, mark token as consumed
//
// Password flow:
//   1. login: ověř email+heslo, vydej JWT pár
//   2. setPassword: po prvním magic-link loginu může zákazník nastavit heslo

import { Inject, Injectable, Logger, UnauthorizedException } from '@nestjs/common';
import { and, eq, isNull } from 'drizzle-orm';
import { schema } from '@reserved/db';
import { serviceContext } from '@reserved/rls-multitenancy';
import { createHash, randomBytes, randomUUID } from 'node:crypto';
import { DbService } from '../db/db.service.js';
import { EmailService } from '../email/email.service.js';
import { hashPassword, verifyPassword } from '../auth/password.js';
import { AuthError } from '../auth/auth.errors.js';
import { PortalJwtService } from './portal-jwt.service.js';
import type { RequestMagicLinkDto, PortalLoginDto, SetPasswordDto } from './dto/portal-auth.dto.js';
import type { TokenPair } from '../auth/auth.types.js';

const MAGIC_LINK_TTL_MIN = 15;
const REFRESH_TTL_DAYS = 30;

@Injectable()
export class PortalAuthService {
  private readonly logger = new Logger('PortalAuthService');

  constructor(
    @Inject(DbService) private readonly dbService: DbService,
    @Inject(EmailService) private readonly email: EmailService,
    @Inject(PortalJwtService) private readonly jwt: PortalJwtService,
  ) {}

  // ---------------------------------------------------------------------------
  // 1. Request magic-link: vygeneruj token, pošli e-mail
  // ---------------------------------------------------------------------------
  async requestMagicLink(
    tenantId: string,
    dto: RequestMagicLinkDto,
    ctx: { ip?: string; ua?: string; portalBaseUrl: string },
  ): Promise<{ sent: true }> {
    const rawToken = randomBytes(32).toString('hex'); // 64 chars
    const tokenHash = sha256(rawToken);
    const expiresAt = new Date(Date.now() + MAGIC_LINK_TTL_MIN * 60_000);

    await this.dbService.withRlsContext(serviceContext(tenantId), async (tx) => {
      // Najdi existujícího customera (pokud existuje)
      const [existing] = await tx
        .select({
          id: schema.customers.id,
          firstName: schema.customers.firstName,
          lastName: schema.customers.lastName,
        })
        .from(schema.customers)
        .where(and(eq(schema.customers.tenantId, tenantId), eq(schema.customers.email, dto.email)))
        .limit(1);

      await tx.insert(schema.customerMagicLinks).values({
        tenantId,
        customerId: existing?.id ?? null,
        email: dto.email,
        tokenHash,
        purpose: 'login',
        expiresAt,
        requestedIp: ctx.ip ?? null,
        requestedUa: ctx.ua ?? null,
      });

      // Načti tenant name pro email
      const [tenant] = await tx
        .select({ name: schema.tenants.name })
        .from(schema.tenants)
        .where(eq(schema.tenants.id, tenantId))
        .limit(1);

      const customerName = existing
        ? `${existing.firstName} ${existing.lastName}`.trim()
        : (dto.firstName ?? 'Zákazník');

      const url = `${ctx.portalBaseUrl}/verify?token=${rawToken}`;

      await this.email.enqueue({
        tenantId,
        templateCode: 'magic_link',
        recipient: dto.email,
        vars: {
          customerName,
          tenantName: tenant?.name ?? 'Reserved',
          magicLinkUrl: url,
          expiresInMinutes: MAGIC_LINK_TTL_MIN,
        },
      });
    });

    return { sent: true };
  }

  // ---------------------------------------------------------------------------
  // 2. Verify magic-link: konzumuj token + vydej JWT
  // ---------------------------------------------------------------------------
  async verifyMagicLink(
    tenantId: string,
    rawToken: string,
    metadata?: { firstName?: string; lastName?: string },
  ): Promise<TokenPair> {
    const tokenHash = sha256(rawToken);

    return this.dbService.withRlsContext(serviceContext(tenantId), async (tx) => {
      const [link] = await tx
        .select()
        .from(schema.customerMagicLinks)
        .where(
          and(
            eq(schema.customerMagicLinks.tenantId, tenantId),
            eq(schema.customerMagicLinks.tokenHash, tokenHash),
            isNull(schema.customerMagicLinks.consumedAt),
          ),
        )
        .limit(1);

      if (!link) {
        throw new AuthError('TOKEN_INVALID', 'Odkaz je neplatný nebo již byl použit.');
      }
      if (link.expiresAt.getTime() < Date.now()) {
        throw new AuthError('TOKEN_EXPIRED', 'Odkaz vypršel. Požádej o nový.');
      }

      // Najdi nebo vytvoř customera (auto-provision při prvním loginu)
      let customerId = link.customerId;
      if (!customerId) {
        const [existingByEmail] = await tx
          .select({ id: schema.customers.id })
          .from(schema.customers)
          .where(
            and(eq(schema.customers.tenantId, tenantId), eq(schema.customers.email, link.email)),
          )
          .limit(1);

        if (existingByEmail) {
          customerId = existingByEmail.id;
        } else {
          // Auto-vytvoř customera
          const [created] = await tx
            .insert(schema.customers)
            .values({
              tenantId,
              email: link.email,
              firstName: metadata?.firstName ?? 'Host',
              lastName: metadata?.lastName ?? '',
              emailVerifiedAt: new Date(),
            })
            .returning({ id: schema.customers.id });
          if (!created) throw new Error('Failed to create customer');
          customerId = created.id;
        }
      }

      // Mark token as consumed + email verified + last login
      await tx
        .update(schema.customerMagicLinks)
        .set({ consumedAt: new Date(), customerId })
        .where(eq(schema.customerMagicLinks.id, link.id));

      await tx
        .update(schema.customers)
        .set({
          emailVerifiedAt: new Date(),
          lastLoginAt: new Date(),
        })
        .where(eq(schema.customers.id, customerId));

      return this.issueTokens(tx, tenantId, customerId);
    });
  }

  // ---------------------------------------------------------------------------
  // 3. Password login
  // ---------------------------------------------------------------------------
  async login(tenantId: string, dto: PortalLoginDto): Promise<TokenPair> {
    return this.dbService.withRlsContext(serviceContext(tenantId), async (tx) => {
      const [customer] = await tx
        .select()
        .from(schema.customers)
        .where(and(eq(schema.customers.tenantId, tenantId), eq(schema.customers.email, dto.email)))
        .limit(1);

      if (!customer || !customer.passwordHash || !customer.isActive) {
        // Konstantní timing
        await verifyPassword('$argon2id$v=19$m=19456,t=2,p=1$ZHVtbXk$ZHVtbXk', dto.password).catch(
          () => false,
        );
        throw new UnauthorizedException({
          error: { code: 'INVALID_CREDENTIALS', message: 'Špatný e-mail nebo heslo.' },
        });
      }

      const ok = await verifyPassword(customer.passwordHash, dto.password);
      if (!ok) {
        throw new UnauthorizedException({
          error: { code: 'INVALID_CREDENTIALS', message: 'Špatný e-mail nebo heslo.' },
        });
      }

      await tx
        .update(schema.customers)
        .set({ lastLoginAt: new Date() })
        .where(eq(schema.customers.id, customer.id));

      return this.issueTokens(tx, tenantId, customer.id);
    });
  }

  // ---------------------------------------------------------------------------
  // 4. Set password (authorized — zákazník už je přihlášen)
  // ---------------------------------------------------------------------------
  async setPassword(tenantId: string, customerId: string, dto: SetPasswordDto): Promise<void> {
    const hash = await hashPassword(dto.password);

    await this.dbService.withRlsContext(serviceContext(tenantId), async (tx) => {
      const [customer] = await tx
        .select({ firstName: schema.customers.firstName, email: schema.customers.email })
        .from(schema.customers)
        .where(eq(schema.customers.id, customerId))
        .limit(1);
      if (!customer) throw new AuthError('TOKEN_INVALID');

      await tx
        .update(schema.customers)
        .set({ passwordHash: hash, updatedAt: new Date() })
        .where(eq(schema.customers.id, customerId));

      const [tenant] = await tx
        .select({ name: schema.tenants.name })
        .from(schema.tenants)
        .where(eq(schema.tenants.id, tenantId))
        .limit(1);

      await this.email.enqueue({
        tenantId,
        templateCode: 'password_set_confirm',
        recipient: customer.email,
        vars: {
          customerName: customer.firstName,
          tenantName: tenant?.name ?? 'Reserved',
        },
      });
    });
  }

  // ---------------------------------------------------------------------------
  // 5. Refresh
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
        .from(schema.customerSessions)
        .where(eq(schema.customerSessions.family, payload.family))
        .limit(50);

      const current = rows.find((r) => r.refreshTokenJti === payload.jti && !r.isRevoked);
      if (!current) {
        if (rows.length > 0) {
          await tx
            .update(schema.customerSessions)
            .set({ isRevoked: true, revokedAt: new Date(), revokedReason: 'reuse_detected' })
            .where(eq(schema.customerSessions.family, payload.family));
        }
        throw new AuthError('TOKEN_INVALID', 'Refresh token reuse detected.');
      }
      if (current.expiresAt.getTime() < Date.now()) {
        throw new AuthError('TOKEN_EXPIRED');
      }

      const access = await this.jwt.signAccessToken({
        customerId: current.customerId,
        tenantId: current.tenantId,
      });
      const newRefresh = await this.jwt.signRefreshToken(current.customerId, current.family);

      await tx
        .update(schema.customerSessions)
        .set({ isRevoked: true, revokedAt: new Date(), revokedReason: 'rotated' })
        .where(eq(schema.customerSessions.id, current.id));

      await tx.insert(schema.customerSessions).values({
        tenantId: current.tenantId,
        customerId: current.customerId,
        family: current.family,
        refreshTokenJti: newRefresh.jti,
        expiresAt: current.expiresAt,
      });

      return {
        accessToken: access.token,
        refreshToken: newRefresh.token,
        expiresIn: access.expiresIn,
      };
    });
  }

  // ---------------------------------------------------------------------------
  // 6. Logout
  // ---------------------------------------------------------------------------
  async logout(refreshToken: string): Promise<void> {
    const payload = await this.jwt.verifyRefreshToken(refreshToken).catch(() => null);
    if (!payload) return;

    await this.dbService.withRlsContext(serviceContext(), async (tx) => {
      await tx
        .update(schema.customerSessions)
        .set({ isRevoked: true, revokedAt: new Date(), revokedReason: 'logout' })
        .where(eq(schema.customerSessions.family, payload.family));
    });
  }

  // ---------------------------------------------------------------------------
  // Internal: issue tokens + persist session
  // ---------------------------------------------------------------------------
  private async issueTokens(
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    tx: any,
    tenantId: string,
    customerId: string,
  ): Promise<TokenPair> {
    const family = randomUUID();
    const access = await this.jwt.signAccessToken({ customerId, tenantId });
    const refresh = await this.jwt.signRefreshToken(customerId, family);

    await tx.insert(schema.customerSessions).values({
      tenantId,
      customerId,
      family,
      refreshTokenJti: refresh.jti,
      expiresAt: new Date(Date.now() + REFRESH_TTL_DAYS * 24 * 60 * 60 * 1000),
    });

    return {
      accessToken: access.token,
      refreshToken: refresh.token,
      expiresIn: access.expiresIn,
    };
  }
}

function sha256(input: string): string {
  return createHash('sha256').update(input).digest('hex');
}
