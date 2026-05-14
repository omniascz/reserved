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
import { and, asc, desc, eq, isNull } from 'drizzle-orm';
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
