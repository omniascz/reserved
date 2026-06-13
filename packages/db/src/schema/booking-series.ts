import { pgTable, uuid, varchar, integer, timestamp, jsonb, index } from 'drizzle-orm/pg-core';
import { tenants } from './tenants.js';
import { services } from './services.js';
import { employees } from './employees.js';

// Sprint 10.14 — série opakovaných 1:1 rezervací (pravidelné termíny).
// Např. týdenní osobní trénink, terapie každých 14 dní, kontrola měsíčně.
// Série = šablona; jednotlivé výskyty jsou normální bookings se series_id.
// Kolizní výskyty se při generování přeskočí (skipped) a nahlásí.

export const seriesFrequencies = ['weekly', 'biweekly', 'monthly'] as const;
export type SeriesFrequency = (typeof seriesFrequencies)[number];

export const bookingSeries = pgTable(
  'booking_series',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    tenantId: uuid('tenant_id')
      .notNull()
      .references(() => tenants.id, { onDelete: 'cascade' }),
    serviceId: uuid('service_id')
      .notNull()
      .references(() => services.id, { onDelete: 'restrict' }),
    employeeId: uuid('employee_id').references(() => employees.id, { onDelete: 'set null' }),
    customerName: varchar('customer_name', { length: 200 }).notNull(),
    customerEmail: varchar('customer_email', { length: 255 }).notNull(),
    customerPhone: varchar('customer_phone', { length: 32 }),
    /** weekly | biweekly | monthly. */
    frequency: varchar('frequency', { length: 16 }).notNull(),
    /** Čas prvního výskytu (UTC). */
    startsAt: timestamp('starts_at', { withTimezone: true }).notNull(),
    /** Kolik výskytů jsme se pokusili vygenerovat. */
    occurrenceCount: integer('occurrence_count').notNull(),
    /** active | cancelled. */
    status: varchar('status', { length: 16 }).notNull().default('active'),
    metadata: jsonb('metadata').notNull().default({}),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => ({
    tenantIdx: index('booking_series_tenant_idx').on(table.tenantId),
    employeeIdx: index('booking_series_employee_idx').on(table.employeeId),
  }),
);

export type BookingSeries = typeof bookingSeries.$inferSelect;
export type NewBookingSeries = typeof bookingSeries.$inferInsert;
