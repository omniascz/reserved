// PlatformDashboardService — agregacni endpointy pro master admin dashboard.

import { Inject, Injectable } from '@nestjs/common';
import { and, eq, isNull, isNotNull, sql, lt, gt } from 'drizzle-orm';
import { schema } from '@reserved/db';
import { serviceContext } from '@reserved/rls-multitenancy';
import { DbService } from '../db/db.service.js';

export interface DashboardOverview {
  totalTenants: number;
  trialTenants: number;
  activeTenants: number;
  suspendedTenants: number;
  deletedTenants: number;
  newRegistrations7d: number;
  newRegistrations30d: number;
  totalBookings30d: number;
  totalCustomers: number;
  trialEndingSoon: number; // trial konci do 3 dni
}

export interface RegistrationsPerDay {
  day: string;
  count: number;
}

export interface PlatformAdoption {
  tenantsWithPaymentsConnected: number;
  activeCustomerSubscriptions: number;
  /** SaaS MRR Reserved = co platí tenanti za své plány (skutečná tržba platformy). */
  platformSaasMrrHellers: number;
  platformSaasArrHellers: number;
  /** GMV: MRR z předplatných KONCOVÝCH zákazníků napříč tenanty (ne tržba Reserved). */
  customerGmvMrrHellers: number;
  modules: {
    posSales: number;
    stays: number;
    courses: number;
    logisticsJobs: number;
  };
}

export interface AtRiskTenant {
  id: string;
  slug: string;
  name: string;
  ownerEmail: string | null;
  reason: 'trial_ending_soon' | 'onboarding_stalled' | 'no_activity';
  details: Record<string, unknown>;
}

@Injectable()
export class PlatformDashboardService {
  constructor(@Inject(DbService) private readonly dbService: DbService) {}

  async overview(): Promise<DashboardOverview> {
    return this.dbService.withRlsContext(serviceContext(), async (tx) => {
      const now = new Date();
      const days7 = new Date(now.getTime() - 7 * 86400_000).toISOString();
      const days30 = new Date(now.getTime() - 30 * 86400_000).toISOString();
      const days3Ahead = new Date(now.getTime() + 3 * 86400_000).toISOString();

      const [tenantStats] = await tx
        .select({
          total: sql<number>`COUNT(*) FILTER (WHERE deleted_at IS NULL)::int`,
          trial: sql<number>`COUNT(*) FILTER (WHERE status = 'trial' AND suspended_at IS NULL AND deleted_at IS NULL)::int`,
          active: sql<number>`COUNT(*) FILTER (WHERE status = 'active' AND suspended_at IS NULL AND deleted_at IS NULL)::int`,
          suspended: sql<number>`COUNT(*) FILTER (WHERE suspended_at IS NOT NULL AND deleted_at IS NULL)::int`,
          deleted: sql<number>`COUNT(*) FILTER (WHERE deleted_at IS NOT NULL)::int`,
          new7d: sql<number>`COUNT(*) FILTER (WHERE created_at >= ${days7}::timestamptz AND deleted_at IS NULL)::int`,
          new30d: sql<number>`COUNT(*) FILTER (WHERE created_at >= ${days30}::timestamptz AND deleted_at IS NULL)::int`,
          trialEndingSoon: sql<number>`COUNT(*) FILTER (WHERE trial_ends_at IS NOT NULL AND trial_ends_at BETWEEN now() AND ${days3Ahead}::timestamptz AND suspended_at IS NULL AND deleted_at IS NULL)::int`,
        })
        .from(schema.tenants);

      const [bookings] = await tx
        .select({
          total: sql<number>`COUNT(*) FILTER (WHERE created_at >= ${days30}::timestamptz)::int`,
        })
        .from(schema.bookings);

      const [customers] = await tx
        .select({ total: sql<number>`COUNT(*)::int` })
        .from(schema.customers);

      return {
        totalTenants: Number(tenantStats?.total ?? 0),
        trialTenants: Number(tenantStats?.trial ?? 0),
        activeTenants: Number(tenantStats?.active ?? 0),
        suspendedTenants: Number(tenantStats?.suspended ?? 0),
        deletedTenants: Number(tenantStats?.deleted ?? 0),
        newRegistrations7d: Number(tenantStats?.new7d ?? 0),
        newRegistrations30d: Number(tenantStats?.new30d ?? 0),
        totalBookings30d: Number(bookings?.total ?? 0),
        totalCustomers: Number(customers?.total ?? 0),
        trialEndingSoon: Number(tenantStats?.trialEndingSoon ?? 0),
      };
    });
  }

