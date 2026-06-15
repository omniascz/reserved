// ReferralService — doporučovací program (sprint 10.35).
// Každý zákazník má svůj kód; uplatnění novým zákazníkem připíše body oběma
// (věrnostní body). Ochrany: self-referral, jedno uplatnění na e-mail/tenant.

import {
  BadRequestException,
  ForbiddenException,
  Inject,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { randomBytes } from 'node:crypto';
import { and, desc, eq, sql } from 'drizzle-orm';
import { schema } from '@reserved/db';
import { type AppRole, serviceContext, type TenantContext } from '@reserved/rls-multitenancy';
import { DbService, type Database } from '../db/db.service.js';

const MANAGE_ROLES: AppRole[] = ['owner', 'manager', 'receptionist'];
const DEFAULT_REFERRER_POINTS = 100;
const DEFAULT_REFEREE_POINTS = 50;

function ctxFor(tenantId: string, userId: string, role: AppRole): TenantContext {
  return { tenantId, userId, role };
}
function assertCanManage(role: AppRole): void {
  if (!MANAGE_ROLES.includes(role)) {
    throw new ForbiddenException({
      error: { code: 'INSUFFICIENT_ROLE', message: 'Nedostatečná oprávnění.' },
    });
  }
}
function genCode(): string {
  return `REF-${randomBytes(3)
    .toString('hex')
    .toUpperCase()
    .replace(/[0OIL1]/g, 'X')}`;
}

@Injectable()
export class ReferralsService {
  constructor(@Inject(DbService) private readonly dbService: DbService) {}

  /** Vrátí (nebo vytvoří) referral kód zákazníka. */
  async myCode(tenantId: string, userId: string, role: AppRole, customerId: string) {
    assertCanManage(role);
    return this.dbService.withRlsContext(ctxFor(tenantId, userId, role), (tx) =>
      this.getOrCreateCode(tx, tenantId, customerId),
    );
  }

  private async getOrCreateCode(tx: Database, tenantId: string, customerId: string) {
    const [existing] = await tx
      .select()
      .from(schema.referralCodes)
      .where(
        and(
          eq(schema.referralCodes.tenantId, tenantId),
          eq(schema.referralCodes.customerId, customerId),
        ),
      )
      .limit(1);
    if (existing) return existing;
    for (let i = 0; i < 6; i++) {
      try {
        const [row] = await tx
          .insert(schema.referralCodes)
          .values({ tenantId, customerId, code: genCode() })
          .returning();
        return row!;
      } catch (err) {
        const e = err as { code?: string; cause?: { code?: string } };
        if ((e.code ?? e.cause?.code) === '23505') continue;
        throw err;
      }
    }
    throw new BadRequestException({
      error: { code: 'CODE_GENERATION_FAILED', message: 'Nepodařilo se vygenerovat kód.' },
    });
  }

  /**
   * Uplatní referral kód novým zákazníkem. Připíše body referrerovi i referee.
   * Veřejné (volá se při registraci/první rezervaci nového zákazníka).
   */
  async redeem(
    tenantId: string,
    input: { code: string; refereeEmail: string; refereeCustomerId?: string | null },
  ) {
    return this.dbService.withRlsContext(serviceContext(tenantId), async (tx) => {
      const [code] = await tx
        .select()
        .from(schema.referralCodes)
        .where(
          and(
            eq(schema.referralCodes.tenantId, tenantId),
            eq(schema.referralCodes.code, input.code.trim().toUpperCase()),
          ),
        )
        .limit(1);
      if (!code) {
        throw new NotFoundException({
          error: { code: 'REFERRAL_CODE_INVALID', message: 'Doporučovací kód neplatí.' },
        });
      }

      // Self-referral: referrer nemůže doporučit sám sebe (dle e-mailu).
      const [referrer] = await tx
        .select({ email: schema.customers.email })
        .from(schema.customers)
        .where(eq(schema.customers.id, code.customerId))
        .limit(1);
      if (referrer && referrer.email.toLowerCase() === input.refereeEmail.toLowerCase()) {
        throw new BadRequestException({
          error: { code: 'SELF_REFERRAL', message: 'Nelze doporučit sám sebe.' },
        });
      }

      // Body z nastavení tenanta (default 100 / 50).
      const [t] = await tx
        .select({ settings: schema.tenants.settings })
        .from(schema.tenants)
        .where(eq(schema.tenants.id, tenantId))
        .limit(1);
      const cfg = (
        t?.settings as { referral?: { referrerPoints?: number; refereePoints?: number } } | null
      )?.referral;
      const referrerPoints = cfg?.referrerPoints ?? DEFAULT_REFERRER_POINTS;
      const refereePoints = cfg?.refereePoints ?? DEFAULT_REFEREE_POINTS;

      let redemption;
      try {
        [redemption] = await tx
          .insert(schema.referralRedemptions)
          .values({
            tenantId,
            codeId: code.id,
            referrerCustomerId: code.customerId,
            refereeEmail: input.refereeEmail,
            refereeCustomerId: input.refereeCustomerId ?? null,
            referrerPoints,
            refereePoints,
          })
          .returning();
      } catch (err) {
        const e = err as { code?: string; cause?: { code?: string } };
        if ((e.code ?? e.cause?.code) === '23505') {
          throw new BadRequestException({
            error: { code: 'ALREADY_REFERRED', message: 'Tento e-mail už doporučení uplatnil.' },
          });
        }
        throw err;
      }

      // Připiš body referrerovi (vždy) a referee (pokud má účet).
      await tx.insert(schema.loyaltyTransactions).values({
        tenantId,
        customerId: code.customerId,
        points: referrerPoints,
        type: 'referral',
        note: `Doporučení uplatnil ${input.refereeEmail}`,
      });
      if (input.refereeCustomerId) {
        await tx.insert(schema.loyaltyTransactions).values({
          tenantId,
          customerId: input.refereeCustomerId,
          points: refereePoints,
          type: 'referral',
          note: `Uplatnění doporučovacího kódu ${code.code}`,
        });
      }

      return {
        redeemed: true,
        referrerPoints,
        refereePoints: input.refereeCustomerId ? refereePoints : 0,
        redemptionId: redemption!.id,
      };
    });
  }

  /** Doporučení získaná konkrétním zákazníkem (referrerem). */
  async listRedemptions(tenantId: string, userId: string, role: AppRole, customerId: string) {
    assertCanManage(role);
    return this.dbService.withRlsContext(ctxFor(tenantId, userId, role), async (tx) => {
      const [agg] = await tx
        .select({
          count: sql<number>`COUNT(*)::int`,
          points: sql<number>`COALESCE(SUM(${schema.referralRedemptions.referrerPoints}), 0)::int`,
        })
        .from(schema.referralRedemptions)
        .where(
          and(
            eq(schema.referralRedemptions.tenantId, tenantId),
            eq(schema.referralRedemptions.referrerCustomerId, customerId),
          ),
        );
      const items = await tx
        .select()
        .from(schema.referralRedemptions)
        .where(
          and(
            eq(schema.referralRedemptions.tenantId, tenantId),
            eq(schema.referralRedemptions.referrerCustomerId, customerId),
          ),
        )
        .orderBy(desc(schema.referralRedemptions.createdAt))
        .limit(200);
      return {
        totalReferrals: Number(agg?.count ?? 0),
        totalPointsEarned: Number(agg?.points ?? 0),
        items,
      };
    });
  }
}
