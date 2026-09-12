import { pgTable, uuid, varchar, integer, text, date, timestamp, index } from 'drizzle-orm/pg-core';
import { tenants } from './tenants.js';
import { branches } from './branches.js';
import { resources } from './resources.js';
import { users } from './users.js';

// Motor 2 — pobyt na dny (sprint 10.22): rezervace jednotky (pokoj/auto) na
// rozsah nocí/dní, NE na denní sloty. Pro malé hotely a půjčovny.
// Jednotka = resource. Ochrana proti dvojí rezervaci přes daterange EXCLUDE.

export const stayStatuses = ['confirmed', 'checked_in', 'checked_out', 'cancelled'] as const;
export type StayStatus = (typeof stayStatuses)[number];

export const stays = pgTable(
  'stays',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    tenantId: uuid('tenant_id')
      .notNull()
      .references(() => tenants.id, { onDelete: 'cascade' }),
    branchId: uuid('branch_id').references(() => branches.id, { onDelete: 'set null' }),
    /** Jednotka — pokoj / auto / apartmán (resource). */
    resourceId: uuid('resource_id')
      .notNull()
      .references(() => resources.id, { onDelete: 'restrict' }),
    customerId: uuid('customer_id'),
    customerName: varchar('customer_name', { length: 200 }).notNull(),
    customerEmail: varchar('customer_email', { length: 255 }),
    customerPhone: varchar('customer_phone', { length: 32 }),
    /** Datum příjezdu (noc od). */
    checkIn: date('check_in').notNull(),
    /** Datum odjezdu (den volný pro dalšího — půlotevřený interval). */
    checkOut: date('check_out').notNull(),
    nights: integer('nights').notNull(),
    guests: integer('guests').notNull().default(1),
    pricePerNightHellers: integer('price_per_night_hellers').notNull().default(0),
    totalHellers: integer('total_hellers').notNull().default(0),
    currency: varchar('currency', { length: 3 }).notNull().default('CZK'),
    status: varchar('status', { length: 16 }).notNull().default('confirmed'),
    note: text('note'),
    createdBy: uuid('created_by').references(() => users.id),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => ({
    tenantIdx: index('stays_tenant_idx').on(table.tenantId),
    resourceIdx: index('stays_resource_idx').on(table.resourceId),
    checkInIdx: index('stays_checkin_idx').on(table.tenantId, table.checkIn),
  }),
);

export type Stay = typeof stays.$inferSelect;