  async registrationsPerDay(from?: string, to?: string): Promise<RegistrationsPerDay[]> {
    return this.dbService.withRlsContext(serviceContext(), async (tx) => {
      const fromIso = from ?? new Date(Date.now() - 30 * 86400_000).toISOString();
      const toIso = to ?? new Date().toISOString();

      const rows = await tx
        .select({
          day: sql<string>`to_char(date_trunc('day', created_at), 'YYYY-MM-DD')`,
          count: sql<number>`COUNT(*)::int`,
        })
        .from(schema.tenants)
        .where(
          sql`created_at >= ${fromIso}::timestamptz AND created_at < ${toIso}::timestamptz AND deleted_at IS NULL`,
        )
        .groupBy(sql`date_trunc('day', created_at)`)
        .orderBy(sql`date_trunc('day', created_at)`);

      return rows.map((r) => ({ day: r.day, count: Number(r.count) }));
    });
  }

  async atRiskTenants(): Promise<AtRiskTenant[]> {
    return this.dbService.withRlsContext(serviceContext(), async (tx) => {
      const now = new Date();
      const days3Ahead = new Date(now.getTime() + 3 * 86400_000).toISOString();
      const days7Ago = new Date(now.getTime() - 7 * 86400_000).toISOString();
      const days14Ago = new Date(now.getTime() - 14 * 86400_000).toISOString();

      // 1. Trial konci za < 3 dni
      const trialRows = await tx
        .select({
          id: schema.tenants.id,
          slug: schema.tenants.slug,
          name: schema.tenants.name,
          ownerEmail: schema.tenants.ownerEmail,
          trialEndsAt: schema.tenants.trialEndsAt,
        })
        .from(schema.tenants)
        .where(
          and(
            isNull(schema.tenants.deletedAt),
            isNull(schema.tenants.suspendedAt),
            isNotNull(schema.tenants.trialEndsAt),
            lt(schema.tenants.trialEndsAt, new Date(days3Ahead)),
            gt(schema.tenants.trialEndsAt, now),
          ),
        );

      // 2. Onboarding nedokoncen 7+ dni po reg
      const stalledRows = await tx
        .select({
          id: schema.tenants.id,
          slug: schema.tenants.slug,
          name: schema.tenants.name,
          ownerEmail: schema.tenants.ownerEmail,
          createdAt: schema.tenants.createdAt,
          completedAt: schema.onboardingChecklist.completedAt,
        })
        .from(schema.tenants)
        .leftJoin(
          schema.onboardingChecklist,
          eq(schema.tenants.id, schema.onboardingChecklist.tenantId),
        )
        .where(
          and(
            isNull(schema.tenants.deletedAt),
            isNull(schema.tenants.suspendedAt),
            lt(schema.tenants.createdAt, new Date(days7Ago)),
            isNull(schema.onboardingChecklist.completedAt),
          ),
        );

      // 3. Zadne booking 14+ dni
      const noActivityRows = await tx.execute(sql`
        SELECT t.id, t.slug, t.name, t.owner_email AS "ownerEmail",
               (SELECT MAX(created_at) FROM bookings WHERE bookings.tenant_id = t.id) AS "lastBookingAt"
        FROM tenants t
        WHERE t.deleted_at IS NULL
          AND t.suspended_at IS NULL
          AND t.created_at < ${days14Ago}::timestamptz
          AND (
            (SELECT MAX(created_at) FROM bookings WHERE bookings.tenant_id = t.id) IS NULL
            OR (SELECT MAX(created_at) FROM bookings WHERE bookings.tenant_id = t.id) < ${days14Ago}::timestamptz
          )
        LIMIT 50
      `);

      const result: AtRiskTenant[] = [];

      for (const row of trialRows) {
        result.push({
          id: row.id,
          slug: row.slug,
          name: row.name,
          ownerEmail: row.ownerEmail,
          reason: 'trial_ending_soon',
          details: { trialEndsAt: row.trialEndsAt },
        });
      }
      for (const row of stalledRows) {
        result.push({
          id: row.id,
          slug: row.slug,
          name: row.name,
          ownerEmail: row.ownerEmail,
          reason: 'onboarding_stalled',
          details: { registeredAt: row.createdAt },
        });
      }
      for (const row of noActivityRows as unknown as Array<{
        id: string;
        slug: string;
        name: string;
        ownerEmail: string | null;
        lastBookingAt: Date | null;
      }>) {
        result.push({
          id: row.id,
          slug: row.slug,
          name: row.name,
          ownerEmail: row.ownerEmail,
          reason: 'no_activity',
          details: { lastBookingAt: row.lastBookingAt },
        });
      }

      return result;
    });
  }

