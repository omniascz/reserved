// BundlePacksService — sprava bundle balicku a alokaci zakaznikum (sprint 3.3 fáze A1).
//
// Bundle = svazek konkretnich sluzeb v jedne cene.
// Priklad: "Relaxacni" = masaz × 1 + manikura × 1 + zabal × 1 za 2200 Kc.
//
// Hlavni operace:
//   - CRUD pro bundle_packs sablony (admin/manager)
//   - allocate: prodej zakaznikovi (vytvori instance s snapshot polozkami)
//   - adjustItem: manualni zmena +/- konkretni polozky (s poznamkou)
//   - deductForBooking: pri rezervaci najdi vhodny bundle a strhni 1 ks dane sluzby
//   - refundForBooking: pri zruseni vrat 1 ks
//   - listForCustomer: vsechny bundles zakaznika

import {
  BadRequestException,
  ForbiddenException,
  Inject,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { and, asc, desc, eq, inArray, isNull, or, sql } from 'drizzle-orm';
import { schema } from '@reserved/db';
import { type AppRole, serviceContext, type TenantContext } from '@reserved/rls-multitenancy';

type BundleItem = { serviceId: string; quantity: number };
import { DbService } from '../db/db.service.js';
import type {
  AdjustBundleItemDto,
  AllocateBundlePackDto,
  AllocateBundlePackToCorporateDto,
  CreateBundlePackDto,
  UpdateBundlePackDto,
} from './dto/bundle-pack.dto.js';

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
        message: 'Pouze owner nebo manager může spravovat šablony bundle balíčků.',
      },
    });
  }
}

function assertCanAllocate(role: AppRole): void {
  if (!ALLOCATE_ROLES.includes(role)) {
    throw new ForbiddenException({
      error: {
        code: 'INSUFFICIENT_ROLE',
        message: 'Tento účet nemůže alokovat bundle balíčky.',
      },
    });
  }
}

/** Sečte zbývající kusy ve všech položkách. */
function totalRemaining(items: BundleItem[]): number {
  return items.reduce((sum, i) => sum + i.quantity, 0);
}

@Injectable()
export class BundlePacksService {
  constructor(@Inject(DbService) private readonly dbService: DbService) {}

  // ─── CRUD sablony ──────────────────────────────────────────────────

  async list(tenantId: string, userId: string, role: AppRole) {
    return this.dbService.withRlsContext(ctxFor(tenantId, userId, role), async (tx) => {
      return tx
        .select()
        .from(schema.bundlePacks)
        .where(and(eq(schema.bundlePacks.tenantId, tenantId), isNull(schema.bundlePacks.deletedAt)))
        .orderBy(asc(schema.bundlePacks.name));
    });
  }

  async get(tenantId: string, userId: string, role: AppRole, id: string) {
    return this.dbService.withRlsContext(ctxFor(tenantId, userId, role), async (tx) => {
      const [pack] = await tx
        .select()
        .from(schema.bundlePacks)
        .where(and(eq(schema.bundlePacks.id, id), eq(schema.bundlePacks.tenantId, tenantId)))
        .limit(1);
      if (!pack) {
        throw new NotFoundException({
          error: { code: 'BUNDLE_PACK_NOT_FOUND', message: 'Bundle balíček nenalezen.' },
        });
      }
      return pack;
    });
  }

