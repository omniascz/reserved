// LoyaltyService — věrnostní body (sprint 10.8). Připsání za dokončenou
// rezervaci (dle nastavení tenanta), uplatnění a ruční korekce. Zůstatek = SUM.

import { BadRequestException, ForbiddenException, Inject, Injectable } from '@nestjs/common';
import { randomBytes } from 'node:crypto';
import { and, desc, eq, sql } from 'drizzle-orm';
import { schema } from '@reserved/db';
import { type AppRole, type TenantContext } from '@reserved/rls-multitenancy';
import type { Database } from '../db/db.service.js';
import { DbService } from '../db/db.service.js';
import { extractLoyaltySettings } from '../settings/settings.types.js';

const REDEEM_ROLES: AppRole[] = ['owner', 'manager', 'receptionist'];

function ctxFor(tenantId: string, userId: string, role: AppRole): TenantContext {
  return { tenantId, userId, role };
}

@Injectable()
export class LoyaltyService {
  constructor(@Inject(DbService) private readonly dbService: DbService) {}

  /** Připíše body za dokončenou rezervaci. Idempotentní (1 připsání na rezervaci).
   *  Běží uvnitř transakce volajícího (BookingsService.markCompleted). */
  async awardForBooking(
    tx: Database,
    tenantId: string,
    customerId: string,
    bookingId: string,
  ): Promise<void> {
    const tenantRows = await tx
      .select({ settings: schema.tenants.settings })
      .from(schema.tenants)
      .where(eq(schema.tenants.id, tenantId))
      .limit(1);
    const loyalty = extractLoyaltySettings(tenantRows[0]?.settings);
    if (!loyalty.enabled || loyalty.pointsPerCompletedBooking <= 0) return;

    // Idempotence — body za rezervaci jen jednou.
    const existing = await tx
      .select({ id: schema.loyaltyTransactions.id })
      .from(schema.loyaltyTransactions)
      .where(
        and(
          eq(schema.loyaltyTransactions.bookingId, bookingId),
          eq(schema.loyaltyTransactions.type, 'earn_booking'),
        ),
      )
      .limit(1);
    if (existing.length > 0) return;

    await tx.insert(schema.loyaltyTransactions).values({
      tenantId,
      customerId,
      points: loyalty.pointsPerCompletedBooking,
      type: 'earn_booking',
      bookingId,
      note: 'Dokončená rezervace',
      createdBy: 'system',
    });
  }

  private async balanceInTx(tx: Database, tenantId: string, customerId: string): Promise<number> {
    const [row] = await tx
      .select({ total: sql<number>`COALESCE(SUM(${schema.loyaltyTransactions.points}), 0)::int` })
      .from(schema.loyaltyTransactions)
      .where(
        and(
          eq(schema.loyaltyTransactions.tenantId, tenantId),
          eq(schema.loyaltyTransactions.customerId, customerId),
        ),
      );
    return Number(row?.total ?? 0);
  }

  async getForCustomer(tenantId: string, userId: string, role: AppRole, customerId: string) {
    return this.dbService.withRlsContext(ctxFor(tenantId, userId, role), async (tx) => {
      const balance = await this.balanceInTx(tx, tenantId, customerId);
      const transactions = await tx
        .select()
        .from(schema.loyaltyTransactions)
        .where(
          and(
            eq(schema.loyaltyTransactions.tenantId, tenantId),
            eq(schema.loyaltyTransactions.customerId, customerId),
          ),
        )
        .orderBy(desc(schema.loyaltyTransactions.createdAt))
        .limit(200);
      return { balance, transactions };
    });
  }

  async redeem(
    tenantId: string,
    userId: string,
    role: AppRole,
    customerId: string,
    points: number,
    note: string | null,
  ) {
    if (!REDEEM_ROLES.includes(role)) {
      throw new ForbiddenException({
        error: { code: 'INSUFFICIENT_ROLE', message: 'Tento účet nemůže uplatňovat body.' },
      });
    }
    if (points <= 0) {
      throw new BadRequestException({
        error: { code: 'INVALID_POINTS', message: 'Počet bodů musí být kladný.' },
      });
    }
    return this.dbService.withRlsContext(ctxFor(tenantId, userId, role), async (tx) => {
      const balance = await this.balanceInTx(tx, tenantId, customerId);
      if (balance < points) {
        throw new BadRequestException({
          error: {
            code: 'INSUFFICIENT_POINTS',
            message: `Nedostatek bodů — zůstatek ${balance}, požadováno ${points}.`,
          },
        });
      }
      await tx.insert(schema.loyaltyTransactions).values({
        tenantId,
        customerId,
        points: -points,
        type: 'redeem',
        note: note ?? 'Uplatnění bodů',
        createdBy: userId,
      });
      return { balance: balance - points };
    });
  }

