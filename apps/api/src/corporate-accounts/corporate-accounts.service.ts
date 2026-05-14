// CorporateAccountsService — sprava B2B firemnich uctu (sprint 3.3 fáze B1).
//
// Hlavni operace:
//   - CRUD pro corporate_accounts (admin/manager)
//   - addMember / removeMember / updateMember (admin/manager + corporate admin v budoucnu)
//   - listMembers
//   - listForCustomer (zjisti, do kterých firem zákazník patří)

import {
  BadRequestException,
  ForbiddenException,
  Inject,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { and, asc, count, desc, eq, gte, isNull, lte, sql, sum } from 'drizzle-orm';
import { schema } from '@reserved/db';
import { type AppRole, type TenantContext } from '@reserved/rls-multitenancy';
import { DbService } from '../db/db.service.js';
import type {
  AddMemberDto,
  CreateCorporateAccountDto,
  UpdateCorporateAccountDto,
  UpdateMemberDto,
} from './dto/corporate-account.dto.js';

const MANAGE_ROLES: AppRole[] = ['owner', 'manager'];

function ctxFor(tenantId: string, userId: string, role: AppRole): TenantContext {
  return { tenantId, userId, role };
}

function assertCanManage(role: AppRole): void {
  if (!MANAGE_ROLES.includes(role)) {
    throw new ForbiddenException({
      error: {
        code: 'INSUFFICIENT_ROLE',
        message: 'Pouze owner nebo manager může spravovat firemní účty.',
      },
    });
  }
}

@Injectable()
export class CorporateAccountsService {
  constructor(@Inject(DbService) private readonly dbService: DbService) {}

  // ─── Corporate accounts CRUD ─────────────────────────────────────

  async list(tenantId: string, userId: string, role: AppRole) {
    return this.dbService.withRlsContext(ctxFor(tenantId, userId, role), async (tx) => {
      return tx
        .select()
        .from(schema.corporateAccounts)
        .where(
          and(
            eq(schema.corporateAccounts.tenantId, tenantId),
            isNull(schema.corporateAccounts.deletedAt),
          ),
        )
        .orderBy(asc(schema.corporateAccounts.companyName));
    });
  }

  async get(tenantId: string, userId: string, role: AppRole, id: string) {
    return this.dbService.withRlsContext(ctxFor(tenantId, userId, role), async (tx) => {
      const [account] = await tx
        .select()
        .from(schema.corporateAccounts)
        .where(
          and(eq(schema.corporateAccounts.id, id), eq(schema.corporateAccounts.tenantId, tenantId)),
        )
        .limit(1);
      if (!account) {
        throw new NotFoundException({
          error: { code: 'CORPORATE_ACCOUNT_NOT_FOUND', message: 'Firma nenalezena.' },
        });
      }
      return account;
    });
  }

  async create(tenantId: string, userId: string, role: AppRole, dto: CreateCorporateAccountDto) {
    assertCanManage(role);
    return this.dbService.withRlsContext(ctxFor(tenantId, userId, role), async (tx) => {
      const [created] = await tx
        .insert(schema.corporateAccounts)
        .values({
          tenantId,
          companyName: dto.companyName,
          vatId: dto.vatId ?? null,
          companyRegId: dto.companyRegId ?? null,
          billingAddressLine1: dto.billingAddressLine1 ?? null,
          billingAddressLine2: dto.billingAddressLine2 ?? null,
          billingCity: dto.billingCity ?? null,
          billingZip: dto.billingZip ?? null,
          billingCountry: dto.billingCountry,
          contactEmail: dto.contactEmail ?? null,
          contactPhone: dto.contactPhone ?? null,
          contactPersonName: dto.contactPersonName ?? null,
          note: dto.note ?? null,
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
    dto: UpdateCorporateAccountDto,
  ) {
    assertCanManage(role);
    return this.dbService.withRlsContext(ctxFor(tenantId, userId, role), async (tx) => {
      const updateData: Record<string, unknown> = { updatedAt: new Date() };
      for (const key of [
        'companyName',
        'vatId',
        'companyRegId',
        'billingAddressLine1',
        'billingAddressLine2',
        'billingCity',
        'billingZip',
        'billingCountry',
        'contactEmail',
        'contactPhone',
        'contactPersonName',
        'note',
        'isActive',
      ] as const) {
        if (dto[key] !== undefined) updateData[key] = dto[key];
      }
      const [updated] = await tx
        .update(schema.corporateAccounts)
        .set(updateData)
        .where(
          and(eq(schema.corporateAccounts.id, id), eq(schema.corporateAccounts.tenantId, tenantId)),
        )
        .returning();
      if (!updated) {
        throw new NotFoundException({
          error: { code: 'CORPORATE_ACCOUNT_NOT_FOUND', message: 'Firma nenalezena.' },
        });
      }
      return updated;
    });
  }

  async delete(tenantId: string, userId: string, role: AppRole, id: string) {
    assertCanManage(role);
    await this.dbService.withRlsContext(ctxFor(tenantId, userId, role), async (tx) => {
      await tx
        .update(schema.corporateAccounts)
        .set({ deletedAt: new Date(), updatedAt: new Date() })
        .where(
          and(eq(schema.corporateAccounts.id, id), eq(schema.corporateAccounts.tenantId, tenantId)),
        );
    });
  }

  // ─── Member management ──────────────────────────────────────────

  async listMembers(tenantId: string, userId: string, role: AppRole, corporateAccountId: string) {
    return this.dbService.withRlsContext(ctxFor(tenantId, userId, role), async (tx) => {
      const rows = await tx
        .select({
          member: schema.corporateAccountMembers,
          customer: {
            id: schema.customers.id,
            firstName: schema.customers.firstName,
            lastName: schema.customers.lastName,
            email: schema.customers.email,
            phone: schema.customers.phone,
          },
        })
        .from(schema.corporateAccountMembers)
        .innerJoin(
          schema.customers,
          eq(schema.corporateAccountMembers.customerId, schema.customers.id),
        )
        .where(
          and(
            eq(schema.corporateAccountMembers.tenantId, tenantId),
            eq(schema.corporateAccountMembers.corporateAccountId, corporateAccountId),
            isNull(schema.corporateAccountMembers.removedAt),
          ),
        )
        .orderBy(asc(schema.customers.lastName), asc(schema.customers.firstName));
      return rows.map((r) => ({ ...r.member, customer: r.customer }));
    });
  }

  async addMember(
    tenantId: string,
    userId: string,
    role: AppRole,
    corporateAccountId: string,
    dto: AddMemberDto,
  ) {
    assertCanManage(role);
    return this.dbService.withRlsContext(ctxFor(tenantId, userId, role), async (tx) => {
      // Overit ze firma existuje (+ tenant match) a zakaznik existuje
      const [account] = await tx
        .select({ id: schema.corporateAccounts.id })
        .from(schema.corporateAccounts)
        .where(
          and(
            eq(schema.corporateAccounts.id, corporateAccountId),
            eq(schema.corporateAccounts.tenantId, tenantId),
          ),
        )
        .limit(1);
      if (!account) {
        throw new NotFoundException({
          error: { code: 'CORPORATE_ACCOUNT_NOT_FOUND', message: 'Firma nenalezena.' },
        });
      }
      const [customer] = await tx
        .select({ id: schema.customers.id })
        .from(schema.customers)
        .where(
          and(eq(schema.customers.id, dto.customerId), eq(schema.customers.tenantId, tenantId)),
        )
        .limit(1);
      if (!customer) {
        throw new NotFoundException({
          error: { code: 'CUSTOMER_NOT_FOUND', message: 'Zákazník nenalezen.' },
        });
      }

      // Kontrola jiz existujiciho aktivniho clenstvi
      const [existing] = await tx
        .select({ id: schema.corporateAccountMembers.id })
        .from(schema.corporateAccountMembers)
        .where(
          and(
            eq(schema.corporateAccountMembers.tenantId, tenantId),
            eq(schema.corporateAccountMembers.corporateAccountId, corporateAccountId),
            eq(schema.corporateAccountMembers.customerId, dto.customerId),
            isNull(schema.corporateAccountMembers.removedAt),
          ),
        )
        .limit(1);
      if (existing) {
        throw new BadRequestException({
          error: {
            code: 'MEMBER_ALREADY_EXISTS',
            message: 'Tento zákazník už je členem firmy.',
          },
        });
      }

      const [created] = await tx
        .insert(schema.corporateAccountMembers)
        .values({
          tenantId,
          corporateAccountId,
          customerId: dto.customerId,
          role: dto.role,
          addedBy: userId,
        })
        .returning();
      return created!;
    });
  }

  async updateMember(
    tenantId: string,
    userId: string,
    role: AppRole,
    memberId: string,
    dto: UpdateMemberDto,
  ) {
    assertCanManage(role);
    return this.dbService.withRlsContext(ctxFor(tenantId, userId, role), async (tx) => {
      const [updated] = await tx
        .update(schema.corporateAccountMembers)
        .set({ role: dto.role })
        .where(
          and(
            eq(schema.corporateAccountMembers.id, memberId),
            eq(schema.corporateAccountMembers.tenantId, tenantId),
          ),
        )
        .returning();
      if (!updated) {
        throw new NotFoundException({
          error: { code: 'MEMBER_NOT_FOUND', message: 'Členství nenalezeno.' },
        });
      }
      return updated;
    });
  }

  async removeMember(
    tenantId: string,
    userId: string,
    role: AppRole,
    memberId: string,
  ): Promise<void> {
    assertCanManage(role);
    await this.dbService.withRlsContext(ctxFor(tenantId, userId, role), async (tx) => {
      const [updated] = await tx
        .update(schema.corporateAccountMembers)
        .set({ removedAt: new Date() })
        .where(
          and(
            eq(schema.corporateAccountMembers.id, memberId),
            eq(schema.corporateAccountMembers.tenantId, tenantId),
            isNull(schema.corporateAccountMembers.removedAt),
          ),
        )
        .returning();
      if (!updated) {
        throw new NotFoundException({
          error: { code: 'MEMBER_NOT_FOUND', message: 'Aktivní členství nenalezeno.' },
        });
      }
    });
  }

  // ─── Reporting (sprint 3.3 fáze B3) ──────────────────────────────

  /**
   * Souhrnny report pro firmu: aktivni balicky (count + zbyvajici credity/items),
   * celkove utracene castky, pocet aktivnich clenu.
   */
  async getSummary(tenantId: string, userId: string, role: AppRole, corporateAccountId: string) {
    assertCanManage(role);
    return this.dbService.withRlsContext(ctxFor(tenantId, userId, role), async (tx) => {
      // Active members count
      const memberRows = await tx
        .select({ activeMembers: count() })
        .from(schema.corporateAccountMembers)
        .where(
          and(
            eq(schema.corporateAccountMembers.tenantId, tenantId),
            eq(schema.corporateAccountMembers.corporateAccountId, corporateAccountId),
            isNull(schema.corporateAccountMembers.removedAt),
          ),
        );
      const activeMembers = memberRows[0]?.activeMembers ?? 0;

      // Credit packs souhrn
      const creditRows = await tx
        .select({
          status: schema.customerCreditPacks.status,
          remaining: schema.customerCreditPacks.creditsRemaining,
          priceHellers: schema.customerCreditPacks.pricePaidHellers,
        })
        .from(schema.customerCreditPacks)
        .where(
          and(
            eq(schema.customerCreditPacks.tenantId, tenantId),
            eq(schema.customerCreditPacks.corporateAccountId, corporateAccountId),
          ),
        );

      const creditActive = creditRows.filter((r) => r.status === 'active');
      const creditTotalSpent = creditRows.reduce((s, r) => s + r.priceHellers, 0);
      const creditRemainingSum = creditActive.reduce((s, r) => s + r.remaining, 0);

      // Bundle packs souhrn (items_remaining je JSONB array, secteme quantity)
      const bundleRows = await tx
        .select({
          status: schema.customerBundlePacks.status,
          itemsRemaining: schema.customerBundlePacks.itemsRemaining,
          priceHellers: schema.customerBundlePacks.pricePaidHellers,
        })
        .from(schema.customerBundlePacks)
        .where(
          and(
            eq(schema.customerBundlePacks.tenantId, tenantId),
            eq(schema.customerBundlePacks.corporateAccountId, corporateAccountId),
          ),
        );

      const bundleActive = bundleRows.filter((r) => r.status === 'active');
      const bundleTotalSpent = bundleRows.reduce((s, r) => s + r.priceHellers, 0);
      const bundleRemainingItems = bundleActive.reduce((s, r) => {
        const items = (r.itemsRemaining ?? []) as Array<{ quantity: number }>;
        return s + items.reduce((ss, i) => ss + i.quantity, 0);
      }, 0);

      // Time packs souhrn
      const timeRows = await tx
        .select({
          status: schema.customerTimePacks.status,
          maxPerPeriod: schema.customerTimePacks.snapshotMaxBookingsPerPeriod,
          used: schema.customerTimePacks.bookingsUsed,
          priceHellers: schema.customerTimePacks.pricePaidHellers,
        })
        .from(schema.customerTimePacks)
        .where(
          and(
            eq(schema.customerTimePacks.tenantId, tenantId),
            eq(schema.customerTimePacks.corporateAccountId, corporateAccountId),
          ),
        );

      const timeActive = timeRows.filter((r) => r.status === 'active');
      const timeTotalSpent = timeRows.reduce((s, r) => s + r.priceHellers, 0);

      return {
        activeMembers,
        creditPacks: {
          total: creditRows.length,
          active: creditActive.length,
          remainingCredits: creditRemainingSum,
          totalSpentHellers: creditTotalSpent,
        },
        bundlePacks: {
          total: bundleRows.length,
          active: bundleActive.length,
          remainingItems: bundleRemainingItems,
          totalSpentHellers: bundleTotalSpent,
        },
        timePacks: {
          total: timeRows.length,
          active: timeActive.length,
          totalSpentHellers: timeTotalSpent,
        },
        totalSpentHellers: creditTotalSpent + bundleTotalSpent + timeTotalSpent,
      };
    });
  }

  /**
   * Detailni usage report — kdo z firmy kdy kolik cerpal.
   *
   * Vrati unified list pres vsechny 3 typy balicku (credit/bundle/time)
   * filtrovany kde owner = corporate. Pripadne casovy filtr.
   */
  async getUsageReport(
    tenantId: string,
    userId: string,
    role: AppRole,
    corporateAccountId: string,
    options: { fromDate?: Date; toDate?: Date } = {},
  ) {
    assertCanManage(role);
    return this.dbService.withRlsContext(ctxFor(tenantId, userId, role), async (tx) => {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const dateFilter = (col: any) => {
        const conds = [] as ReturnType<typeof gte>[];
        if (options.fromDate) conds.push(gte(col, options.fromDate));
        if (options.toDate) conds.push(lte(col, options.toDate));
        return conds.length > 0 ? and(...conds) : undefined;
      };

      // Credit usage
      const creditUsages = await tx
        .select({
          useId: schema.creditUses.id,
          createdAt: schema.creditUses.createdAt,
          quantity: schema.creditUses.creditsDeducted,
          action: schema.creditUses.action,
          bookingId: schema.creditUses.bookingId,
          customerId: schema.bookings.customerId,
          customerName: schema.bookings.customerName,
          serviceId: schema.bookings.serviceId,
        })
        .from(schema.creditUses)
        .innerJoin(
          schema.customerCreditPacks,
          eq(schema.creditUses.customerCreditPackId, schema.customerCreditPacks.id),
        )
        .leftJoin(schema.bookings, eq(schema.creditUses.bookingId, schema.bookings.id))
        .where(
          and(
            eq(schema.creditUses.tenantId, tenantId),
            eq(schema.customerCreditPacks.corporateAccountId, corporateAccountId),
            dateFilter(schema.creditUses.createdAt),
          ),
        )
        .orderBy(desc(schema.creditUses.createdAt));

      // Bundle usage
      const bundleUsages = await tx
        .select({
          useId: schema.bundleItemUses.id,
          createdAt: schema.bundleItemUses.createdAt,
          quantity: schema.bundleItemUses.quantityDeducted,
          action: schema.bundleItemUses.action,
          bookingId: schema.bundleItemUses.bookingId,
          serviceId: schema.bundleItemUses.serviceId,
          customerId: schema.bookings.customerId,
          customerName: schema.bookings.customerName,
        })
        .from(schema.bundleItemUses)
        .innerJoin(
          schema.customerBundlePacks,
          eq(schema.bundleItemUses.customerBundlePackId, schema.customerBundlePacks.id),
        )
        .leftJoin(schema.bookings, eq(schema.bundleItemUses.bookingId, schema.bookings.id))
        .where(
          and(
            eq(schema.bundleItemUses.tenantId, tenantId),
            eq(schema.customerBundlePacks.corporateAccountId, corporateAccountId),
            dateFilter(schema.bundleItemUses.createdAt),
          ),
        )
        .orderBy(desc(schema.bundleItemUses.createdAt));

      // Time usage
      const timeUsages = await tx
        .select({
          useId: schema.timePackUses.id,
          createdAt: schema.timePackUses.createdAt,
          action: schema.timePackUses.action,
          bookingId: schema.timePackUses.bookingId,
          serviceId: schema.timePackUses.serviceId,
          customerId: schema.bookings.customerId,
          customerName: schema.bookings.customerName,
        })
        .from(schema.timePackUses)
        .innerJoin(
          schema.customerTimePacks,
          eq(schema.timePackUses.customerTimePackId, schema.customerTimePacks.id),
        )
        .leftJoin(schema.bookings, eq(schema.timePackUses.bookingId, schema.bookings.id))
        .where(
          and(
            eq(schema.timePackUses.tenantId, tenantId),
            eq(schema.customerTimePacks.corporateAccountId, corporateAccountId),
            dateFilter(schema.timePackUses.createdAt),
          ),
        )
        .orderBy(desc(schema.timePackUses.createdAt));

      // Unified format
      const usages = [
        ...creditUsages.map((u) => ({
          type: 'credit' as const,
          useId: u.useId,
          createdAt: u.createdAt,
          quantity: u.quantity,
          action: u.action,
          bookingId: u.bookingId,
          customerId: u.customerId,
          customerName: u.customerName,
          serviceId: u.serviceId,
        })),
        ...bundleUsages.map((u) => ({
          type: 'bundle' as const,
          useId: u.useId,
          createdAt: u.createdAt,
          quantity: u.quantity,
          action: u.action,
          bookingId: u.bookingId,
          customerId: u.customerId,
          customerName: u.customerName,
          serviceId: u.serviceId,
        })),
        ...timeUsages.map((u) => ({
          type: 'time' as const,
          useId: u.useId,
          createdAt: u.createdAt,
          quantity: 1,
          action: u.action,
          bookingId: u.bookingId,
          customerId: u.customerId,
          customerName: u.customerName,
          serviceId: u.serviceId,
        })),
      ].sort((a, b) => b.createdAt.getTime() - a.createdAt.getTime());

      return {
        fromDate: options.fromDate ?? null,
        toDate: options.toDate ?? null,
        totalUsages: usages.length,
        usages,
      };
    });
  }

  /**
   * Pro daneho zakaznika vrati seznam firem, do ktery patri (aktivni clenstvi).
   * Pouzije se v B2 phase pri kontrole nakupu z firemnich balicku.
   */
  async listForCustomer(tenantId: string, userId: string, role: AppRole, customerId: string) {
    return this.dbService.withRlsContext(ctxFor(tenantId, userId, role), async (tx) => {
      const rows = await tx
        .select({
          member: schema.corporateAccountMembers,
          account: schema.corporateAccounts,
        })
        .from(schema.corporateAccountMembers)
        .innerJoin(
          schema.corporateAccounts,
          eq(schema.corporateAccountMembers.corporateAccountId, schema.corporateAccounts.id),
        )
        .where(
          and(
            eq(schema.corporateAccountMembers.tenantId, tenantId),
            eq(schema.corporateAccountMembers.customerId, customerId),
            isNull(schema.corporateAccountMembers.removedAt),
            isNull(schema.corporateAccounts.deletedAt),
          ),
        )
        .orderBy(desc(schema.corporateAccountMembers.joinedAt));
      return rows.map((r) => ({ ...r.member, account: r.account }));
    });
  }
}