  async create(tenantId: string, userId: string, role: AppRole, dto: CreateBundlePackDto) {
    assertCanManage(role);
    return this.dbService.withRlsContext(ctxFor(tenantId, userId, role), async (tx) => {
      const [created] = await tx
        .insert(schema.bundlePacks)
        .values({
          tenantId,
          name: dto.name,
          description: dto.description ?? null,
          items: dto.items,
          validityDays: dto.validityDays ?? null,
          priceHellers: dto.priceHellers,
          currency: dto.currency,
          allowedBranchIds: dto.allowedBranchIds,
          sameVisitRequired: dto.sameVisitRequired,
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
    dto: UpdateBundlePackDto,
  ) {
    assertCanManage(role);
    return this.dbService.withRlsContext(ctxFor(tenantId, userId, role), async (tx) => {
      const updateData: Record<string, unknown> = { updatedAt: new Date() };
      for (const key of [
        'name',
        'description',
        'items',
        'validityDays',
        'priceHellers',
        'currency',
        'allowedBranchIds',
        'sameVisitRequired',
        'isActive',
      ] as const) {
        if (dto[key] !== undefined) updateData[key] = dto[key];
      }
      const [updated] = await tx
        .update(schema.bundlePacks)
        .set(updateData)
        .where(and(eq(schema.bundlePacks.id, id), eq(schema.bundlePacks.tenantId, tenantId)))
        .returning();
      if (!updated) {
        throw new NotFoundException({
          error: { code: 'BUNDLE_PACK_NOT_FOUND', message: 'Bundle balíček nenalezen.' },
        });
      }
      return updated;
    });
  }

  async delete(tenantId: string, userId: string, role: AppRole, id: string) {
    assertCanManage(role);
    await this.dbService.withRlsContext(ctxFor(tenantId, userId, role), async (tx) => {
      await tx
        .update(schema.bundlePacks)
        .set({ deletedAt: new Date(), updatedAt: new Date() })
        .where(and(eq(schema.bundlePacks.id, id), eq(schema.bundlePacks.tenantId, tenantId)));
    });
  }

  // ─── Alokace zakaznikovi ───────────────────────────────────────────

  async allocateToCustomer(
    tenantId: string,
    userId: string,
    role: AppRole,
    customerId: string,
    dto: AllocateBundlePackDto,
  ) {
    assertCanAllocate(role);
    return this.dbService.withRlsContext(ctxFor(tenantId, userId, role), async (tx) => {
      const [pack] = await tx
        .select()
        .from(schema.bundlePacks)
        .where(
          and(
            eq(schema.bundlePacks.id, dto.bundlePackId),
            eq(schema.bundlePacks.tenantId, tenantId),
            eq(schema.bundlePacks.isActive, true),
          ),
        )
        .limit(1);
      if (!pack) {
        throw new NotFoundException({
          error: { code: 'BUNDLE_PACK_NOT_FOUND', message: 'Aktivní bundle balíček nenalezen.' },
        });
      }

      const validFrom = dto.validFromIso ? new Date(dto.validFromIso) : new Date();
      const validUntil = pack.validityDays
        ? new Date(validFrom.getTime() + pack.validityDays * 24 * 60 * 60 * 1000)
        : null;

      // itemsRemaining startuje jako copy snapshotu
      const snapshotItems = pack.items as BundleItem[];
      const itemsRemaining: BundleItem[] = snapshotItems.map((i) => ({ ...i }));

      const [allocated] = await tx
        .insert(schema.customerBundlePacks)
        .values({
          tenantId,
          customerId,
          bundlePackId: pack.id,
          itemsRemaining,
          snapshotItems,
          snapshotAllowedBranchIds: pack.allowedBranchIds,
          snapshotSameVisitRequired: pack.sameVisitRequired,
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

  /** Alokace firme (sprint 3.3 fáze B2-extended). */
  async allocateToCorporate(
    tenantId: string,
    userId: string,
    role: AppRole,
    corporateAccountId: string,
    dto: AllocateBundlePackToCorporateDto,
  ) {
    assertCanAllocate(role);
    return this.dbService.withRlsContext(ctxFor(tenantId, userId, role), async (tx) => {
      const [account] = await tx
        .select({ id: schema.corporateAccounts.id })
        .from(schema.corporateAccounts)
        .where(
          and(
            eq(schema.corporateAccounts.id, corporateAccountId),
            eq(schema.corporateAccounts.tenantId, tenantId),
            eq(schema.corporateAccounts.isActive, true),
          ),
        )
        .limit(1);
      if (!account) {
        throw new NotFoundException({
          error: { code: 'CORPORATE_ACCOUNT_NOT_FOUND', message: 'Aktivní firma nenalezena.' },
        });
      }

      const [pack] = await tx
        .select()
        .from(schema.bundlePacks)
        .where(
          and(
            eq(schema.bundlePacks.id, dto.bundlePackId),
            eq(schema.bundlePacks.tenantId, tenantId),
            eq(schema.bundlePacks.isActive, true),
          ),
        )
        .limit(1);
      if (!pack) {
        throw new NotFoundException({
          error: { code: 'BUNDLE_PACK_NOT_FOUND', message: 'Aktivní bundle balíček nenalezen.' },
        });
      }

      const validFrom = dto.validFromIso ? new Date(dto.validFromIso) : new Date();
      const validUntil = pack.validityDays
        ? new Date(validFrom.getTime() + pack.validityDays * 24 * 60 * 60 * 1000)
        : null;

      const snapshotItems = pack.items as BundleItem[];
      const itemsRemaining: BundleItem[] = snapshotItems.map((i) => ({ ...i }));

      const [allocated] = await tx
        .insert(schema.customerBundlePacks)
        .values({
          tenantId,
          customerId: null,
          corporateAccountId,
          bundlePackId: pack.id,
          itemsRemaining,
          snapshotItems,
          snapshotAllowedBranchIds: pack.allowedBranchIds,
          snapshotSameVisitRequired: pack.sameVisitRequired,
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
          allocation: schema.customerBundlePacks,
          packName: schema.bundlePacks.name,
        })
        .from(schema.customerBundlePacks)
        .leftJoin(
          schema.bundlePacks,
          eq(schema.customerBundlePacks.bundlePackId, schema.bundlePacks.id),
        )
        .where(
          and(
            eq(schema.customerBundlePacks.tenantId, tenantId),
            eq(schema.customerBundlePacks.customerId, customerId),
          ),
        )
        .orderBy(desc(schema.customerBundlePacks.purchasedAt));
      return rows.map((r) => ({ ...r.allocation, packName: r.packName }));
    });
  }

  /** Manuální úprava konkrétní položky alokace (admin "+1 jako bonus"). */
  async adjustItem(
    tenantId: string,
    userId: string,
    role: AppRole,
    allocationId: string,
    dto: AdjustBundleItemDto,
  ) {
    assertCanAllocate(role);
    return this.dbService.withRlsContext(ctxFor(tenantId, userId, role), async (tx) => {
      const [alloc] = await tx
        .select()
        .from(schema.customerBundlePacks)
        .where(
          and(
            eq(schema.customerBundlePacks.id, allocationId),
            eq(schema.customerBundlePacks.tenantId, tenantId),
          ),
        )
        .limit(1);
      if (!alloc) {
        throw new NotFoundException({
          error: { code: 'ALLOCATION_NOT_FOUND', message: 'Bundle klienta nenalezen.' },
        });
      }

      const items = alloc.itemsRemaining as BundleItem[];
      const idx = items.findIndex((i) => i.serviceId === dto.serviceId);
      if (idx === -1) {
        throw new BadRequestException({
          error: {
            code: 'ITEM_NOT_IN_BUNDLE',
            message: 'Tato služba není součástí bundle balíčku.',
          },
        });
      }
      const currentQty = items[idx]!.quantity;
      const newQty = currentQty + dto.quantityDelta;
      if (newQty < 0) {
        throw new BadRequestException({
          error: {
            code: 'NEGATIVE_QUANTITY',
            message: `Nelze odečíst ${Math.abs(dto.quantityDelta)} ks — zbývá jen ${currentQty}.`,
          },
        });
      }
      items[idx] = { serviceId: dto.serviceId, quantity: newQty };

      const newStatus = totalRemaining(items) === 0 ? 'used_up' : alloc.status;

      await tx
        .update(schema.customerBundlePacks)
        .set({
          itemsRemaining: items,
          status: newStatus,
          updatedAt: new Date(),
        })
        .where(eq(schema.customerBundlePacks.id, allocationId));

      await tx.insert(schema.bundleItemUses).values({
        tenantId,
        customerBundlePackId: allocationId,
        bookingId: null,
        serviceId: dto.serviceId,
        quantityDeducted: -dto.quantityDelta, // delta=+1 -> deducted=-1 (refund); delta=-1 -> deducted=1 (consume)
        action: 'admin_adjustment',
        performedBy: userId,
        note: dto.note,
      });

      return { allocationId, items };
    });
  }

  // ─── Auto-deduct pri rezervaci ─────────────────────────────────────

  /**
   * Najdi nejvhodnejsi aktivni bundle zakaznika ktery obsahuje danou sluzbu,
   * odecti 1 ks, zaloguj. Branch musi matchovat (nebo bundle nema branch limit).
   *
   * Vraci null pokud zadny vhodny bundle neexistuje.
   * Priorita: FIFO podle validUntil (nejdrive expirujici).
   */
  async deductForBooking(input: {
    tenantId: string;
    customerId: string;
    bookingId: string;
    serviceId: string;
    branchId: string | null;
    performedBy: string | null;
  }): Promise<{ allocationId: string; serviceId: string; quantityDeducted: number } | null> {
    return this.dbService.withRlsContext(serviceContext(input.tenantId), async (tx) => {
      // Najdi firmy, kde je customer aktivni clen (B2-extended)
      const corporateRows = await tx
        .select({ corporateAccountId: schema.corporateAccountMembers.corporateAccountId })
        .from(schema.corporateAccountMembers)
        .where(
          and(
            eq(schema.corporateAccountMembers.tenantId, input.tenantId),
            eq(schema.corporateAccountMembers.customerId, input.customerId),
            isNull(schema.corporateAccountMembers.removedAt),
          ),
        );
      const corporateIds = corporateRows.map((r) => r.corporateAccountId);

      const ownerFilter =
        corporateIds.length > 0
          ? or(
              eq(schema.customerBundlePacks.customerId, input.customerId),
              inArray(schema.customerBundlePacks.corporateAccountId, corporateIds),
            )
          : eq(schema.customerBundlePacks.customerId, input.customerId);

      const candidates = await tx
        .select()
        .from(schema.customerBundlePacks)
        .where(
          and(
            eq(schema.customerBundlePacks.tenantId, input.tenantId),
            ownerFilter,
            eq(schema.customerBundlePacks.status, 'active'),
            or(
              isNull(schema.customerBundlePacks.validUntil),
              sql`${schema.customerBundlePacks.validUntil} > NOW()`,
            ),
          ),
        )
        .orderBy(
          // Priorita: vlastni pred firemnimi.
          sql`${schema.customerBundlePacks.corporateAccountId} ASC NULLS FIRST`,
          asc(schema.customerBundlePacks.validUntil),
        );

      for (const alloc of candidates) {
        const items = alloc.itemsRemaining as BundleItem[];
        const idx = items.findIndex((i) => i.serviceId === input.serviceId && i.quantity > 0);
        if (idx === -1) continue;

        const allowedBranches = (alloc.snapshotAllowedBranchIds as string[]) ?? [];
        const branchMatch =
          allowedBranches.length === 0 ||
          (input.branchId !== null && allowedBranches.includes(input.branchId));
        if (!branchMatch) continue;

        items[idx] = { serviceId: input.serviceId, quantity: items[idx]!.quantity - 1 };
        const remainingTotal = totalRemaining(items);

        await tx
          .update(schema.customerBundlePacks)
          .set({
            itemsRemaining: items,
            status: remainingTotal === 0 ? 'used_up' : 'active',
            updatedAt: new Date(),
          })
          .where(eq(schema.customerBundlePacks.id, alloc.id));

        await tx.insert(schema.bundleItemUses).values({
          tenantId: input.tenantId,
          customerBundlePackId: alloc.id,
          bookingId: input.bookingId,
          serviceId: input.serviceId,
          quantityDeducted: 1,
          action: 'consumed',
          performedBy: input.performedBy,
        });

        return { allocationId: alloc.id, serviceId: input.serviceId, quantityDeducted: 1 };
      }

      return null;
    });
  }

  /**
   * Vrat 1 ks pri zruseni rezervace — vyhleda predchozi 'consumed' use
   * pro tento booking a obrati ho. Idempotentni (existujici 'refunded' = no-op).
   */
  async refundForBooking(input: {
    tenantId: string;
    bookingId: string;
    performedBy: string | null;
  }): Promise<{ allocationId: string; serviceId: string; quantityRefunded: number } | null> {
    return this.dbService.withRlsContext(serviceContext(input.tenantId), async (tx) => {
      const [originalUse] = await tx
        .select()
        .from(schema.bundleItemUses)
        .where(
          and(
            eq(schema.bundleItemUses.tenantId, input.tenantId),
            eq(schema.bundleItemUses.bookingId, input.bookingId),
            eq(schema.bundleItemUses.action, 'consumed'),
          ),
        )
        .limit(1);

      if (!originalUse) return null;

      const [existingRefund] = await tx
        .select({ id: schema.bundleItemUses.id })
        .from(schema.bundleItemUses)
        .where(
          and(
            eq(schema.bundleItemUses.tenantId, input.tenantId),
            eq(schema.bundleItemUses.bookingId, input.bookingId),
            eq(schema.bundleItemUses.action, 'refunded'),
          ),
        )
        .limit(1);
      if (existingRefund) return null;

      const [alloc] = await tx
        .select()
        .from(schema.customerBundlePacks)
        .where(eq(schema.customerBundlePacks.id, originalUse.customerBundlePackId))
        .limit(1);
      if (!alloc) return null;

      const items = alloc.itemsRemaining as BundleItem[];
      const idx = items.findIndex((i) => i.serviceId === originalUse.serviceId);
      if (idx === -1) {
        // Polozka uz neni ve snapshotu (template se zmenil — nepravdepodobne,
        // ale ochrana). Pridame zpet zakladni polozku.
        items.push({ serviceId: originalUse.serviceId, quantity: originalUse.quantityDeducted });
      } else {
        items[idx] = {
          serviceId: originalUse.serviceId,
          quantity: items[idx]!.quantity + originalUse.quantityDeducted,
        };
      }

      await tx
        .update(schema.customerBundlePacks)
        .set({
          itemsRemaining: items,
          status: 'active', // re-activate i kdyz byl used_up
          updatedAt: new Date(),
        })
        .where(eq(schema.customerBundlePacks.id, alloc.id));

      await tx.insert(schema.bundleItemUses).values({
        tenantId: input.tenantId,
        customerBundlePackId: alloc.id,
        bookingId: input.bookingId,
        serviceId: originalUse.serviceId,
        quantityDeducted: -originalUse.quantityDeducted, // zaporne = refund
        action: 'refunded',
        performedBy: input.performedBy,
      });

      return {
        allocationId: alloc.id,
        serviceId: originalUse.serviceId,
        quantityRefunded: originalUse.quantityDeducted,
      };
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
        .from(schema.bundleItemUses)
        .where(
          and(
            eq(schema.bundleItemUses.tenantId, tenantId),
            eq(schema.bundleItemUses.customerBundlePackId, allocationId),
          ),
        )
        .orderBy(desc(schema.bundleItemUses.createdAt));
    });
  }
}
