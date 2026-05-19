// PlatformTenantsService — read-only operace nad tenanty pro master admina.
//
// Vsechny dotazy bezi v service kontextu (bypass tenant RLS filteru), protoze
// master admin vidi vsechny tenanty napric celou platformou.

import { Inject, Injectable, NotFoundException } from '@nestjs/common';
import { and, eq, ilike, sql, isNull, isNotNull, count, desc, gte, or } from 'drizzle-orm';
import { schema } from '@reserved/db';
import { serviceContext } from '@reserved/rls-multitenancy';
import { DbService } from '../db/db.service.js';

export interface TenantListFilters {
  status?: string;
  plan?: string;
  businessType?: string;
  search?: string;
  limit?: number;
  offset?: number;
}

export interface TenantListRow {
  id: string;
  slug: string;
  name: string;
  ownerEmail: string | null;
  businessType: string | null;
  plan: string;
  status: string;
  suspendedAt: Date | null;
  trialEndsAt: Date | null;
  createdAt: Date;
  deletedAt: Date | null;
  lastActivityAt: Date | null;
}

export interface TenantListResult {
  data: TenantListRow[];
  total: number;
}

export interface TenantDetail extends TenantListRow {
  customDomain: string | null;
  locale: string;
  timezone: string;
  currency: string;
  suspensionReason: string | null;
  updatedAt: Date;
  /** Stripe billing details — pro master admin přehled. */
  stripeCustomerId: string | null;
  stripeSubscriptionId: string | null;
  stripeSubscriptionStatus: string | null;
  currentPeriodEnd: Date | null;
  cancelAtPeriodEnd: boolean;
  billingEmail: string | null;
}

export interface TenantActivity {
  ownerLastLoginAt: Date | null;
  bookingsLast7Days: number;
  bookingsLast30Days: number;
  bookingsLast90Days: number;
  totalBookings: number;
  customersCount: number;
  servicesCount: number;
  employeesCount: number;
  branchesCount: number;
  lastBookingCreatedAt: Date | null;
}

export interface TenantOnboarding {
  emailVerified: boolean;
  firstServiceCreated: boolean;
  workingHoursSet: boolean;
  teamInvited: boolean;
  paymentsConnected: boolean;
  firstBookingReceived: boolean;
  completedAt: Date | null;
  startedAt: Date | null;
}

@Injectable()
export class PlatformTenantsService {
  constructor(@Inject(DbService) private readonly dbService: DbService) {}

  async list(filters: TenantListFilters): Promise<TenantListResult> {
    const limit = Math.min(filters.limit ?? 50, 200);
    const offset = filters.offset ?? 0;

    return this.dbService.withRlsContext(serviceContext(), async (tx) => {
      const conditions = [];
      if (filters.status) {
        if (filters.status === 'suspended') {
          conditions.push(isNotNull(schema.tenants.suspendedAt));
        } else if (filters.status === 'deleted') {
          conditions.push(isNotNull(schema.tenants.deletedAt));
        } else {
          conditions.push(eq(schema.tenants.status, filters.status));
          conditions.push(isNull(schema.tenants.deletedAt));
        }
      } else {
        conditions.push(isNull(schema.tenants.deletedAt));
      }
      if (filters.plan) conditions.push(eq(schema.tenants.plan, filters.plan));
      if (filters.businessType)
        conditions.push(eq(schema.tenants.businessType, filters.businessType));
      if (filters.search) {
        const pattern = `%${filters.search}%`;
        conditions.push(
          or(
            ilike(schema.tenants.name, pattern),
            ilike(schema.tenants.slug, pattern),
            ilike(schema.tenants.ownerEmail, pattern),
          )!,
        );
      }
      const where = conditions.length === 0 ? undefined : and(...conditions);

      const rows = await tx
        .select({
          id: schema.tenants.id,
          slug: schema.tenants.slug,
          name: schema.tenants.name,
          ownerEmail: schema.tenants.ownerEmail,
          businessType: schema.tenants.businessType,
          plan: schema.tenants.plan,
          status: schema.tenants.status,
          suspendedAt: schema.tenants.suspendedAt,
          trialEndsAt: schema.tenants.trialEndsAt,
          createdAt: schema.tenants.createdAt,
          deletedAt: schema.tenants.deletedAt,
          lastActivityAt: sql<Date | null>`(
            SELECT MAX(last_login_at) FROM users WHERE users.tenant_id = ${schema.tenants.id} AND users.role = 'owner'
          )`,
        })
        .from(schema.tenants)
        .where(where)
        .orderBy(desc(schema.tenants.createdAt))
        .limit(limit)
        .offset(offset);

      const totalRows = await tx.select({ value: count() }).from(schema.tenants).where(where);

      return { data: rows, total: Number(totalRows[0]?.value ?? 0) };
    });
  }

