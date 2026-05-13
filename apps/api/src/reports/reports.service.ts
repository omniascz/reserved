// ReportsService — agregovane statistiky pro admin dashboard.
//
// Vsechny dotazy filtruji datumovym rozsahem [from, to) + volitelne branchId.
// SQL aggregaty s drizzle (COUNT, SUM, AVG, date_trunc).

import { ForbiddenException, Inject, Injectable } from '@nestjs/common';
import { and, count, desc, eq, gte, isNull, lt, sql, sum } from 'drizzle-orm';
import { schema } from '@reserved/db';
import { type AppRole, type TenantContext } from '@reserved/rls-multitenancy';
import { DbService } from '../db/db.service.js';

const VIEW_ROLES: AppRole[] = ['owner', 'manager'];

function ctxFor(tenantId: string, userId: string, role: AppRole): TenantContext {
  return { tenantId, userId, role };
}

function assertCanView(role: AppRole): void {
  if (!VIEW_ROLES.includes(role)) {
    throw new ForbiddenException({
      error: {
        code: 'INSUFFICIENT_ROLE',
        message: 'Reporty vidí jen owner nebo manager.',
      },
    });
  }
}

export interface ReportFilters {
  from: Date;
  to: Date;
  branchId?: string | null;
}

@Injectable()
export class ReportsService {
  constructor(@Inject(DbService) private readonly dbService: DbService) {}

  // ─── Overview KPI ──────────────────────────────────────────────────

  async overview(tenantId: string, userId: string, role: AppRole, filters: ReportFilters) {
    assertCanView(role);
    return this.dbService.withRlsContext(ctxFor(tenantId, userId, role), async (tx) => {
      const baseConditions = [
        eq(schema.bookings.tenantId, tenantId),
        gte(schema.bookings.startsAt, filters.from),
        lt(schema.bookings.startsAt, filters.to),
      ];
      if (filters.branchId) {
        baseConditions.push(eq(schema.bookings.branchId, filters.branchId));
      }

      const [totals] = await tx
        .select({
          total: count(),
          revenueHellers: sum(schema.bookings.pricePaidHellers).mapWith(Number),
          completedCount: sql<number>`COUNT(*) FILTER (WHERE status = 'completed')`.mapWith(Number),
          cancelledCount: sql<number>`COUNT(*) FILTER (WHERE status = 'cancelled')`.mapWith(Number),
          noShowCount: sql<number>`COUNT(*) FILTER (WHERE status = 'no_show')`.mapWith(Number),
          confirmedCount: sql<number>`COUNT(*) FILTER (WHERE status = 'confirmed')`.mapWith(Number),
        })
        .from(schema.bookings)
        .where(and(...baseConditions));

      // Unique customers v obdobi
      const uniqueRows = await tx
        .selectDistinct({ customerId: schema.bookings.customerId })
        .from(schema.bookings)
        .where(and(...baseConditions));
      const uniqueCustomers = uniqueRows.filter((r) => r.customerId !== null).length;

      // Pocet aktivnich balicku (jen relevantni pro tenanta, ignoruj filtr branch)
      const creditRows = await tx
        .select({ c: count() })
        .from(schema.customerCreditPacks)
        .where(
          and(
            eq(schema.customerCreditPacks.tenantId, tenantId),
            eq(schema.customerCreditPacks.status, 'active'),
          ),
        );
      const activeCreditPacks = creditRows[0]?.c ?? 0;

      return {
        totalBookings: totals?.total ?? 0,
        revenueHellers: totals?.revenueHellers ?? 0,
        completedCount: totals?.completedCount ?? 0,
        cancelledCount: totals?.cancelledCount ?? 0,
        noShowCount: totals?.noShowCount ?? 0,
        confirmedCount: totals?.confirmedCount ?? 0,
        uniqueCustomers,
        activeCreditPacks,
      };
    });
  }

  // ─── Bookings per day (chart data) ────────────────────────────────

  async bookingsPerDay(tenantId: string, userId: string, role: AppRole, filters: ReportFilters) {
    assertCanView(role);
    return this.dbService.withRlsContext(ctxFor(tenantId, userId, role), async (tx) => {
      const conditions = [
        eq(schema.bookings.tenantId, tenantId),
        gte(schema.bookings.startsAt, filters.from),
        lt(schema.bookings.startsAt, filters.to),
      ];
      if (filters.branchId) conditions.push(eq(schema.bookings.branchId, filters.branchId));

      const rows = await tx
        .select({
          day: sql<string>`TO_CHAR(DATE_TRUNC('day', starts_at AT TIME ZONE 'Europe/Prague'), 'YYYY-MM-DD')`,
          count: count(),
          revenueHellers: sum(schema.bookings.pricePaidHellers).mapWith(Number),
        })
        .from(schema.bookings)
        .where(and(...conditions))
        .groupBy(sql`DATE_TRUNC('day', starts_at AT TIME ZONE 'Europe/Prague')`)
        .orderBy(sql`DATE_TRUNC('day', starts_at AT TIME ZONE 'Europe/Prague')`);

      return rows.map((r) => ({
        day: r.day,
        count: r.count,
        revenueHellers: r.revenueHellers ?? 0,
      }));
    });
  }

  // ─── Top services ─────────────────────────────────────────────────

