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