  async detail(tenantId: string): Promise<TenantDetail> {
    return this.dbService.withRlsContext(serviceContext(), async (tx) => {
      const [row] = await tx
        .select({
          id: schema.tenants.id,
          slug: schema.tenants.slug,
          name: schema.tenants.name,
          customDomain: schema.tenants.customDomain,
          locale: schema.tenants.locale,
          timezone: schema.tenants.timezone,
          currency: schema.tenants.currency,
          plan: schema.tenants.plan,
          status: schema.tenants.status,
          ownerEmail: schema.tenants.ownerEmail,
          businessType: schema.tenants.businessType,
          suspendedAt: schema.tenants.suspendedAt,
          suspensionReason: schema.tenants.suspensionReason,
          trialEndsAt: schema.tenants.trialEndsAt,
          createdAt: schema.tenants.createdAt,
          updatedAt: schema.tenants.updatedAt,
          deletedAt: schema.tenants.deletedAt,
          stripeCustomerId: schema.tenants.stripeCustomerId,
          stripeSubscriptionId: schema.tenants.stripeSubscriptionId,
          stripeSubscriptionStatus: schema.tenants.stripeSubscriptionStatus,
          currentPeriodEnd: schema.tenants.currentPeriodEnd,
          cancelAtPeriodEnd: schema.tenants.cancelAtPeriodEnd,
          billingEmail: schema.tenants.billingEmail,
          lastActivityAt: sql<Date | null>`(
            SELECT MAX(last_login_at) FROM users WHERE users.tenant_id = ${schema.tenants.id} AND users.role = 'owner'
          )`,
        })
        .from(schema.tenants)
        .where(eq(schema.tenants.id, tenantId))
        .limit(1);

      if (!row) {
        throw new NotFoundException({
          error: { code: 'TENANT_NOT_FOUND', message: 'Tenant neexistuje.' },
        });
      }
      return { ...row, cancelAtPeriodEnd: row.cancelAtPeriodEnd === 'true' };
    });
  }

  async activity(tenantId: string): Promise<TenantActivity> {
    return this.dbService.withRlsContext(serviceContext(), async (tx) => {
      const now = new Date();
      const days7 = new Date(now.getTime() - 7 * 86400_000).toISOString();
      const days30 = new Date(now.getTime() - 30 * 86400_000).toISOString();
      const days90 = new Date(now.getTime() - 90 * 86400_000).toISOString();

      const [ownerRow] = await tx
        .select({ lastLoginAt: sql<Date | null>`MAX(last_login_at)` })
        .from(schema.users)
        .where(and(eq(schema.users.tenantId, tenantId), eq(schema.users.role, 'owner')));

      const [bookingTotals] = await tx
        .select({
          total: sql<number>`COUNT(*)::int`,
          last7: sql<number>`COUNT(*) FILTER (WHERE created_at >= ${days7}::timestamptz)::int`,
          last30: sql<number>`COUNT(*) FILTER (WHERE created_at >= ${days30}::timestamptz)::int`,
          last90: sql<number>`COUNT(*) FILTER (WHERE created_at >= ${days90}::timestamptz)::int`,
          lastCreatedAt: sql<Date | null>`MAX(created_at)`,
        })
        .from(schema.bookings)
        .where(eq(schema.bookings.tenantId, tenantId));

      const [customersTotal] = await tx
        .select({ value: count() })
        .from(schema.customers)
        .where(eq(schema.customers.tenantId, tenantId));

      const [servicesTotal] = await tx
        .select({ value: count() })
        .from(schema.services)
        .where(eq(schema.services.tenantId, tenantId));

      const [employeesTotal] = await tx
        .select({ value: count() })
        .from(schema.employees)
        .where(eq(schema.employees.tenantId, tenantId));

      const [branchesTotal] = await tx
        .select({ value: count() })
        .from(schema.branches)
        .where(eq(schema.branches.tenantId, tenantId));

      return {
        ownerLastLoginAt: ownerRow?.lastLoginAt ?? null,
        bookingsLast7Days: Number(bookingTotals?.last7 ?? 0),
        bookingsLast30Days: Number(bookingTotals?.last30 ?? 0),
        bookingsLast90Days: Number(bookingTotals?.last90 ?? 0),
        totalBookings: Number(bookingTotals?.total ?? 0),
        customersCount: Number(customersTotal?.value ?? 0),
        servicesCount: Number(servicesTotal?.value ?? 0),
        employeesCount: Number(employeesTotal?.value ?? 0),
        branchesCount: Number(branchesTotal?.value ?? 0),
        lastBookingCreatedAt: bookingTotals?.lastCreatedAt ?? null,
      };
    });
  }

  async onboarding(tenantId: string): Promise<TenantOnboarding> {
    return this.dbService.withRlsContext(serviceContext(), async (tx) => {
      const [row] = await tx
        .select()
        .from(schema.onboardingChecklist)
        .where(eq(schema.onboardingChecklist.tenantId, tenantId))
        .limit(1);

      if (!row) {
        return {
          emailVerified: false,
          firstServiceCreated: false,
          workingHoursSet: false,
          teamInvited: false,
          paymentsConnected: false,
          firstBookingReceived: false,
          completedAt: null,
          startedAt: null,
        };
      }
      return {
        emailVerified: row.emailVerified,
        firstServiceCreated: row.firstServiceCreated,
        workingHoursSet: row.workingHoursSet,
        teamInvited: row.teamInvited,
        paymentsConnected: row.paymentsConnected,
        firstBookingReceived: row.firstBookingReceived,
        completedAt: row.completedAt,
        startedAt: row.createdAt,
      };
    });
  }
}