  async topServices(
    tenantId: string,
    userId: string,
    role: AppRole,
    filters: ReportFilters,
    limit = 10,
  ) {
    assertCanView(role);
    return this.dbService.withRlsContext(ctxFor(tenantId, userId, role), async (tx) => {
      const conditions = [
        eq(schema.bookings.tenantId, tenantId),
        gte(schema.bookings.startsAt, filters.from),
        lt(schema.bookings.startsAt, filters.to),
      ];
      if (filters.branchId) conditions.push(eq(schema.bookings.branchId, filters.branchId));

      const rows = await tx
        .select({
          serviceId: schema.bookings.serviceId,
          serviceName: schema.services.name,
          bookings: count(),
          revenueHellers: sum(schema.bookings.pricePaidHellers).mapWith(Number),
        })
        .from(schema.bookings)
        .leftJoin(schema.services, eq(schema.bookings.serviceId, schema.services.id))
        .where(and(...conditions))
        .groupBy(schema.bookings.serviceId, schema.services.name)
        .orderBy(desc(count()))
        .limit(limit);

      return rows.map((r) => ({
        serviceId: r.serviceId,
        serviceName: r.serviceName ?? '(smazaná služba)',
        bookings: r.bookings,
        revenueHellers: r.revenueHellers ?? 0,
      }));
    });
  }

  // ─── Top employees ────────────────────────────────────────────────

  async topEmployees(
    tenantId: string,
    userId: string,
    role: AppRole,
    filters: ReportFilters,
    limit = 10,
  ) {
    assertCanView(role);
    return this.dbService.withRlsContext(ctxFor(tenantId, userId, role), async (tx) => {
      const conditions = [
        eq(schema.bookings.tenantId, tenantId),
        gte(schema.bookings.startsAt, filters.from),
        lt(schema.bookings.startsAt, filters.to),
      ];
      if (filters.branchId) conditions.push(eq(schema.bookings.branchId, filters.branchId));

      const rows = await tx
        .select({
          employeeId: schema.bookings.employeeId,
          firstName: schema.employees.firstName,
          lastName: schema.employees.lastName,
          bookings: count(),
          completedCount:
            sql<number>`COUNT(*) FILTER (WHERE ${schema.bookings.status} = 'completed')`.mapWith(
              Number,
            ),
          revenueHellers: sum(schema.bookings.pricePaidHellers).mapWith(Number),
        })
        .from(schema.bookings)
        .leftJoin(schema.employees, eq(schema.bookings.employeeId, schema.employees.id))
        .where(and(...conditions))
        .groupBy(schema.bookings.employeeId, schema.employees.firstName, schema.employees.lastName)
        .orderBy(desc(count()))
        .limit(limit);

      return rows.map((r) => ({
        employeeId: r.employeeId,
        name: r.firstName ? `${r.firstName} ${r.lastName ?? ''}`.trim() : '(bez zaměstnance)',
        bookings: r.bookings,
        completedCount: r.completedCount,
        revenueHellers: r.revenueHellers ?? 0,
      }));
    });
  }

  // ─── Top customers ────────────────────────────────────────────────

  async topCustomers(
    tenantId: string,
    userId: string,
    role: AppRole,
    filters: ReportFilters,
    limit = 20,
  ) {
    assertCanView(role);
    return this.dbService.withRlsContext(ctxFor(tenantId, userId, role), async (tx) => {
      const conditions = [
        eq(schema.bookings.tenantId, tenantId),
        gte(schema.bookings.startsAt, filters.from),
        lt(schema.bookings.startsAt, filters.to),
      ];
      if (filters.branchId) conditions.push(eq(schema.bookings.branchId, filters.branchId));

      const rows = await tx
        .select({
          customerId: schema.bookings.customerId,
          firstName: schema.customers.firstName,
          lastName: schema.customers.lastName,
          email: schema.customers.email,
          bookings: count(),
          spentHellers: sum(schema.bookings.pricePaidHellers).mapWith(Number),
          noShowCount:
            sql<number>`COUNT(*) FILTER (WHERE ${schema.bookings.status} = 'no_show')`.mapWith(
              Number,
            ),
        })
        .from(schema.bookings)
        .leftJoin(schema.customers, eq(schema.bookings.customerId, schema.customers.id))
        .where(and(...conditions))
        .groupBy(
          schema.bookings.customerId,
          schema.customers.firstName,
          schema.customers.lastName,
          schema.customers.email,
        )
        .orderBy(desc(count()))
        .limit(limit);

      return rows
        .filter((r) => r.customerId !== null) // skip bookings bez customer reference
        .map((r) => ({
          customerId: r.customerId,
          name: `${r.firstName ?? ''} ${r.lastName ?? ''}`.trim() || '(neznamy)',
          email: r.email ?? '',
          bookings: r.bookings,
          spentHellers: r.spentHellers ?? 0,
          noShowCount: r.noShowCount,
        }));
    });
  }

  // ─── Credit packs summary ────────────────────────────────────────

  async creditPacksSummary(tenantId: string, userId: string, role: AppRole) {
    assertCanView(role);
    return this.dbService.withRlsContext(ctxFor(tenantId, userId, role), async (tx) => {
      const rows = await tx
        .select({
          status: schema.customerCreditPacks.status,
          count: count(),
          totalCreditsRemaining: sum(schema.customerCreditPacks.creditsRemaining).mapWith(Number),
          totalRevenueHellers: sum(schema.customerCreditPacks.pricePaidHellers).mapWith(Number),
        })
        .from(schema.customerCreditPacks)
        .where(eq(schema.customerCreditPacks.tenantId, tenantId))
        .groupBy(schema.customerCreditPacks.status);

      return rows.map((r) => ({
        status: r.status,
        count: r.count,
        totalCreditsRemaining: r.totalCreditsRemaining ?? 0,
        totalRevenueHellers: r.totalRevenueHellers ?? 0,
      }));
    });
  }
}
