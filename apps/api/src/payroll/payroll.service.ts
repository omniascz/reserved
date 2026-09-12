// PayrollService — provize zaměstnanců a výplatní report (doplněk 10.15).
//
// Pravidlo provize = % z ceny dokončené (completed) rezervace. Override per
// služba má přednost před výchozí provizí zaměstnance. Report sečte provize
// za období z completed rezervací — podklad pro výplatu.

import { ForbiddenException, Inject, Injectable, NotFoundException } from '@nestjs/common';
import { and, eq, gte, isNull, lte, sql } from 'drizzle-orm';
import { schema } from '@reserved/db';
import { type AppRole, type TenantContext } from '@reserved/rls-multitenancy';
import { DbService } from '../db/db.service.js';
import type { SetCommissionDto } from './dto/payroll.dto.js';

const MANAGE_ROLES: AppRole[] = ['owner', 'manager'];

function ctxFor(tenantId: string, userId: string, role: AppRole): TenantContext {
  return { tenantId, userId, role };
}
function assertCanManage(role: AppRole): void {
  if (!MANAGE_ROLES.includes(role)) {
    throw new ForbiddenException({
      error: { code: 'INSUFFICIENT_ROLE', message: 'Pouze owner nebo manager spravuje provize.' },
    });
  }
}

@Injectable()
export class PayrollService {
  constructor(@Inject(DbService) private readonly dbService: DbService) {}

  /** Nastaví (upsertne) provizní pravidlo. */
  async setCommission(
    tenantId: string,
    userId: string,
    role: AppRole,
    employeeId: string,
    dto: SetCommissionDto,
  ) {
    assertCanManage(role);
    return this.dbService.withRlsContext(ctxFor(tenantId, userId, role), async (tx) => {
      const [emp] = await tx
        .select({ id: schema.employees.id })
        .from(schema.employees)
        .where(and(eq(schema.employees.id, employeeId), eq(schema.employees.tenantId, tenantId)))
        .limit(1);
      if (!emp) {
        throw new NotFoundException({
          error: { code: 'EMPLOYEE_NOT_FOUND', message: 'Zaměstnanec nenalezen.' },
        });
      }
      const serviceId = dto.serviceId ?? null;

      const [existing] = await tx
        .select({ id: schema.commissionRules.id })
        .from(schema.commissionRules)
        .where(
          and(
            eq(schema.commissionRules.tenantId, tenantId),
            eq(schema.commissionRules.employeeId, employeeId),
            serviceId === null
              ? isNull(schema.commissionRules.serviceId)
              : eq(schema.commissionRules.serviceId, serviceId),
          ),
        )
        .limit(1);

      if (existing) {
        const [updated] = await tx
          .update(schema.commissionRules)
          .set({ commissionPercent: dto.commissionPercent, updatedAt: new Date() })
          .where(eq(schema.commissionRules.id, existing.id))
          .returning();
        return updated!;
      }
      const [created] = await tx
        .insert(schema.commissionRules)
        .values({
          tenantId,
          employeeId,
          serviceId,
          commissionPercent: dto.commissionPercent,
        })
        .returning();
      return created!;
    });
  }

  async listCommissions(tenantId: string, userId: string, role: AppRole, employeeId: string) {
    assertCanManage(role);
    return this.dbService.withRlsContext(ctxFor(tenantId, userId, role), async (tx) => {
      return tx
        .select()
        .from(schema.commissionRules)
        .where(
          and(
            eq(schema.commissionRules.tenantId, tenantId),
            eq(schema.commissionRules.employeeId, employeeId),
          ),
        );
    });
  }

  async deleteCommission(tenantId: string, userId: string, role: AppRole, ruleId: string) {
    assertCanManage(role);
    return this.dbService.withRlsContext(ctxFor(tenantId, userId, role), async (tx) => {
      const deleted = await tx
        .delete(schema.commissionRules)
        .where(
          and(eq(schema.commissionRules.id, ruleId), eq(schema.commissionRules.tenantId, tenantId)),
        )
        .returning({ id: schema.commissionRules.id });
      if (deleted.length === 0) {
        throw new NotFoundException({
          error: { code: 'RULE_NOT_FOUND', message: 'Provizní pravidlo nenalezeno.' },
        });
      }
      return { deleted: true };
    });
  }

