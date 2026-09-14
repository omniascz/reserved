// EmailVerificationService — ověření e-mailu administrátora (majitele tenanta).
//
// Sloupec `users.email_verified_at` existoval, ale nikdo ho nenastavoval:
// registrovat se šlo na cizí adresu. Tahle služba to uzavírá.
//
// Vzor je převzatý z magic-linku pro klienty (PortalAuthService):
//   - surový token se NIKDY neukládá, v DB je jen jeho SHA-256 otisk,
//   - jednorázovost vynucuje `consumed_at` (hledáme jen nespotřebované),
//   - platnost hlídá `expires_at`.
// Tabulka `email_verifications` už existovala (migrace 0001 + RLS 0002), jen ji
// nic nepoužívalo — žádná nová se nezakládá.

import { ForbiddenException, Inject, Injectable, Logger, NotFoundException } from '@nestjs/common';
import { createHash, randomBytes } from 'node:crypto';
import { and, desc, eq, isNull } from 'drizzle-orm';
import { schema } from '@reserved/db';
import { serviceContext } from '@reserved/rls-multitenancy';
import { nazevProduktu } from '@reserved/utils';
import { DbService } from '../db/db.service.js';
import { EmailService } from '../email/email.service.js';

/** Účel záznamu v `email_verifications` (tabulka slouží i pro reset hesla). */
const PURPOSE = 'email_confirm';

/** Platnost odkazu. Dost dlouhá, aby se dala přečíst pošta i druhý den. */
export const VERIFY_TTL_HOURS = 24;

/**
 * Minimální odstup mezi dvěma odesláními. Počítá se Z DATABÁZE (poslední
 * `created_at`), ne z paměti procesu — paměťový limiter by při běhu více
 * instancí nechránil vůbec a po restartu by se vynuloval.
 */
export const RESEND_COOLDOWN_SECONDS = 120;

function sha256(input: string): string {
  return createHash('sha256').update(input).digest('hex');
}

export interface VerificationStatus {
  verified: boolean;
  email: string;
  /** Kdy nejdřív půjde poslat znovu. null = hned. */
  canResendAt: Date | null;
}

@Injectable()
export class EmailVerificationService {
  private readonly logger = new Logger(EmailVerificationService.name);

  constructor(
    @Inject(DbService) private readonly dbService: DbService,
    @Inject(EmailService) private readonly email: EmailService,
  ) {}

  /** Základ odkazu = admin rozhraní, ne portál klientů. */
  private appUrl(): string {
    return process.env.APP_URL ?? 'http://localhost:4002';
  }

  /**
   * Vystaví nový token a pošle ověřovací e-mail.
   *
   * Vrací `sent`, protože EmailService při selhání SMTP nevyhodí výjimku — jen
   * si zapíše `failed`. Bez téhle kontroly bychom hlásili odeslaný e-mail,
   * který nikam nedošel.
   */
  async issue(
    tenantId: string,
    userId: string,
    opts: { email: string; userName: string; tenantName: string },
  ): Promise<{ sent: boolean }> {
    const rawToken = randomBytes(32).toString('hex');
    const expiresAt = new Date(Date.now() + VERIFY_TTL_HOURS * 3600_000);

    await this.dbService.withRlsContext(serviceContext(tenantId), async (tx) => {
      await tx.insert(schema.emailVerifications).values({
        tenantId,
        userId,
        purpose: PURPOSE,
        tokenHash: sha256(rawToken),
        expiresAt,
      });
    });

    const verifyUrl = `${this.appUrl()}/verify-email?token=${rawToken}`;
    const res = await this.email.enqueue({
      tenantId,
      templateCode: 'admin_email_verify',
      recipient: opts.email,
      vars: {
        userName: opts.userName,
        tenantName: opts.tenantName,
        verifyUrl,
        expiresInHours: VERIFY_TTL_HOURS,
      },
    });

    const sent = res.status === 'sent';
    if (!sent) {
      this.logger.warn(
        `Ověřovací e-mail pro ${opts.email} (tenant ${tenantId}) se nepodařilo odeslat (stav ${res.status}). Token zůstává platný, uživatel může požádat znovu.`,
      );
    }
    return { sent };
  }

  /**
   * Potvrdí adresu podle tokenu z odkazu.
   *
   * Běží BEZ tenanta — odkaz se otevírá nepřihlášeně a slug v něm není.
   * `serviceContext()` bez id proto hledá napříč tenanty; token je náhodných
   * 32 bajtů, takže uhodnout cizí nelze.
   */
  async verifyByToken(rawToken: string): Promise<{ email: string; alreadyVerified: boolean }> {
    const tokenHash = sha256(rawToken);

    return this.dbService.withRlsContext(serviceContext(), async (tx) => {
      const [row] = await tx
        .select()
        .from(schema.emailVerifications)
        .where(
          and(
            eq(schema.emailVerifications.tokenHash, tokenHash),
            eq(schema.emailVerifications.purpose, PURPOSE),
            // Jednorázovost: spotřebovaný token se sem už nedostane.
            isNull(schema.emailVerifications.consumedAt),
          ),
        )
        .limit(1);

      if (!row) {
        throw new NotFoundException({
          error: {
            code: 'TOKEN_INVALID',
            message: 'Odkaz je neplatný nebo už byl použit. Nech si poslat nový.',
          },
        });
      }

      if (row.expiresAt.getTime() < Date.now()) {
        throw new NotFoundException({
          error: {
            code: 'TOKEN_EXPIRED',
            message: 'Platnost odkazu vypršela. Nech si poslat nový.',
          },
        });
      }

      await tx
        .update(schema.emailVerifications)
        .set({ consumedAt: new Date() })
        .where(eq(schema.emailVerifications.id, row.id));

      const [user] = await tx
        .select({ email: schema.users.email, verifiedAt: schema.users.emailVerifiedAt })
        .from(schema.users)
        .where(eq(schema.users.id, row.userId))
        .limit(1);

      if (!user) {
        throw new NotFoundException({
          error: { code: 'USER_NOT_FOUND', message: 'Účet už neexistuje.' },
        });
      }

      const alreadyVerified = user.verifiedAt !== null;
      if (!alreadyVerified) {
        await tx
          .update(schema.users)
          .set({ emailVerifiedAt: new Date(), updatedAt: new Date() })
          .where(eq(schema.users.id, row.userId));
      }

      return { email: user.email, alreadyVerified };
    });
  }

