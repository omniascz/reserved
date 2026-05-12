import { ForbiddenException, Inject, Injectable, NotFoundException } from '@nestjs/common';
import { and, asc, eq, gte, lte } from 'drizzle-orm';
import { schema } from '@reserved/db';
import { type AppRole, type TenantContext } from '@reserved/rls-multitenancy';
import { DbService } from '../db/db.service.js';
import { getCzHolidays } from './cz-holidays.js';
import type { CreateHolidayDto } from './dto/holiday.dto.js';

const MANAGE_ROLES: AppRole[] = ['owner', 'manager'];

function ctxFor(tenantId: string, userId: string, role: AppRole): TenantContext {
  return { tenantId, userId, role };
}

function assertCanManage(role: AppRole): void {
  if (!MANAGE_ROLES.includes(role)) {
    throw new ForbiddenException({
      error: { code: 'INSUFFICIENT_ROLE', message: 'Pouze owner/manager může spravovat svátky.' },
    });
  }
}

@Injectable()
export class HolidaysService {
  constructor(@Inject(DbService) private readonly dbService: DbService) {}

  async list(
    tenantId: string,
    userId: string,
    role: AppRole,
    range: { from?: string; to?: string },
  ) {
    return this.dbService.withRlsContext(ctxFor(tenantId, userId, role), async (tx) => {
      const conditions = [eq(schema.holidays.tenantId, tenantId)];
      if (range.from) {
        conditions.push(gte(schema.holidays.date, new Date(range.from)));
      }
      if (range.to) {
        conditions.push(lte(schema.holidays.date, new Date(range.to)));
      }
      return tx
        .select()
        .from(schema.holidays)
        .where(and(...conditions))
        .orderBy(asc(schema.holidays.date))
        .limit(500);
    });
  }

  async create(tenantId: string, userId: string, role: AppRole, dto: CreateHolidayDto) {
    assertCanManage(role);
    return this.dbService.withRlsContext(ctxFor(tenantId, userId, role), async (tx) => {
      const [row] = await tx
        .insert(schema.holidays)
        .values({
          tenantId,
          branchId: dto.branchId ?? null,
          date: new Date(dto.date),
          name: dto.name,
          source: 'custom',
          customStartTime: dto.customStartTime ?? null,
          customEndTime: dto.customEndTime ?? null,
          isOpen: dto.isOpen,
        })
        .returning();
      return row!;
    });
  }

  async delete(tenantId: string, userId: string, role: AppRole, holidayId: string) {
    assertCanManage(role);
    await this.dbService.withRlsContext(ctxFor(tenantId, userId, role), async (tx) => {
      await tx
        .delete(schema.holidays)
        .where(and(eq(schema.holidays.id, holidayId), eq(schema.holidays.tenantId, tenantId)));
    });
  }

  /** Import státních svátků ČR pro daný rok. Skipuje duplicity. */
  async importCzHolidays(
    tenantId: string,
    userId: string,
    role: AppRole,
    year: number,
  ): Promise<{ inserted: number; skipped: number }> {
    assertCanManage(role);
    return this.dbService.withRlsContext(ctxFor(tenantId, userId, role), async (tx) => {
      const entries = getCzHolidays(year);

      // Načti existující svátky pro daný rok
      const existing = await tx
        .select({ date: schema.holidays.date })
        .from(schema.holidays)
        .where(
          and(
            eq(schema.holidays.tenantId, tenantId),
            gte(schema.holidays.date, new Date(`${year}-01-01`)),
            lte(schema.holidays.date, new Date(`${year}-12-31`)),
          ),
        );
      const existingDates = new Set(
        existing.map((e) => (e.date as Date).toISOString().slice(0, 10)),
      );

      let inserted = 0;
      let skipped = 0;
      for (const entry of entries) {
        if (existingDates.has(entry.date)) {
          skipped++;
          continue;
        }
        await tx.insert(schema.holidays).values({
          tenantId,
          date: new Date(entry.date),
          name: entry.name,
          source: 'public_holiday',
          isOpen: false,
        });
        inserted++;
      }

      return { inserted, skipped };
    });
  }
}
