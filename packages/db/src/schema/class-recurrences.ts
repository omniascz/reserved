import {
  pgTable,
  uuid,
  varchar,
  integer,
  jsonb,
  date,
  timestamp,
  index,
  foreignKey,
} from 'drizzle-orm/pg-core';
import { tenants } from './tenants.js';
import { services } from './services.js';
import { employees } from './employees.js';
import { branches } from './branches.js';
import { resources } from './resources.js';

// Opakovaný rozvrh skupinových lekcí (sprint 10.25). Pravidlo „každé Po/St/Pá
// 18:00 na 3 měsíce" → vygeneruje class_sessions (každá nese recurrence_id).
// Kolizní výskyty (trenér/přístroj/pobočka) se přeskočí.

export const classRecurrences = pgTable(
  'class_recurrences',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    tenantId: uuid('tenant_id')
      .notNull()
      .references(() => tenants.id, { onDelete: 'cascade' }),
    serviceId: uuid('service_id')
      .notNull()
      .references(() => services.id, { onDelete: 'restrict' }),
    employeeId: uuid('employee_id').references(() => employees.id, { onDelete: 'set null' }),
    /** EMS přístroj / zdroj (volitelné). */
    resourceId: uuid('resource_id'),
    branchId: uuid('branch_id'),
    capacity: integer('capacity'),
    /** Dny v týdnu (ISO 1=Po..7=Ne), např. [1,3,5]. */
    daysOfWeek: jsonb('days_of_week').notNull().default([]),
    /** Čas začátku 'HH:MM' (UTC). */
    time: varchar('time', { length: 5 }).notNull(),
    startDate: date('start_date').notNull(),
    endDate: date('end_date').notNull(),
    status: varchar('status', { length: 16 }).notNull().default('active'),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => ({
    tenantIdx: index('class_recurrences_tenant_idx').on(table.tenantId),
    /** FK se jmény dle DB (migrace 0068). */
    resourceFk: foreignKey({
      columns: [table.resourceId],
      foreignColumns: [resources.id],
      name: 'class_recurrences_resource_id_fkey',
    }).onDelete('set null'),
    branchFk: foreignKey({
      columns: [table.branchId],
      foreignColumns: [branches.id],
      name: 'class_recurrences_branch_id_fkey',
    }).onDelete('set null'),
  }),
);

export type ClassRecurrence = typeof classRecurrences.$inferSelect;
