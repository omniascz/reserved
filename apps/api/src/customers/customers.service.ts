// CustomersService — CRUD + auto-find-or-create při bookingu.

import { ForbiddenException, Inject, Injectable, NotFoundException } from '@nestjs/common';
import { and, asc, desc, eq, ilike, or, sql, isNull } from 'drizzle-orm';
import { schema } from '@reserved/db';
import { serviceContext, type AppRole, type TenantContext } from '@reserved/rls-multitenancy';
import { DbService, type Database } from '../db/db.service.js';
import type {
  CreateCustomerNoteDto,
  CreateCustomerTagDto,
  UpdateCustomerDto,
} from './dto/customer.dto.js';

const MANAGE_ROLES: AppRole[] = ['owner', 'manager', 'employee', 'receptionist'];

function ctxFor(tenantId: string, userId: string, role: AppRole): TenantContext {
  return { tenantId, userId, role };
}

function assertCanManage(role: AppRole): void {
  if (!MANAGE_ROLES.includes(role)) {
    throw new ForbiddenException({
      error: {
        code: 'INSUFFICIENT_ROLE',
        message: 'Nedostatečná oprávnění.',
      },
    });
  }
}

@Injectable()
export class CustomersService {
  constructor(@Inject(DbService) private readonly dbService: DbService) {}

  /**
   * Najde existující customer podle (tenantId, email), nebo vytvoří nového.
   * Volá se z bookingu, kdy chceme automaticky CRM zaznam.
   *
   * Předá se hotová transakce — voláme uvnitř větší booking transakce.
   */
  async findOrCreate(
    tx: Database,
    tenantId: string,
    input: {
      firstName: string;
      lastName: string;
      email: string;
      phone?: string | null;
    },
  ): Promise<{ id: string; isNew: boolean }> {
    const existing = await tx
      .select({ id: schema.customers.id })
      .from(schema.customers)
      .where(
        and(
          eq(schema.customers.tenantId, tenantId),
          eq(schema.customers.email, input.email.toLowerCase()),
        ),
      )
      .limit(1);

    if (existing[0]) {
      return { id: existing[0].id, isNew: false };
    }

    const [created] = await tx
      .insert(schema.customers)
      .values({
        tenantId,
        firstName: input.firstName,
        lastName: input.lastName,
        email: input.email.toLowerCase(),
        phone: input.phone ?? null,
      })
      .returning({ id: schema.customers.id });

    return { id: created!.id, isNew: true };
  }

  // ─── Admin endpointy ─────────────────────────────────────────────────

  async list(
    tenantId: string,
    userId: string,
    role: AppRole,
    query: { search?: string; tag?: string },
  ) {
    return this.dbService.withRlsContext(ctxFor(tenantId, userId, role), async (tx) => {
      const conditions = [
        eq(schema.customers.tenantId, tenantId),
        isNull(schema.customers.deletedAt),
      ];

      if (query.search && query.search.trim() !== '') {
        const term = `%${query.search.trim()}%`;
        conditions.push(
          or(
            ilike(schema.customers.firstName, term),
            ilike(schema.customers.lastName, term),
            ilike(schema.customers.email, term),
            ilike(schema.customers.phone, term),
          )!,
        );
      }

      let rows;
      if (query.tag) {
        // Join customer_tags
        rows = await tx
          .selectDistinct({
            id: schema.customers.id,
            firstName: schema.customers.firstName,
            lastName: schema.customers.lastName,
            email: schema.customers.email,
            phone: schema.customers.phone,
            customerType: schema.customers.customerType,
            createdAt: schema.customers.createdAt,
          })
          .from(schema.customers)
          .innerJoin(
            schema.customerTags,
            and(
              eq(schema.customerTags.customerId, schema.customers.id),
              eq(schema.customerTags.tag, query.tag),
            ),
          )
          .where(and(...conditions))
          .orderBy(asc(schema.customers.lastName), asc(schema.customers.firstName))
          .limit(200);
      } else {
        rows = await tx
          .select({
            id: schema.customers.id,
            firstName: schema.customers.firstName,
            lastName: schema.customers.lastName,
            email: schema.customers.email,
            phone: schema.customers.phone,
            customerType: schema.customers.customerType,
            createdAt: schema.customers.createdAt,
          })
          .from(schema.customers)
          .where(and(...conditions))
          .orderBy(asc(schema.customers.lastName), asc(schema.customers.firstName))
          .limit(200);
      }

      return rows;
    });
  }

