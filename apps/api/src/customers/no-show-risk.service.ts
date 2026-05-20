// NoShowRiskService — vyhodnocuje riziko no-show u zákazníka.
//
// Pravidlo (bez ML):
//   - Žádná historie → "neznámé" riziko (medium)
//   - 0 no-shows / 0 pozdních zrušení → low
//   - ≥1 no-show v posledních 10 rezervacích → medium
//   - ≥2 no-shows nebo no-show ratio >30 % → high
//
// Score je škála 0-100 (vyšší = horší). Level je human-friendly bucket.
// Reasons je seznam zpráv pro admina ("3 no-show v poslední 10 rezervací").
//
// Tohle je v1 — rule-based. V2 (Sprint 9+) může přidat ML model, který bere
// v úvahu i čas mezi rezervací a no-show, den v týdnu, službu, atd.

import { ForbiddenException, Inject, Injectable, NotFoundException } from '@nestjs/common';
import { and, desc, eq, isNull } from 'drizzle-orm';
import { schema } from '@reserved/db';
import type { AppRole } from '@reserved/rls-multitenancy';
import { serviceContext } from '@reserved/rls-multitenancy';
import { DbService } from '../db/db.service.js';

export type RiskLevel = 'low' | 'medium' | 'high';

export interface NoShowRisk {
  /** 0-100, vyšší znamená vyšší riziko. */
  score: number;
  level: RiskLevel;
  /** Human-readable důvody pro UI. */
  reasons: string[];
  stats: {
    totalBookings: number;
    completedBookings: number;
    noShowCount: number;
    cancelledByCustomerCount: number;
  };
}

const HISTORY_WINDOW = 10;

const VIEW_ROLES: AppRole[] = ['owner', 'manager', 'employee', 'receptionist'];

@Injectable()
export class NoShowRiskService {
  constructor(@Inject(DbService) private readonly dbService: DbService) {}

  async computeForCustomer(
    tenantId: string,
    userId: string,
    role: AppRole,
    customerId: string,
  ): Promise<NoShowRisk> {
    if (!VIEW_ROLES.includes(role)) {
      throw new ForbiddenException({
        error: { code: 'INSUFFICIENT_ROLE', message: 'Nedostatečná oprávnění.' },
      });
    }

    const ctx = { tenantId, userId, role };

    // Ověř existenci customera (RLS by jinak vrátil prázdný výsledek, ale chceme 404).
    const exists = await this.dbService.withRlsContext(ctx, async (tx) => {
      const rows = await tx
        .select({ id: schema.customers.id })
        .from(schema.customers)
        .where(and(eq(schema.customers.id, customerId), isNull(schema.customers.deletedAt)))
        .limit(1);
      return rows[0];
    });
    if (!exists) {
      throw new NotFoundException({
        error: { code: 'CUSTOMER_NOT_FOUND', message: 'Zákazník nenalezen.' },
      });
    }

    // Load posledních HISTORY_WINDOW rezervací (vč. cancelled / no_show / completed).
    const recent = await this.dbService.withRlsContext(ctx, async (tx) => {
      return tx
        .select({
          status: schema.bookings.status,
          startsAt: schema.bookings.startsAt,
          cancelledAt: schema.bookings.cancelledAt,
        })
        .from(schema.bookings)
        .where(eq(schema.bookings.customerId, customerId))
        .orderBy(desc(schema.bookings.startsAt))
        .limit(HISTORY_WINDOW);
    });

    return this.scoreFromHistory(recent);
  }

  /**
   * Public computation helper — používáno z booking listu pro hromadný výpočet
   * bez nutnosti opakovat DB call per booking. Volající si načte history sám.
   */
  scoreFromHistory(
    bookings: Array<{
      status: string;
    }>,
  ): NoShowRisk {
    const total = bookings.length;

    if (total === 0) {
      return {
        score: 50,
        level: 'medium',
        reasons: ['Nový klient bez historie — neznámé riziko.'],
        stats: {
          totalBookings: 0,
          completedBookings: 0,
          noShowCount: 0,
          cancelledByCustomerCount: 0,
        },
      };
    }

    const noShowCount = bookings.filter((b) => b.status === 'no_show').length;
    const completedCount = bookings.filter((b) => b.status === 'completed').length;
    const cancelledCount = bookings.filter((b) => b.status === 'cancelled').length;

    const noShowRatio = noShowCount / total;

    // Rule-based scoring
    let score = 0;
    const reasons: string[] = [];

    if (noShowCount === 0 && cancelledCount === 0) {
      score = 10;
      reasons.push(`Spolehlivý klient — ${completedCount} dokončených návštěv.`);
    } else if (noShowCount === 0) {
      score = 30;
      reasons.push(`${cancelledCount}× zrušeno v posledních ${total} rezervacích.`);
    } else if (noShowCount === 1 && noShowRatio < 0.3) {
      score = 50;
      reasons.push(`1× no-show v posledních ${total} rezervacích.`);
    } else if (noShowCount >= 2 || noShowRatio >= 0.3) {
      score = 80 + Math.min(15, Math.floor(noShowRatio * 20));
      reasons.push(
        `${noShowCount}× no-show v posledních ${total} rezervacích (${Math.round(noShowRatio * 100)} %).`,
      );
    } else {
      score = 40;
    }

    if (cancelledCount >= 4) {
      score = Math.min(100, score + 10);
      reasons.push(`Časté zrušení (${cancelledCount}×).`);
    }

    const level: RiskLevel = score >= 66 ? 'high' : score >= 30 ? 'medium' : 'low';

    return {
      score,
      level,
      reasons,
      stats: {
        totalBookings: total,
        completedBookings: completedCount,
        noShowCount,
        cancelledByCustomerCount: cancelledCount,
      },
    };
  }
}
