// CreditPacksService — sprava permanentek a alokaci zakaznikum.
//
// Hlavni operace:
//   - CRUD pro credit_packs sablony (admin/manager)
//   - allocate: prodej/pridel sablonu konkretnimu zakaznikovi (vytvori instance)
//   - adjust: manualni zmena kreditu instance (+/- s poznamkou)
//   - deductForBooking: pri vytvoreni rezervace najdi nejvhodnejsi balicek a strhni
//   - refundForBooking: pri zruseni rezervace pred deadline vrat kredit
//   - listForCustomer: vsechny balicky zakaznika
//
// Logika hledani spravneho balicku pro rezervaci:
//   1. Filter: active + neexpirovaný + creditsRemaining > 0
//   2. Match: service v allowedServiceIds (nebo prazdny) + branch v allowedBranchIds
//   3. Setrid: nejdriv expirujici balicky (FIFO podle validUntil)
//   4. Vezmi prvni a strhni cost (per_visit = 1, per_credit = creditCostsByService[serviceId])

import {
  BadRequestException,
  ForbiddenException,
  Inject,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { and, asc, desc, eq, gt, isNull, or, sql } from 'drizzle-orm';
import { schema } from '@reserved/db';
import { type AppRole, serviceContext, type TenantContext } from '@reserved/rls-multitenancy';
import { DbService } from '../db/db.service.js';
import type {
  AdjustCreditsDto,
  AllocateCreditPackDto,
  CreateCreditPackDto,
  UpdateCreditPackDto,
} from './dto/credit-pack.dto.js';

const MANAGE_ROLES: AppRole[] = ['owner', 'manager'];
// Pro alokaci muze i employee/receptionist (typicky receptionist prodava balicky)
const ALLOCATE_ROLES: AppRole[] = ['owner', 'manager', 'receptionist'];

function ctxFor(tenantId: string, userId: string, role: AppRole): TenantContext {
  return { tenantId, userId, role };
}

function assertCanManage(role: AppRole): void {
  if (!MANAGE_ROLES.includes(role)) {
    throw new ForbiddenException({
      error: {
        code: 'INSUFFICIENT_ROLE',
        message: 'Pouze owner nebo manager může spravovat šablony permanentek.',
      },
    });
  }
}

function assertCanAllocate(role: AppRole): void {
  if (!ALLOCATE_ROLES.includes(role)) {
    throw new ForbiddenException({
      error: {
        code: 'INSUFFICIENT_ROLE',
        message: 'Tento účet nemůže alokovat permanentky.',
      },
    });
  }
}

@Injectable()
export class CreditPacksService {
  constructor(@Inject(DbService) private readonly dbService: DbService) {}

  // ─── CRUD sablony ──────────────────────────────────────────────────

  async list(tenantId: string, userId: string, role: AppRole) {
    return this.dbService.withRlsContext(ctxFor(tenantId, userId, role), async (tx) => {
      return tx
        .select()
        .from(schema.creditPacks)
        .where(and(eq(schema.creditPacks.tenantId, tenantId), isNull(schema.creditPacks.deletedAt)))
        .orderBy(asc(schema.creditPacks.name));
    });
  }

  async get(tenantId: string, userId: string, role: AppRole, id: string) {
    return this.dbService.withRlsContext(ctxFor(tenantId, userId, role), async (tx) => {
      const [pack] = await tx
        .select()
        .from(schema.creditPacks)
        .where(and(eq(schema.creditPacks.id, id), eq(schema.creditPacks.tenantId, tenantId)))
        .limit(1);
      if (!pack) {
        throw new NotFoundException({
          error: { code: 'CREDIT_PACK_NOT_FOUND', message: 'Permanentka nenalezena.' },
        });
      }
      return pack;
    });
  }

  async create(tenantId: string, userId: string, role: AppRole, dto: CreateCreditPackDto) {
    assertCanManage(role);
    return this.dbService.withRlsContext(ctxFor(tenantId, userId, role), async (tx) => {
      const [created] = await tx
        .insert(schema.creditPacks)
        .values({
          tenantId,
          name: dto.name,
          description: dto.description ?? null,
          mode: dto.mode,
          totalCredits: dto.totalCredits,
          validityDays: dto.validityDays ?? null,
          priceHellers: dto.priceHellers,
          currency: dto.currency,
          allowedServiceIds: dto.allowedServiceIds,
          allowedBranchIds: dto.allowedBranchIds,
          creditCostsByService: dto.creditCostsByService,
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
    dto: UpdateCreditPackDto,
  ) {
    assertCanManage(role);
    return this.dbService.withRlsContext(ctxFor(tenantId, userId, role), async (tx) => {
      const updateData: Record<string, unknown> = { updatedAt: new Date() };
      for (const key of [
        'name',
        'description',
        'mode',
        'totalCredits',
        'validityDays',
        'priceHellers',
        'currency',
        'allowedServiceIds',
        'allowedBranchIds',
        'creditCostsByService',
        'isActive',
      ] as const) {
        if (dto[key] !== undefined) updateData[key] = dto[key];
      }
      const [updated] = await tx
        .update(schema.creditPacks)
        .set(updateData)
        .where(and(eq(schema.creditPacks.id, id), eq(schema.creditPacks.tenantId, tenantId)))
        .returning();
      if (!updated) {
        throw new NotFoundException({
          error: { code: 'CREDIT_PACK_NOT_FOUND', message: 'Permanentka nenalezena.' },
        });
      }
      return updated;
    });
  }

  async delete(tenantId: string, userId: string, role: AppRole, id: string) {
    assertCanManage(role);
    await this.dbService.withRlsContext(ctxFor(tenantId, userId, role), async (tx) => {
      await tx
        .update(schema.creditPacks)
        .set({ deletedAt: new Date(), updatedAt: new Date() })
        .where(and(eq(schema.creditPacks.id, id), eq(schema.creditPacks.tenantId, tenantId)));
    });
  }

  // ─── Alokace zakaznikovi ───────────────────────────────────────────

  async allocateToCustomer(
    tenantId: string,
    userId: string,
    role: AppRole,
    customerId: string,
    dto: AllocateCreditPackDto,
  ) {
    assertCanAllocate(role);
    return this.dbService.withRlsContext(ctxFor(tenantId, userId, role), async (tx) => {
      const [pack] = await tx
        .select()
        .from(schema.creditPacks)
        .where(
          and(
            eq(schema.creditPacks.id, dto.creditPackId),
            eq(schema.creditPacks.tenantId, tenantId),
            eq(schema.creditPacks.isActive, true),
          ),
        )
        .limit(1);
      if (!pack) {
        throw new NotFoundException({
          error: { code: 'CREDIT_PACK_NOT_FOUND', message: 'Aktivní permanentka nenalezena.' },
        });
      }

      const validFrom = dto.validFromIso ? new Date(dto.validFromIso) : new Date();
      const validUntil = pack.validityDays
        ? new Date(validFrom.getTime() + pack.validityDays * 24 * 60 * 60 * 1000)
        : null;

      const [allocated] = await tx
        .insert(schema.customerCreditPacks)
        .values({
          tenantId,
          customerId,
          creditPackId: pack.id,
          creditsRemaining: pack.totalCredits,
          creditsAtPurchase: pack.totalCredits,
          snapshotMode: pack.mode,
          snapshotAllowedServiceIds: pack.allowedServiceIds,
          snapshotAllowedBranchIds: pack.allowedBranchIds,
          snapshotCreditCosts: pack.creditCostsByService,
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
          allocation: schema.customerCreditPacks,
          packName: schema.creditPacks.name,
        })
        .from(schema.customerCreditPacks)
        .leftJoin(
          schema.creditPacks,
          eq(schema.customerCreditPacks.creditPackId, schema.creditPacks.id),
        )
        .where(
          and(
            eq(schema.customerCreditPacks.tenantId, tenantId),
            eq(schema.customerCreditPacks.customerId, customerId),
          ),
        )
        .orderBy(desc(schema.customerCreditPacks.purchasedAt));
      return rows.map((r) => ({ ...r.allocation, packName: r.packName }));
    });
  }

  async adjust(
    tenantId: string,
    userId: string,
    role: AppRole,
    allocationId: string,
    dto: AdjustCreditsDto,
  ) {
    assertCanAllocate(role);
    return this.dbService.withRlsContext(ctxFor(tenantId, userId, role), async (tx) => {
      const [alloc] = await tx
        .select()
        .from(schema.customerCreditPacks)
        .where(
          and(
            eq(schema.customerCreditPacks.id, allocationId),
            eq(schema.customerCreditPacks.tenantId, tenantId),
          ),
        )
        .limit(1);
      if (!alloc) {
        throw new NotFoundException({
          error: { code: 'ALLOCATION_NOT_FOUND', message: 'Permanentka klienta nenalezena.' },
        });
      }
      const newRemaining = alloc.creditsRemaining + dto.creditsDelta;
      if (newRemaining < 0) {
        throw new BadRequestException({
          error: {
            code: 'NEGATIVE_CREDITS',
            message: `Nelze odečíst ${Math.abs(dto.creditsDelta)} kreditů — zbývá jen ${alloc.creditsRemaining}.`,
          },
        });
      }

      await tx
        .update(schema.customerCreditPacks)
        .set({
          creditsRemaining: newRemaining,
          status: newRemaining === 0 ? 'used_up' : alloc.status,
          updatedAt: new Date(),
        })
        .where(eq(schema.customerCreditPacks.id, allocationId));

      await tx.insert(schema.creditUses).values({
        tenantId,
        customerCreditPackId: allocationId,
        bookingId: null,
        creditsDeducted: -dto.creditsDelta, // delta=+5 -> deducted=-5 (refund); delta=-3 -> deducted=3 (consume)
        action: 'admin_adjustment',
        performedBy: userId,
        note: dto.note,
      });

      return { allocationId, newRemaining };
    });
  }

  // ─── Auto-deduct pri rezervaci ─────────────────────────────────────

  /**
   * Najdi nejvhodnejsi aktivni balicek zakaznika pro danou sluzbu+pobocku,
   * odecti kredit (1 pro per_visit nebo creditCost pro per_credit), zaloguj.
   *
   * Vraci null pokud zadny vhodny balicek neexistuje (zakaznik plati normalne).
   */
  async deductForBooking(input: {
    tenantId: string;
    customerId: string;
    bookingId: string;
    serviceId: string;
    branchId: string | null;
    /** Performed-by user id, nebo null pro public bookings. */
    performedBy: string | null;
  }): Promise<{ allocationId: string; creditsDeducted: number } | null> {
    return this.dbService.withRlsContext(serviceContext(input.tenantId), async (tx) => {
      // 1. Najdi vsechny aktivni balicky zakaznika
      const candidates = await tx
        .select()
        .from(schema.customerCreditPacks)
        .where(
          and(
            eq(schema.customerCreditPacks.tenantId, input.tenantId),
            eq(schema.customerCreditPacks.customerId, input.customerId),
            eq(schema.customerCreditPacks.status, 'active'),
            gt(schema.customerCreditPacks.creditsRemaining, 0),
            or(
              isNull(schema.customerCreditPacks.validUntil),
              sql`${schema.customerCreditPacks.validUntil} > NOW()`,
            ),
          ),
        )
        .orderBy(asc(schema.customerCreditPacks.validUntil));

      // 2. Najdi prvni co matchne service+branch
      for (const alloc of candidates) {
        const allowedServices = (alloc.snapshotAllowedServiceIds as string[]) ?? [];
        const allowedBranches = (alloc.snapshotAllowedBranchIds as string[]) ?? [];

        const serviceMatch =
          allowedServices.length === 0 || allowedServices.includes(input.serviceId);
        const branchMatch =
          allowedBranches.length === 0 ||
          (input.branchId !== null && allowedBranches.includes(input.branchId));

        if (!serviceMatch || !branchMatch) continue;

        // 3. Spocti cost
        let cost = 1;
        if (alloc.snapshotMode === 'per_credit') {
          const costs = (alloc.snapshotCreditCosts as Record<string, number>) ?? {};
          cost = costs[input.serviceId] ?? 1;
        }
        if (alloc.creditsRemaining < cost) continue;

        // 4. Odecti + log
        const newRemaining = alloc.creditsRemaining - cost;
        await tx
          .update(schema.customerCreditPacks)
          .set({
            creditsRemaining: newRemaining,
            status: newRemaining === 0 ? 'used_up' : 'active',
            updatedAt: new Date(),
          })
          .where(eq(schema.customerCreditPacks.id, alloc.id));

        await tx.insert(schema.creditUses).values({
          tenantId: input.tenantId,
          customerCreditPackId: alloc.id,
          bookingId: input.bookingId,
          creditsDeducted: cost,
          action: 'consumed',
          performedBy: input.performedBy,
        });

        return { allocationId: alloc.id, creditsDeducted: cost };
      }

      return null;
    });
  }

  /**
   * Vrat kredit pri zruseni rezervace — vyhleda predchozi 'consumed' use
   * pro tento booking a obrati ho ('refunded').
   */
  async refundForBooking(input: {
    tenantId: string;
    bookingId: string;
    performedBy: string | null;
  }): Promise<{ allocationId: string; creditsRefunded: number } | null> {
    return this.dbService.withRlsContext(serviceContext(input.tenantId), async (tx) => {
      const [originalUse] = await tx
        .select()
        .from(schema.creditUses)
        .where(
          and(
            eq(schema.creditUses.tenantId, input.tenantId),
            eq(schema.creditUses.bookingId, input.bookingId),
            eq(schema.creditUses.action, 'consumed'),
          ),
        )
        .limit(1);

      if (!originalUse) return null;

      // Zkontroluj jestli uz neni refundovany (idempotence)
      const [existingRefund] = await tx
        .select({ id: schema.creditUses.id })
        .from(schema.creditUses)
        .where(
          and(
            eq(schema.creditUses.tenantId, input.tenantId),
            eq(schema.creditUses.bookingId, input.bookingId),
            eq(schema.creditUses.action, 'refunded'),
          ),
        )
        .limit(1);
      if (existingRefund) return null;

      // Add credits back
      await tx
        .update(schema.customerCreditPacks)
        .set({
          creditsRemaining: sql`${schema.customerCreditPacks.creditsRemaining} + ${originalUse.creditsDeducted}`,
          status: 'active', // re-activate i kdyz byl used_up
          updatedAt: new Date(),
        })
        .where(eq(schema.customerCreditPacks.id, originalUse.customerCreditPackId));

      await tx.insert(schema.creditUses).values({
        tenantId: input.tenantId,
        customerCreditPackId: originalUse.customerCreditPackId,
        bookingId: input.bookingId,
        creditsDeducted: -originalUse.creditsDeducted, // zaporne = refund
        action: 'refunded',
        performedBy: input.performedBy,
      });

      return {
        allocationId: originalUse.customerCreditPackId,
        creditsRefunded: originalUse.creditsDeducted,
      };
    });
  }

  /** Penalty (no-show): strhne dodatecny kredit z prvniho aktivniho balicku. */
  async deductPenalty(input: {
    tenantId: string;
    customerId: string;
    bookingId: string | null;
    credits: number;
    reason: string;
  }): Promise<{ allocationId: string; creditsDeducted: number } | null> {
    return this.dbService.withRlsContext(serviceContext(input.tenantId), async (tx) => {
      const [alloc] = await tx
        .select()
        .from(schema.customerCreditPacks)
        .where(
          and(
            eq(schema.customerCreditPacks.tenantId, input.tenantId),
            eq(schema.customerCreditPacks.customerId, input.customerId),
            eq(schema.customerCreditPacks.status, 'active'),
            gt(schema.customerCreditPacks.creditsRemaining, 0),
          ),
        )
        .orderBy(asc(schema.customerCreditPacks.validUntil))
        .limit(1);

      if (!alloc) return null;

      const toDeduct = Math.min(input.credits, alloc.creditsRemaining);
      const newRemaining = alloc.creditsRemaining - toDeduct;

      await tx
        .update(schema.customerCreditPacks)
        .set({
          creditsRemaining: newRemaining,
          status: newRemaining === 0 ? 'used_up' : 'active',
          updatedAt: new Date(),
        })
        .where(eq(schema.customerCreditPacks.id, alloc.id));

      await tx.insert(schema.creditUses).values({
        tenantId: input.tenantId,
        customerCreditPackId: alloc.id,
        bookingId: input.bookingId,
        creditsDeducted: toDeduct,
        action: 'penalty',
        performedBy: null,
        note: input.reason,
      });

      return { allocationId: alloc.id, creditsDeducted: toDeduct };
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
        .from(schema.creditUses)
        .where(
          and(
            eq(schema.creditUses.tenantId, tenantId),
            eq(schema.creditUses.customerCreditPackId, allocationId),
          ),
        )
        .orderBy(desc(schema.creditUses.createdAt));
    });
  }
}