  async adjust(
    tenantId: string,
    userId: string,
    role: AppRole,
    customerId: string,
    points: number,
    note: string,
  ) {
    if (!REDEEM_ROLES.includes(role)) {
      throw new ForbiddenException({
        error: { code: 'INSUFFICIENT_ROLE', message: 'Tento účet nemůže upravovat body.' },
      });
    }
    return this.dbService.withRlsContext(ctxFor(tenantId, userId, role), async (tx) => {
      const balance = await this.balanceInTx(tx, tenantId, customerId);
      if (balance + points < 0) {
        throw new BadRequestException({
          error: {
            code: 'NEGATIVE_BALANCE',
            message: `Korekce by dala záporný zůstatek (${balance} ${points >= 0 ? '+' : ''}${points}).`,
          },
        });
      }
      await tx.insert(schema.loyaltyTransactions).values({
        tenantId,
        customerId,
        points,
        type: 'admin_adjust',
        note,
        createdBy: userId,
      });
      return { balance: balance + points };
    });
  }

  // ─── Tiery (úrovně) ─────────────────────────────────────────────────

  /** Celkově NASBÍRANÉ body (jen kladné transakce) — základ pro tier. */
  private async lifetimeEarnedInTx(
    tx: Database,
    tenantId: string,
    customerId: string,
  ): Promise<number> {
    const [row] = await tx
      .select({
        total: sql<number>`COALESCE(SUM(CASE WHEN ${schema.loyaltyTransactions.points} > 0 THEN ${schema.loyaltyTransactions.points} ELSE 0 END), 0)::int`,
      })
      .from(schema.loyaltyTransactions)
      .where(
        and(
          eq(schema.loyaltyTransactions.tenantId, tenantId),
          eq(schema.loyaltyTransactions.customerId, customerId),
        ),
      );
    return Number(row?.total ?? 0);
  }

  async listTiers(tenantId: string, userId: string, role: AppRole) {
    return this.dbService.withRlsContext(ctxFor(tenantId, userId, role), async (tx) => {
      return tx
        .select()
        .from(schema.loyaltyTiers)
        .where(eq(schema.loyaltyTiers.tenantId, tenantId))
        .orderBy(schema.loyaltyTiers.minPoints);
    });
  }

  async createTier(
    tenantId: string,
    userId: string,
    role: AppRole,
    dto: { name: string; minPoints: number; perk?: string | null; sortOrder?: number },
  ) {
    if (!REDEEM_ROLES.includes(role)) {
      throw new ForbiddenException({
        error: { code: 'INSUFFICIENT_ROLE', message: 'Tento účet nemůže spravovat tiery.' },
      });
    }
    return this.dbService.withRlsContext(ctxFor(tenantId, userId, role), async (tx) => {
      const [row] = await tx
        .insert(schema.loyaltyTiers)
        .values({
          tenantId,
          name: dto.name,
          minPoints: dto.minPoints,
          perk: dto.perk ?? null,
          sortOrder: dto.sortOrder ?? 0,
        })
        .returning();
      return row!;
    });
  }

  /** Aktuální úroveň zákazníka = nejvyšší tier, jehož minPoints <= nasbírané body. */
  async customerTier(tenantId: string, userId: string, role: AppRole, customerId: string) {
    return this.dbService.withRlsContext(ctxFor(tenantId, userId, role), async (tx) => {
      const lifetimeEarned = await this.lifetimeEarnedInTx(tx, tenantId, customerId);
      const balance = await this.balanceInTx(tx, tenantId, customerId);
      const tiers = await tx
        .select()
        .from(schema.loyaltyTiers)
        .where(eq(schema.loyaltyTiers.tenantId, tenantId))
        .orderBy(schema.loyaltyTiers.minPoints);
      let current = null as (typeof tiers)[number] | null;
      let next = null as (typeof tiers)[number] | null;
      for (const t of tiers) {
        if (lifetimeEarned >= t.minPoints) current = t;
        else if (!next) next = t;
      }
      return {
        lifetimeEarned,
        balance,
        currentTier: current,
        nextTier: next,
        pointsToNext: next ? next.minPoints - lifetimeEarned : null,
      };
    });
  }