  /** Stav pro žlutý pruh v adminu. */
  async status(tenantId: string, userId: string): Promise<VerificationStatus> {
    return this.dbService.withRlsContext(serviceContext(tenantId), async (tx) => {
      const [user] = await tx
        .select({ email: schema.users.email, verifiedAt: schema.users.emailVerifiedAt })
        .from(schema.users)
        .where(eq(schema.users.id, userId))
        .limit(1);

      if (!user) {
        throw new NotFoundException({
          error: { code: 'USER_NOT_FOUND', message: 'Účet nenalezen.' },
        });
      }

      return {
        verified: user.verifiedAt !== null,
        email: user.email,
        canResendAt: user.verifiedAt !== null ? null : await this.nextResendAt(tx, userId),
      };
    });
  }

  /**
   * Pošle ověřovací e-mail znovu. Chrání odstupem počítaným z databáze.
   */
  async resend(tenantId: string, userId: string): Promise<{ sent: boolean; email: string }> {
    const ctx = await this.dbService.withRlsContext(serviceContext(tenantId), async (tx) => {
      const [user] = await tx
        .select({
          email: schema.users.email,
          firstName: schema.users.firstName,
          lastName: schema.users.lastName,
          verifiedAt: schema.users.emailVerifiedAt,
        })
        .from(schema.users)
        .where(eq(schema.users.id, userId))
        .limit(1);
      if (!user) {
        throw new NotFoundException({
          error: { code: 'USER_NOT_FOUND', message: 'Účet nenalezen.' },
        });
      }

      const [tenant] = await tx
        .select({ name: schema.tenants.name })
        .from(schema.tenants)
        .where(eq(schema.tenants.id, tenantId))
        .limit(1);

      const canResendAt = await this.nextResendAt(tx, userId);
      return { user, tenantName: tenant?.name ?? nazevProduktu(), canResendAt };
    });

    if (ctx.user.verifiedAt !== null) {
      throw new ForbiddenException({
        error: { code: 'ALREADY_VERIFIED', message: 'E-mail už je ověřený.' },
      });
    }

    if (ctx.canResendAt && ctx.canResendAt.getTime() > Date.now()) {
      const zbyva = Math.ceil((ctx.canResendAt.getTime() - Date.now()) / 1000);
      throw new ForbiddenException({
        error: {
          code: 'RESEND_TOO_SOON',
          message: `E-mail jsme právě poslali. Zkus to znovu za ${zbyva} s.`,
          details: { retryAfterSeconds: zbyva },
        },
      });
    }

    const { sent } = await this.issue(tenantId, userId, {
      email: ctx.user.email,
      userName: `${ctx.user.firstName} ${ctx.user.lastName}`.trim(),
      tenantName: ctx.tenantName,
    });
    return { sent, email: ctx.user.email };
  }

  /**
   * Má tenant ověřeného majitele? Používá se pro blokaci veřejných rezervací
   * a odchozí pošty klientům.
   */
  async isTenantVerified(tenantId: string): Promise<boolean> {
    return this.dbService.withRlsContext(serviceContext(tenantId), async (tx) => {
      const [owner] = await tx
        .select({ id: schema.users.id })
        .from(schema.users)
        .where(
          and(
            eq(schema.users.tenantId, tenantId),
            eq(schema.users.role, 'owner'),
            isNull(schema.users.emailVerifiedAt),
          ),
        )
        .limit(1);
      // Nenašli jsme NEověřeného majitele → tenant je v pořádku.
      return !owner;
    });
  }

  /** Kdy nejdřív smí odejít další e-mail (podle posledního odeslání). */
  private async nextResendAt(
    tx: Parameters<Parameters<DbService['withRlsContext']>[1]>[0],
    userId: string,
  ): Promise<Date | null> {
    const [last] = await tx
      .select({ createdAt: schema.emailVerifications.createdAt })
      .from(schema.emailVerifications)
      .where(
        and(
          eq(schema.emailVerifications.userId, userId),
          eq(schema.emailVerifications.purpose, PURPOSE),
        ),
      )
      .orderBy(desc(schema.emailVerifications.createdAt))
      .limit(1);

    if (!last) return null;
    return new Date(last.createdAt.getTime() + RESEND_COOLDOWN_SECONDS * 1000);
  }
}
