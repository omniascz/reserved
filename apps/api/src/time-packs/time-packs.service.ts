// TimePacksService — sprava casovych balicku (sprint 3.3 fáze A2).
//
// Time pack = subscription bez auto-renewal. Zakaznik plati jednou,
// dostane (omezeny nebo neomezeny) pristup k vybranym sluzbam po dobu X dni.
// Priklad: "Neomezene skupinove fitness lekce po dobu 30 dni za 1200 Kc".
//
// Hlavni operace:
//   - CRUD pro time_packs sablony (admin/manager)
//   - allocate: prodej zakaznikovi (vytvori instance s vypoctenym validUntil)
//   - adjust: manualni zmena counter / prodlouzeni
//   - deductForBooking: pri rezervaci najdi aktivni pack, zkontroluj limity,
//                       inkrementuj counter, zaloguj
//   - refundForBooking: pri zruseni rezervace dec counter
//   - listForCustomer: vsechny time-packs zakaznika
//   - expireOverdue: nastavi 'expired' kde validUntil < now (cron job)

import {
  BadRequestException,
  ForbiddenException,
  Inject,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { and, asc, count, desc, eq, gte, isNull, lt, lte, sql } from 'drizzle-orm';
import { schema } from '@reserved/db';
import { type AppRole, serviceContext, type TenantContext } from '@reserved/rls-multitenancy';
import { DbService } from '../db/db.service.js';
import type {
  AdjustTimePackDto,
  AllocateTimePackDto,
  CreateTimePackDto,
  UpdateTimePackDto,
} from './dto/time-pack.dto.js';

const MANAGE_ROLES: AppRole[] = ['owner', 'manager'];
const ALLOCATE_ROLES: AppRole[] = ['owner', 'manager', 'receptionist'];

function ctxFor(tenantId: string, userId: string, role: AppRole): TenantContext {
  return { tenantId, userId, role };
}

function assertCanManage(role: AppRole): void {
  if (!MANAGE_ROLES.includes(role)) {
    throw new ForbiddenException({
      error: {
        code: 'INSUFFICIENT_ROLE',
        message: 'Pouze owner nebo manager může spravovat šablony časových balíčků.',
      },
    });
  }
}

function assertCanAllocate(role: AppRole): void {
  if (!ALLOCATE_ROLES.includes(role)) {
    throw new ForbiddenException({
      error: {
        code: 'INSUFFICIENT_ROLE',
        message: 'Tento účet nemůže alokovat časové balíčky.',
      },
    });
  }
}

function dayBoundaries(date: Date): { start: Date; end: Date } {
  const start = new Date(date);
  start.setHours(0, 0, 0, 0);
  const end = new Date(start);
  end.setDate(end.getDate() + 1);
  return { start, end };
}

@Injectable()
export class TimePacksService {
  constructor(@Inject(DbService) private readonly dbService: DbService) {}

  // ─── CRUD sablony ──────────────────────────────────────────────────

  async list(tenantId: string, userId: string, role: AppRole) {
    return this.dbService.withRlsContext(ctxFor(tenantId, userId, role), async (tx) => {
      return tx
        .select()
        .from(schema.timePacks)
        .where(and(eq(schema.timePacks.tenantId, tenantId), isNull(schema.timePacks.deletedAt)))
        .orderBy(asc(schema.timePacks.name));
    });
  }

  async get(tenantId: string, userId: string, role: AppRole, id: string) {
    return this.dbService.withRlsContext(ctxFor(tenantId, userId, role), async (tx) => {
      const [pack] = await tx
        .select()
        .from(schema.timePacks)
        .where(and(eq(schema.timePacks.id, id), eq(schema.timePacks.tenantId, tenantId)))
        .limit(1);
      if (!pack) {
        throw new NotFoundException({
          error: { code: 'TIME_PACK_NOT_FOUND', message: 'Časový balíček nenalezen.' },
        });
      }
      return pack;
    });
  }

  async create(tenantId: string, userId: string, role: AppRole, dto: CreateTimePackDto) {
    assertCanManage(role);
    return this.dbService.withRlsContext(ctxFor(tenantId, userId, role), async (tx) => {
      const [created] = await tx
        .insert(schema.timePacks)
        .values({
          tenantId,
          name: dto.name,
          description: dto.description ?? null,
          durationDays: dto.durationDays,
          maxBookingsPerPeriod: dto.maxBookingsPerPeriod ?? null,
          maxBookingsPerDay: dto.maxBookingsPerDay ?? null,
          allowedServiceIds: dto.allowedServiceIds,
          allowedBranchIds: dto.allowedBranchIds,
          priceHellers: dto.priceHellers,
          currency: dto.currency,
          isActive: dto.isActive,
        })
        .returning();
      return created!;
    });
  }

  async update(
    tenantId: string,
    userId: string,
    role: AppRole,
    id: string,
    dto: UpdateTimePackDto,
  ) {
    assertCanManage(role);
    return this.dbService.withRlsContext(ctxFor(tenantId, userId, role), async (tx) => {
      const updateData: Record<string, unknown> = { updatedAt: new Date() };
      for (const key of [
        'name',
        'description',
        'durationDays',
        'maxBookingsPerPeriod',
        'maxBookingsPerDay',
        'allowedServiceIds',
        'allowedBranchIds',
        'priceHellers',
        'currency',
        'isActive',
      ] as const) {
        if (dto[key] !== undefined) updateData[key] = dto[key];
      }
      const [updated] = await tx
        .update(schema.timePacks)
        .set(updateData)
        .where(and(eq(schema.timePacks.id, id), eq(schema.timePacks.tenantId, tenantId)))
        .returning();
      if (!updated) {
        throw new NotFoundException({
          error: { code: 'TIME_PACK_NOT_FOUND', message: 'Časový balíček nenalezen.' },
        });
      }
      return updated;
    });
  }

  async delete(tenantId: string, userId: string, role: AppRole, id: string) {
    assertCanManage(role);
    await this.dbService.withRlsContext(ctxFor(tenantId, userId, role), async (tx) => {
      await tx
        .update(schema.timePacks)
        .set({ deletedAt: new Date(), updatedAt: new Date() })
        .where(and(eq(schema.timePacks.id, id), eq(schema.timePacks.tenantId, tenantId)));
    });
  }

  // ─── Alokace zakaznikovi ───────────────────────────────────────────

  async allocateToCustomer(
    tenantId: string,
    userId: string,
    role: AppRole,
    customerId: string,
    dto: AllocateTimePackDto,
  ) {
    assertCanAllocate(role);
    return this.dbService.withRlsContext(ctxFor(tenantId, userId, role), async (tx) => {
      const [pack] = await tx
        .select()
        .from(schema.timePacks)
        .where(
          and(
            eq(schema.timePacks.id, dto.timePackId),
            eq(schema.timePacks.tenantId, tenantId),
            eq(schema.timePacks.isActive, true),
          ),
        )
        .limit(1);
      if (!pack) {
        throw new NotFoundException({
          error: { code: 'TIME_PACK_NOT_FOUND', message: 'Aktivní časový balíček nenalezen.' },
        });
      }

      const validFrom = dto.validFromIso ? new Date(dto.validFromIso) : new Date();
      const validUntil = new Date(validFrom.getTime() + pack.durationDays * 24 * 60 * 60 * 1000);

      const [allocated] = await tx
        .insert(schema.customerTimePacks)
        .values({
          tenantId,
          customerId,
          timePackId: pack.id,
          snapshotMaxBookingsPerPeriod: pack.maxBookingsPerPeriod,
          snapshotMaxBookingsPerDay: pack.maxBookingsPerDay,
          snapshotAllowedServiceIds: pack.allowedServiceIds,
          snapshotAllowedBranchIds: pack.allowedBranchIds,
          bookingsUsed: 0,
          validFrom,
          validUntil,
          status: 'active',
          pricePaidHellers: dto.pricePaidHellers ?? pack.priceHellers,
          soldBy: userId,
          note: dto.note ?? null,
        })
        .returning();

      return allocated!;
    });
  }

  async listForCustomer(tenantId: string, userId: string, role: AppRole, customerId: string) {
    return this.dbService.withRlsContext(ctxFor(tenantId, userId, role), async (tx) => {
      const rows = await tx
        .select({
          allocation: schema.customerTimePacks,
          packName: schema.timePacks.name,
        })
        .from(schema.customerTimePacks)
        .leftJoin(schema.timePacks, eq(schema.customerTimePacks.timePackId, schema.timePacks.id))
        .where(
          and(
            eq(schema.customerTimePacks.tenantId, tenantId),
            eq(schema.customerTimePacks.customerId, customerId),
          ),
        )
        .orderBy(desc(schema.customerTimePacks.purchasedAt));
      return rows.map((r) => ({ ...r.allocation, packName: r.packName }));
    });
  }

  async adjust(
    tenantId: string,
    userId: string,
    role: AppRole,
    allocationId: string,
    dto: AdjustTimePackDto,
  ) {
    assertCanAllocate(role);
    return this.dbService.withRlsContext(ctxFor(tenantId, userId, role), async (tx) => {
      const [alloc] = await tx
        .select()
        .from(schema.customerTimePacks)
        .where(
          and(
            eq(schema.customerTimePacks.id, allocationId),
            eq(schema.customerTimePacks.tenantId, tenantId),
          ),
        )
        .limit(1);
      if (!alloc) {
        throw new NotFoundException({
          error: { code: 'ALLOCATION_NOT_FOUND', message: 'Časový balíček klienta nenalezen.' },
        });
      }

      const updates: Record<string, unknown> = { updatedAt: new Date() };
      if (dto.bookingsUsedDelta !== undefined) {
        const newUsed = alloc.bookingsUsed + dto.bookingsUsedDelta;
        if (newUsed < 0) {
          throw new BadRequestException({
            error: {
              code: 'NEGATIVE_USAGE',
              message: 'Pocet pouziti nemuze byt zaporny.',
            },
          });
        }
        updates.bookingsUsed = newUsed;
      }
      if (dto.extendDays !== undefined && dto.extendDays !== 0) {
        const newValidUntil = new Date(
          alloc.validUntil.getTime() + dto.extendDays * 24 * 60 * 60 * 1000,
        );
        updates.validUntil = newValidUntil;
        // Pokud byl expired, mozna re-activate
        if (alloc.status === 'expired' && newValidUntil > new Date()) {
          updates.status = 'active';
        }
      }

      await tx
        .update(schema.customerTimePacks)
        .set(updates)
        .where(eq(schema.customerTimePacks.id, allocationId));

      await tx.insert(schema.timePackUses).values({
        tenantId,
        customerTimePackId: allocationId,
        bookingId: null,
        serviceId: alloc.snapshotAllowedServiceIds[0] ?? alloc.timePackId, // placeholder for adjust
        action: 'admin_adjustment',
        performedBy: userId,
        note: dto.note,
      });

      return { allocationId, ...updates };
    });
  }

  // ─── Auto-deduct pri rezervaci ─────────────────────────────────────

  /**
   * Najdi aktivni time-pack zakaznika ktery matchne service+branch a
   * neporusuje limity (maxPerPeriod, maxPerDay). Inkrementuje counter + log.
   *
   * Vraci null pokud zadny vhodny time-pack neexistuje.
   * Priorita: drive expirujici (ASC validUntil).
   */
  async deductForBooking(input: {
    tenantId: string;
    customerId: string;
    bookingId: string;
    serviceId: string;
    branchId: string | null;
    bookingStartsAt: Date;
    performedBy: string | null;
  }): Promise<{ allocationId: string; bookingsUsed: number } | null> {
    return this.dbService.withRlsContext(serviceContext(input.tenantId), async (tx) => {
      const candidates = await tx
        .select()
        .from(schema.customerTimePacks)
        .where(
          and(
            eq(schema.customerTimePacks.tenantId, input.tenantId),
            eq(schema.customerTimePacks.customerId, input.customerId),
            eq(schema.customerTimePacks.status, 'active'),
            gte(schema.customerTimePacks.validUntil, input.bookingStartsAt),
            lte(schema.customerTimePacks.validFrom, input.bookingStartsAt),
          ),
        )
        .orderBy(asc(schema.customerTimePacks.validUntil));

      for (const alloc of candidates) {
        const allowedServices = (alloc.snapshotAllowedServiceIds as string[]) ?? [];
        const allowedBranches = (alloc.snapshotAllowedBranchIds as string[]) ?? [];

        const serviceMatch =
          allowedServices.length === 0 || allowedServices.includes(input.serviceId);
        const branchMatch =
          allowedBranches.length === 0 ||
          (input.branchId !== null && allowedBranches.includes(input.branchId));
        if (!serviceMatch || !branchMatch) continue;

        // Kontrola maxBookingsPerPeriod
        if (
          alloc.snapshotMaxBookingsPerPeriod !== null &&
          alloc.bookingsUsed >= alloc.snapshotMaxBookingsPerPeriod
        ) {
          continue;
        }

        // Kontrola maxBookingsPerDay — spocti pouziti dnesniho dne
        if (alloc.snapshotMaxBookingsPerDay !== null) {
          const { start, end } = dayBoundaries(input.bookingStartsAt);
          const rows = await tx
            .select({ value: count() })
            .from(schema.timePackUses)
            .where(
              and(
                eq(schema.timePackUses.customerTimePackId, alloc.id),
                eq(schema.timePackUses.action, 'consumed'),
                gte(schema.timePackUses.usageDate, start),
                lt(schema.timePackUses.usageDate, end),
              ),
            );
          const usedToday = rows[0]?.value ?? 0;
          if (usedToday >= alloc.snapshotMaxBookingsPerDay) continue;
        }

        const newUsed = alloc.bookingsUsed + 1;
        const becomesUsedUp =
          alloc.snapshotMaxBookingsPerPeriod !== null &&
          newUsed >= alloc.snapshotMaxBookingsPerPeriod;

        await tx
          .update(schema.customerTimePacks)
          .set({
            bookingsUsed: newUsed,
            status: becomesUsedUp ? 'used_up' : 'active',
            updatedAt: new Date(),
          })
          .where(eq(schema.customerTimePacks.id, alloc.id));

        await tx.insert(schema.timePackUses).values({
          tenantId: input.tenantId,
          customerTimePackId: alloc.id,
          bookingId: input.bookingId,
          serviceId: input.serviceId,
          usageDate: input.bookingStartsAt,
          action: 'consumed',
          performedBy: input.performedBy,
        });

        return { allocationId: alloc.id, bookingsUsed: newUsed };
      }

      return null;
    });
  }

  /**
   * Vrat 1 pouziti pri zruseni rezervace — dec counter + audit. Idempotentni.
   */
  async refundForBooking(input: {
    tenantId: string;
    bookingId: string;
    performedBy: string | null;
  }): Promise<{ allocationId: string; bookingsUsed: number } | null> {
    return this.dbService.withRlsContext(serviceContext(input.tenantId), async (tx) => {
      const [originalUse] = await tx
        .select()
        .from(schema.timePackUses)
        .where(
          and(
            eq(schema.timePackUses.tenantId, input.tenantId),
            eq(schema.timePackUses.bookingId, input.bookingId),
            eq(schema.timePackUses.action, 'consumed'),
          ),
        )
        .limit(1);
      if (!originalUse) return null;

      const [existingRefund] = await tx
        .select({ id: schema.timePackUses.id })
        .from(schema.timePackUses)
        .where(
          and(
            eq(schema.timePackUses.tenantId, input.tenantId),
            eq(schema.timePackUses.bookingId, input.bookingId),
            eq(schema.timePackUses.action, 'refunded'),
          ),
        )
        .limit(1);
      if (existingRefund) return null;

      const [alloc] = await tx
        .select()
        .from(schema.customerTimePacks)
        .where(eq(schema.customerTimePacks.id, originalUse.customerTimePackId))
        .limit(1);
      if (!alloc) return null;

      const newUsed = Math.max(0, alloc.bookingsUsed - 1);
      const stillValid = alloc.validUntil > new Date();

      await tx
        .update(schema.customerTimePacks)
        .set({
          bookingsUsed: newUsed,
          // re-activate pokud byl used_up a po refundu se vejde do limitu + jeste neexpiroval
          status: stillValid ? 'active' : alloc.status,
          updatedAt: new Date(),
        })
        .where(eq(schema.customerTimePacks.id, alloc.id));

      await tx.insert(schema.timePackUses).values({
        tenantId: input.tenantId,
        customerTimePackId: alloc.id,
        bookingId: input.bookingId,
        serviceId: originalUse.serviceId,
        usageDate: originalUse.usageDate,
        action: 'refunded',
        performedBy: input.performedBy,
      });

      return { allocationId: alloc.id, bookingsUsed: newUsed };
    });
  }

  /**
   * Cron job — nastav status='expired' kde validUntil < now a status byl 'active' nebo 'used_up'.
   * Vraci pocet zmen.
   */
  async expireOverdue(tenantId: string): Promise<number> {
    return this.dbService.withRlsContext(serviceContext(tenantId), async (tx) => {
      const result = await tx
        .update(schema.customerTimePacks)
        .set({ status: 'expired', updatedAt: new Date() })
        .where(
          and(
            eq(schema.customerTimePacks.tenantId, tenantId),
            sql`${schema.customerTimePacks.validUntil} < NOW()`,
            sql`${schema.customerTimePacks.status} IN ('active', 'used_up')`,
          ),
        )
        .returning({ id: schema.customerTimePacks.id });
      return result.length;
    });
  }

  async listUsesForAllocation(
    tenantId: string,
    userId: string,
    role: AppRole,
    allocationId: string,
  ) {
    return this.dbService.withRlsContext(ctxFor(tenantId, userId, role), async (tx) => {
      return tx
        .select()
        .from(schema.timePackUses)
        .where(
          and(
            eq(schema.timePackUses.tenantId, tenantId),
            eq(schema.timePackUses.customerTimePackId, allocationId),
          ),
        )
        .orderBy(desc(schema.timePackUses.createdAt));
    });
  }
}