  // ─── Katalog odměn ──────────────────────────────────────────────────

  async listRewards(tenantId: string, userId: string, role: AppRole, onlyActive = false) {
    return this.dbService.withRlsContext(ctxFor(tenantId, userId, role), async (tx) => {
      const conds = [eq(schema.loyaltyRewards.tenantId, tenantId)];
      if (onlyActive) conds.push(eq(schema.loyaltyRewards.isActive, true));
      return tx
        .select()
        .from(schema.loyaltyRewards)
        .where(and(...conds))
        .orderBy(schema.loyaltyRewards.pointsCost);
    });
  }

  async createReward(
    tenantId: string,
    userId: string,
    role: AppRole,
    dto: {
      name: string;
      description?: string | null;
      pointsCost: number;
      kind: string;
      value?: number;
    },
  ) {
    if (!REDEEM_ROLES.includes(role)) {
      throw new ForbiddenException({
        error: { code: 'INSUFFICIENT_ROLE', message: 'Tento účet nemůže spravovat odměny.' },
      });
    }
    return this.dbService.withRlsContext(ctxFor(tenantId, userId, role), async (tx) => {
      const [row] = await tx
        .insert(schema.loyaltyRewards)
        .values({
          tenantId,
          name: dto.name,
          description: dto.description ?? null,
          pointsCost: dto.pointsCost,
          kind: dto.kind,
          value: dto.value ?? 0,
        })
        .returning();
      return row!;
    });
  }

  /**
   * Zákazník uplatní body za odměnu z katalogu. Atomicky: ověří zůstatek,
   * strhne body (redeem transakce) a vydá uplatnění s kódem pro obsluhu.
   */
  async redeemReward(
    tenantId: string,
    userId: string,
    role: AppRole,
    customerId: string,
    rewardId: string,
  ) {
    if (!REDEEM_ROLES.includes(role)) {
      throw new ForbiddenException({
        error: { code: 'INSUFFICIENT_ROLE', message: 'Tento účet nemůže uplatňovat odměny.' },
      });
    }
    return this.dbService.withRlsContext(ctxFor(tenantId, userId, role), async (tx) => {
      const [reward] = await tx
        .select()
        .from(schema.loyaltyRewards)
        .where(
          and(
            eq(schema.loyaltyRewards.id, rewardId),
            eq(schema.loyaltyRewards.tenantId, tenantId),
            eq(schema.loyaltyRewards.isActive, true),
          ),
        )
        .limit(1);
      if (!reward) {
        throw new BadRequestException({
          error: { code: 'REWARD_NOT_FOUND', message: 'Odměna neexistuje nebo není aktivní.' },
        });
      }
      const balance = await this.balanceInTx(tx, tenantId, customerId);
      if (balance < reward.pointsCost) {
        throw new BadRequestException({
          error: {
            code: 'INSUFFICIENT_POINTS',
            message: `Nedostatek bodů — zůstatek ${balance}, odměna stojí ${reward.pointsCost}.`,
          },
        });
      }
      await tx.insert(schema.loyaltyTransactions).values({
        tenantId,
        customerId,
        points: -reward.pointsCost,
        type: 'redeem',
        note: `Odměna: ${reward.name}`,
        createdBy: userId,
      });
      const code = `RW-${randomBytes(3).toString('hex').toUpperCase()}`;
      const [redemption] = await tx
        .insert(schema.loyaltyRewardRedemptions)
        .values({
          tenantId,
          customerId,
          rewardId: reward.id,
          rewardName: reward.name,
          pointsCost: reward.pointsCost,
          code,
        })
        .returning();
      return {
        redemption: redemption!,
        balanceAfter: balance - reward.pointsCost,
        reward: { name: reward.name, kind: reward.kind, value: reward.value },
      };
    });
  }
}
