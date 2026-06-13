// LoyaltyService — věrnostní body (sprint 10.8). Připsání za dokončenou
// rezervaci (dle nastavení tenanta), uplatnění a ruční korekce. Zůstatek = SUM.

import { BadRequestException, ForbiddenException, Inject, Injectable } from '@nestjs/common';
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
}
