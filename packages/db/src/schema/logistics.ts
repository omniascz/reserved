import { pgTable, uuid, varchar, integer, text, timestamp, index } from 'drizzle-orm/pg-core';
import { tenants } from './tenants.js';
import { branches } from './branches.js';
import { resources } from './resources.js';
import { employees } from './employees.js';

// Motor 4 — dispečink zakázek (sprint 10.24): malá logistika (kurýr, stěhováci).
// Zakázka = vyzvednutí → doručení, přiřazená vozu (resource) + řidiči (employee)
// v časovém okně. Bez routingu/optimalizace (to je externí). Ochrana: vůz ani
// řidič nesmí mít dvě překrývající se zakázky (dva DB EXCLUDE).

export const jobStatuses = ['scheduled', 'in_progress', 'done', 'cancelled'] as const;
export type JobStatus = (typeof jobStatuses)[number];

export const logisticsJobs = pgTable(
  'logistics_jobs',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    tenantId: uuid('tenant_id')
      .notNull()
      .references(() => tenants.id, { onDelete: 'cascade' }),
    branchId: uuid('branch_id').references(() => branches.id, { onDelete: 'set null' }),
    /** Vozidlo (resource type 'vehicle'). */
    vehicleId: uuid('vehicle_id')
      .notNull()
      .references(() => resources.id, { onDelete: 'restrict' }),
    /** Řidič (employee). */
    driverId: uuid('driver_id')
      .notNull()
      .references(() => employees.id, { onDelete: 'restrict' }),
    customerName: varchar('customer_name', { length: 200 }),
    customerPhone: varchar('customer_phone', { length: 32 }),
    pickupAddress: text('pickup_address').notNull(),
    dropoffAddress: text('dropoff_address').notNull(),
    /** Naplánované časové okno zakázky. */
    startsAt: timestamp('starts_at', { withTimezone: true }).notNull(),
    endsAt: timestamp('ends_at', { withTimezone: true }).notNull(),
    /** Hmotnost zásilky v gramech (volitelné). */
    weightGrams: integer('weight_grams'),
    priceHellers: integer('price_hellers').notNull().default(0),
    status: varchar('status', { length: 16 }).notNull().default('scheduled'),
    note: text('note'),
    createdBy: uuid('created_by'),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => ({
    tenantIdx: index('logistics_jobs_tenant_idx').on(table.tenantId, table.startsAt),
    vehicleIdx: index('logistics_jobs_vehicle_idx').on(table.vehicleId),
    driverIdx: index('logistics_jobs_driver_idx').on(table.driverId),
  }),
);

export type LogisticsJob = typeof logisticsJobs.$inferSelect;