  /** Adopce featur napříč platformou — napojené platby, MRR, moduly. */
  async adoption(): Promise<PlatformAdoption> {
    return this.dbService.withRlsContext(serviceContext(), async (tx) => {
      const [pay] = await tx
        .select({ value: sql<number>`COUNT(DISTINCT tenant_id)::int` })
        .from(schema.paymentConnections)
        .where(eq(schema.paymentConnections.status, 'active'));

      // GMV — předplatná KONCOVÝCH zákazníků napříč tenanty (ne tržba Reserved).
      const [gmv] = await tx
        .select({
          subs: sql<number>`COUNT(*)::int`,
          mrr: sql<number>`COALESCE(SUM(
            CASE snapshot_billing_interval
              WHEN 'yearly' THEN snapshot_price_hellers / 12
              WHEN 'quarterly' THEN snapshot_price_hellers / 3
              ELSE snapshot_price_hellers
            END
          ), 0)::int`,
        })
        .from(schema.customerSubscriptions)
        .where(sql`${schema.customerSubscriptions.status} IN ('active', 'trialing')`);

      // SaaS MRR Reserved — co reálně platí tenanti za své plány. Jen aktivní
      // (ne trial, ne suspended, ne smazaní) tenanti na placeném plánu.
      const [saas] = await tx
        .select({
          mrr: sql<number>`COALESCE(SUM(${schema.platformPlans.monthlyPriceHellers}), 0)::int`,
        })
        .from(schema.tenants)
        .innerJoin(schema.platformPlans, eq(schema.tenants.plan, schema.platformPlans.key))
        .where(
          sql`${schema.tenants.status} = 'active' AND ${schema.tenants.suspendedAt} IS NULL AND ${schema.tenants.deletedAt} IS NULL`,
        );

      const cnt = sql<number>`COUNT(DISTINCT tenant_id)::int`;
      const [posT] = await tx.select({ value: cnt }).from(schema.posSales);
      const [stayT] = await tx.select({ value: cnt }).from(schema.stays);
      const [courseT] = await tx.select({ value: cnt }).from(schema.courses);
      const [logiT] = await tx.select({ value: cnt }).from(schema.logisticsJobs);

      return {
        tenantsWithPaymentsConnected: Number(pay?.value ?? 0),
        activeCustomerSubscriptions: Number(gmv?.subs ?? 0),
        platformSaasMrrHellers: Number(saas?.mrr ?? 0),
        platformSaasArrHellers: Number(saas?.mrr ?? 0) * 12,
        customerGmvMrrHellers: Number(gmv?.mrr ?? 0),
        modules: {
          posSales: Number(posT?.value ?? 0),
          stays: Number(stayT?.value ?? 0),
          courses: Number(courseT?.value ?? 0),
          logisticsJobs: Number(logiT?.value ?? 0),
        },
      };
    });
  }
}