  /** Výplatní report za období z completed rezervací. */
  async payoutReport(
    tenantId: string,
    userId: string,
    role: AppRole,
    opts: { from: Date; to: Date; employeeId?: string },
  ) {
    assertCanManage(role);
    return this.dbService.withRlsContext(ctxFor(tenantId, userId, role), async (tx) => {
      // 1. Pravidla provizí → mapa per zaměstnanec.
      const rules = await tx
        .select()
        .from(schema.commissionRules)
        .where(eq(schema.commissionRules.tenantId, tenantId));
      const byEmployee = new Map<
        string,
        { defaultPct: number | null; byService: Map<string, number> }
      >();
      for (const r of rules) {
        if (!byEmployee.has(r.employeeId)) {
          byEmployee.set(r.employeeId, { defaultPct: null, byService: new Map() });
        }
        const entry = byEmployee.get(r.employeeId)!;
        if (r.serviceId === null) entry.defaultPct = r.commissionPercent;
        else entry.byService.set(r.serviceId, r.commissionPercent);
      }

      // 2. Completed rezervace v období.
      const conds = [
        eq(schema.bookings.tenantId, tenantId),
        eq(schema.bookings.status, 'completed'),
        gte(schema.bookings.startsAt, opts.from),
        lte(schema.bookings.startsAt, opts.to),
        sql`${schema.bookings.employeeId} IS NOT NULL`,
      ];
      if (opts.employeeId) conds.push(eq(schema.bookings.employeeId, opts.employeeId));
      const completed = await tx
        .select({
          employeeId: schema.bookings.employeeId,
          serviceId: schema.bookings.serviceId,
          pricePaidHellers: schema.bookings.pricePaidHellers,
        })
        .from(schema.bookings)
        .where(and(...conds));

      // 3. Agregace per zaměstnanec.
      const agg = new Map<
        string,
        { bookingsCount: number; grossHellers: number; commissionHellers: number }
      >();
      for (const b of completed) {
        const empId = b.employeeId!;
        const rule = byEmployee.get(empId);
        const pct = rule ? (rule.byService.get(b.serviceId) ?? rule.defaultPct ?? 0) : 0;
        const commission = Math.round((b.pricePaidHellers * pct) / 100);
        if (!agg.has(empId)) {
          agg.set(empId, { bookingsCount: 0, grossHellers: 0, commissionHellers: 0 });
        }
        const a = agg.get(empId)!;
        a.bookingsCount += 1;
        a.grossHellers += b.pricePaidHellers;
        a.commissionHellers += commission;
      }

      // 4. Jména zaměstnanců.
      const empRows = await tx
        .select({
          id: schema.employees.id,
          firstName: schema.employees.firstName,
          lastName: schema.employees.lastName,
          displayName: schema.employees.displayName,
        })
        .from(schema.employees)
        .where(eq(schema.employees.tenantId, tenantId));
      const nameOf = new Map(
        empRows.map((e) => [e.id, e.displayName ?? `${e.firstName} ${e.lastName}`.trim()]),
      );

      const lines = [...agg.entries()]
        .map(([employeeId, a]) => ({
          employeeId,
          employeeName: nameOf.get(employeeId) ?? 'Zaměstnanec',
          bookingsCount: a.bookingsCount,
          grossHellers: a.grossHellers,
          commissionHellers: a.commissionHellers,
        }))
        .sort((x, y) => y.commissionHellers - x.commissionHellers);

      return {
        from: opts.from.toISOString(),
        to: opts.to.toISOString(),
        lines,
        totals: {
          bookingsCount: lines.reduce((s, l) => s + l.bookingsCount, 0),
          grossHellers: lines.reduce((s, l) => s + l.grossHellers, 0),
          commissionHellers: lines.reduce((s, l) => s + l.commissionHellers, 0),
        },
      };
    });
  }

  /**
   * Vygeneruje VÝPLATY (payouts) za období — persistovaný payslip per zaměstnanec
   * ze snapshotu provizí. Na rozdíl od reportu je to trvalý záznam, který lze
   * označit jako proplacený. Zaměstnanci s nulovou provizí se přeskočí.
   */
  async generatePayout(
    tenantId: string,
    userId: string,
    role: AppRole,
    opts: { from: Date; to: Date; employeeId?: string },
  ) {
    assertCanManage(role);
    const report = await this.payoutReport(tenantId, userId, role, opts);
    return this.dbService.withRlsContext(ctxFor(tenantId, userId, role), async (tx) => {
      const created = [];
      for (const line of report.lines) {
        if (line.commissionHellers <= 0) continue;
        const [row] = await tx
          .insert(schema.payouts)
          .values({
            tenantId,
            employeeId: line.employeeId,
            employeeName: line.employeeName,
            periodFrom: opts.from,
            periodTo: opts.to,
            bookingsCount: line.bookingsCount,
            grossHellers: line.grossHellers,
            commissionHellers: line.commissionHellers,
          })
          .returning();
        created.push(row!);
      }
      return {
        from: opts.from.toISOString(),
        to: opts.to.toISOString(),
        generated: created.length,
        payouts: created,
      };
    });
  }

  async listPayouts(
    tenantId: string,
    userId: string,
    role: AppRole,
    filters: { status?: string; employeeId?: string },
  ) {
    assertCanManage(role);
    return this.dbService.withRlsContext(ctxFor(tenantId, userId, role), async (tx) => {
      const conds = [eq(schema.payouts.tenantId, tenantId)];
      if (filters.status) conds.push(eq(schema.payouts.status, filters.status));
      if (filters.employeeId) conds.push(eq(schema.payouts.employeeId, filters.employeeId));
      return tx
        .select()
        .from(schema.payouts)
        .where(and(...conds))
        .orderBy(sql`${schema.payouts.createdAt} DESC`)
        .limit(500);
    });
  }

  /** Označí výplatu jako proplacenou. */
  async markPayoutPaid(tenantId: string, userId: string, role: AppRole, payoutId: string) {
    assertCanManage(role);
    return this.dbService.withRlsContext(ctxFor(tenantId, userId, role), async (tx) => {
      const [row] = await tx
        .update(schema.payouts)
        .set({ status: 'paid', paidAt: new Date(), updatedAt: new Date() })
        .where(and(eq(schema.payouts.id, payoutId), eq(schema.payouts.tenantId, tenantId)))
        .returning();
      if (!row) {
        throw new NotFoundException({
          error: { code: 'PAYOUT_NOT_FOUND', message: 'Výplata nenalezena.' },
        });
      }
      return row;
    });
  }
}
