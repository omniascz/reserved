import { pgTable, uuid, integer, varchar, timestamp, index } from 'drizzle-orm/pg-core';
import { tenants } from './tenants.js';
import { employees } from './employees.js';
import { services } from './services.js';

// Doplněk (sprint 10.15) — provize zaměstnanců (payroll).
// Pravidlo = kolik % z ceny dokončené rezervace náleží zaměstnanci.
// service_id NULL = výchozí provize zaměstnance pro všechny služby;
// vyplněné service_id = override pro konkrétní službu (má přednost).
// Výplatní report sečte provize z completed rezervací za období.

export const commissionRules = pgTable(
  'commission_rules',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    tenantId: uuid('tenant_id')
      .notNull()
      .references(() => tenants.id, { onDelete: 'cascade' }),
    employeeId: uuid('employee_id')
      .notNull()
      .references(() => employees.id, { onDelete: 'cascade' }),
    /** NULL = výchozí pro všechny služby; jinak override konkrétní služby. */
    serviceId: uuid('service_id').references(() => services.id, { onDelete: 'cascade' }),
    /** Provize v procentech (0–100). */
    commissionPercent: integer('commission_percent').notNull(),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => ({
    tenantIdx: index('commission_rules_tenant_idx').on(table.tenantId),
    employeeIdx: index('commission_rules_employee_idx').on(table.employeeId),
  }),
);

export type CommissionRule = typeof commissionRules.$inferSelect;
export type NewCommissionRule = typeof commissionRules.$inferInsert;

// Výplata (sprint 10.34) — persistovaný payslip za období. Vzniká z payoutReportu
// (snapshot provizí), dá se označit jako proplacený. Status pending → paid.
export const payouts = pgTable(
  'payouts',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    tenantId: uuid('tenant_id')
      .notNull()
      .references(() => tenants.id, { onDelete: 'cascade' }),
    employeeId: uuid('employee_id')
      .notNull()
      .references(() => employees.id, { onDelete: 'cascade' }),
    /** Snapshot jména (kdyby zaměstnanec později zmizel). */
    employeeName: varchar('employee_name', { length: 200 }).notNull(),
    periodFrom: timestamp('period_from', { withTimezone: true }).notNull(),
    periodTo: timestamp('period_to', { withTimezone: true }).notNull(),
    bookingsCount: integer('bookings_count').notNull().default(0),
    grossHellers: integer('gross_hellers').notNull().default(0),
    commissionHellers: integer('commission_hellers').notNull().default(0),
    status: varchar('status', { length: 16 }).notNull().default('pending'),
    paidAt: timestamp('paid_at', { withTimezone: true }),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => ({
    tenantIdx: index('payouts_tenant_idx').on(table.tenantId),
    employeeIdx: index('payouts_employee_idx').on(table.employeeId),
  }),
);

export type Payout = typeof payouts.$inferSelect;