  async getDetail(tenantId: string, userId: string, role: AppRole, customerId: string) {
    const result = await this.dbService.withRlsContext(
      ctxFor(tenantId, userId, role),
      async (tx) => {
        const customerRows = await tx
          .select()
          .from(schema.customers)
          .where(and(eq(schema.customers.id, customerId), eq(schema.customers.tenantId, tenantId)))
          .limit(1);
        const customer = customerRows[0];
        if (!customer) return null;

        const tags = await tx
          .select()
          .from(schema.customerTags)
          .where(eq(schema.customerTags.customerId, customerId));

        const notes = await tx
          .select()
          .from(schema.customerNotes)
          .where(eq(schema.customerNotes.customerId, customerId))
          .orderBy(desc(schema.customerNotes.createdAt));

        const bookings = await tx
          .select({
            id: schema.bookings.id,
            startsAt: schema.bookings.startsAt,
            endsAt: schema.bookings.endsAt,
            status: schema.bookings.status,
            serviceId: schema.bookings.serviceId,
            employeeId: schema.bookings.employeeId,
            referenceCode: schema.bookings.referenceCode,
            pricePaidHellers: schema.bookings.pricePaidHellers,
          })
          .from(schema.bookings)
          .where(
            and(eq(schema.bookings.tenantId, tenantId), eq(schema.bookings.customerId, customerId)),
          )
          .orderBy(desc(schema.bookings.startsAt))
          .limit(100);

        // Stats
        const completedCount = bookings.filter((b) => b.status === 'completed').length;
        const cancelledCount = bookings.filter((b) => b.status === 'cancelled').length;
        const noShowCount = bookings.filter((b) => b.status === 'no_show').length;
        const totalSpentHellers = bookings
          .filter((b) => b.status === 'completed')
          .reduce((sum, b) => sum + b.pricePaidHellers, 0);

        return {
          customer,
          tags,
          notes,
          bookings,
          stats: {
            totalBookings: bookings.length,
            completedCount,
            cancelledCount,
            noShowCount,
            totalSpentHellers,
          },
        };
      },
    );

    if (!result) {
      throw new NotFoundException({
        error: { code: 'CUSTOMER_NOT_FOUND', message: 'Zákazník nenalezen.' },
      });
    }
    return result;
  }

  async update(
    tenantId: string,
    userId: string,
    role: AppRole,
    customerId: string,
    dto: UpdateCustomerDto,
  ) {
    assertCanManage(role);
    return this.dbService.withRlsContext(ctxFor(tenantId, userId, role), async (tx) => {
      const [row] = await tx
        .update(schema.customers)
        .set({
          ...(dto.firstName !== undefined ? { firstName: dto.firstName } : {}),
          ...(dto.lastName !== undefined ? { lastName: dto.lastName } : {}),
          ...(dto.email !== undefined ? { email: dto.email.toLowerCase() } : {}),
          ...(dto.phone !== undefined ? { phone: dto.phone } : {}),
          ...(dto.customerType !== undefined ? { customerType: dto.customerType } : {}),
          ...(dto.marketingOptIn !== undefined ? { marketingOptIn: dto.marketingOptIn } : {}),
          updatedAt: new Date(),
        })
        .where(and(eq(schema.customers.id, customerId), eq(schema.customers.tenantId, tenantId)))
        .returning();
      if (!row) {
        throw new NotFoundException({
          error: { code: 'CUSTOMER_NOT_FOUND', message: 'Zákazník nenalezen.' },
        });
      }
      return row;
    });
  }

  // ─── Tags ────────────────────────────────────────────────────────────

  async addTag(
    tenantId: string,
    userId: string,
    role: AppRole,
    customerId: string,
    dto: CreateCustomerTagDto,
  ) {
    assertCanManage(role);
    return this.dbService.withRlsContext(ctxFor(tenantId, userId, role), async (tx) => {
      const [row] = await tx
        .insert(schema.customerTags)
        .values({
          tenantId,
          customerId,
          tag: dto.tag,
          color: dto.color ?? null,
          createdBy: userId,
        })
        .onConflictDoNothing()
        .returning();
      return row;
    });
  }

  async removeTag(
    tenantId: string,
    userId: string,
    role: AppRole,
    customerId: string,
    tag: string,
  ) {
    assertCanManage(role);
    await this.dbService.withRlsContext(ctxFor(tenantId, userId, role), async (tx) => {
      await tx
        .delete(schema.customerTags)
        .where(
          and(
            eq(schema.customerTags.tenantId, tenantId),
            eq(schema.customerTags.customerId, customerId),
            eq(schema.customerTags.tag, tag),
          ),
        );
    });
  }

  // ─── Notes ───────────────────────────────────────────────────────────

  async addNote(
    tenantId: string,
    userId: string,
    role: AppRole,
    customerId: string,
    dto: CreateCustomerNoteDto,
  ) {
    assertCanManage(role);
    return this.dbService.withRlsContext(ctxFor(tenantId, userId, role), async (tx) => {
      const [row] = await tx
        .insert(schema.customerNotes)
        .values({
          tenantId,
          customerId,
          note: dto.note,
          category: dto.category,
          visibility: dto.visibility,
          createdBy: userId,
        })
        .returning();
      return row;
    });
  }

  async deleteNote(
    tenantId: string,
    userId: string,
    role: AppRole,
    customerId: string,
    noteId: string,
  ) {
    assertCanManage(role);
    await this.dbService.withRlsContext(ctxFor(tenantId, userId, role), async (tx) => {
      await tx
        .delete(schema.customerNotes)
        .where(
          and(
            eq(schema.customerNotes.tenantId, tenantId),
            eq(schema.customerNotes.id, noteId),
            eq(schema.customerNotes.customerId, customerId),
          ),
        );
    });
  }

  // ─── Service: list všech tagů v tenantu (pro tag filter) ─────────────

  async listTagsInTenant(tenantId: string, userId: string, role: AppRole) {
    return this.dbService.withRlsContext(ctxFor(tenantId, userId, role), async (tx) => {
      const rows = await tx
        .select({
          tag: schema.customerTags.tag,
          color: schema.customerTags.color,
          count: sql<number>`count(*)::int`,
        })
        .from(schema.customerTags)
        .where(eq(schema.customerTags.tenantId, tenantId))
        .groupBy(schema.customerTags.tag, schema.customerTags.color)
        .orderBy(asc(schema.customerTags.tag));
      return rows;
    });
  }
}
