import { pgTable, uuid, varchar, timestamp, index } from 'drizzle-orm/pg-core';
import { tenants } from './tenants.js';
import { bookings } from './bookings.js';
import { resources } from './resources.js';

// Motor 1 — fáze 1a (sprint 10.21): více zdrojů na jednu rezervaci.
// Jedna rezervace (událost) může zamknout N zdrojů (místnost + technika + ...).
// Čas je denormalizovaný (kopie z bookings) kvůli DB EXCLUDE per zdroj —
// databáze sama nepustí dvě aktivní navázání téhož zdroje v překrývajícím se čase.

export const bookingResourceStatuses = ['active', 'cancelled'] as const;

export const bookingResources = pgTable(
  'booking_resources',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    tenantId: uuid('tenant_id')
      .notNull()
      .references(() => tenants.id, { onDelete: 'cascade' }),
    bookingId: uuid('booking_id')
      .notNull()
      .references(() => bookings.id, { onDelete: 'cascade' }),
    resourceId: uuid('resource_id')
      .notNull()
      .references(() => resources.id, { onDelete: 'restrict' }),
    /** Volitelná role zdroje v rezervaci: 'room' | 'equipment' | 'court' | 'staff_extra' … */
    role: varchar('role', { length: 32 }),
    /** Kopie časového rozsahu rezervace (vč. bufferů) — pro EXCLUDE překryvu. */
    bufferStartsAt: timestamp('buffer_starts_at', { withTimezone: true }).notNull(),
    bufferEndsAt: timestamp('buffer_ends_at', { withTimezone: true }).notNull(),
    status: varchar('status', { length: 16 }).notNull().default('active'),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => ({
    tenantIdx: index('booking_resources_tenant_idx').on(table.tenantId),
    bookingIdx: index('booking_resources_booking_idx').on(table.bookingId),
    resourceIdx: index('booking_resources_resource_idx').on(table.resourceId),
  }),
);

export type BookingResource = typeof bookingResources.$inferSelect;
