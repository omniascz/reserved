import {
  pgTable,
  uuid,
  varchar,
  text,
  timestamp,
  boolean,
  integer,
  jsonb,
  index,
} from 'drizzle-orm/pg-core';
import { tenants } from './tenants.js';
import { customers } from './customers.js';
import { users } from './users.js';
import { bookings } from './bookings.js';
import { services } from './services.js';
import { corporateAccounts } from './corporate-accounts.js';

// Časové balíčky (sprint 3.3 fáze A2).
//
// Time pack = subscription bez auto-renewal. Zakaznik plati jednou,
// dostane (omezeny nebo neomezeny) pristup k vybranym sluzbam po dobu X dni.
// Priklad: "Neomezene skupinove fitness lekce po dobu 30 dni za 1200 Kc".
//
// Tri tabulky paralelne ke credit_packs a bundle_packs:
//   1. time_packs            — sablona
//   2. customer_time_packs   — instance (s counter pouziti)
//   3. time_pack_uses        — audit log per pouziti

// ─── Time pack template ────────────────────────────────────────────────

export const timePacks = pgTable(
  'time_packs',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    tenantId: uuid('tenant_id')
      .notNull()
      .references(() => tenants.id, { onDelete: 'cascade' }),
    name: varchar('name', { length: 200 }).notNull(),
    description: text('description'),
    /** Pocet dni od aktivace. Po uplynuti se status zmeni na 'expired'. */
    durationDays: integer('duration_days').notNull(),
    /** Maximalni pocet rezervaci po celou dobu platnosti. NULL = neomezeno. */
    maxBookingsPerPeriod: integer('max_bookings_per_period'),
    /** Maximalni pocet rezervaci za den. NULL = bez denniho limitu. */
    maxBookingsPerDay: integer('max_bookings_per_day'),
    /** UUID[] sluzeb, pro ktere lze pouzit. Prazdny array = vsechny sluzby. */
    allowedServiceIds: jsonb('allowed_service_ids').notNull().default([]).$type<string[]>(),
    /** UUID[] pobocek; prazdne = vsechny. */
    allowedBranchIds: jsonb('allowed_branch_ids').notNull().default([]).$type<string[]>(),
    /** Prodejni cena (haléřů). */
    priceHellers: integer('price_hellers').notNull().default(0),
    currency: varchar('currency', { length: 3 }).notNull().default('CZK'),
    isActive: boolean('is_active').notNull().default(true),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
    deletedAt: timestamp('deleted_at', { withTimezone: true }),
  },
  (table) => ({
    tenantIdx: index('time_packs_tenant_idx').on(table.tenantId, table.isActive),
  }),
);

export type TimePack = typeof timePacks.$inferSelect;
export type NewTimePack = typeof timePacks.$inferInsert;

// ─── Customer time pack (instance) ─────────────────────────────────────

export const customerTimePacks = pgTable(
  'customer_time_packs',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    tenantId: uuid('tenant_id')
      .notNull()
      .references(() => tenants.id, { onDelete: 'cascade' }),
    /**
     * Vlastnik balicku — bud customer NEBO corporate account, ne oba.
     * CHECK constraint v migration zarucuje XOR (sprint 3.3 fáze B2-extended).
     */
    customerId: uuid('customer_id').references(() => customers.id, { onDelete: 'cascade' }),
    corporateAccountId: uuid('corporate_account_id').references(() => corporateAccounts.id, {
      onDelete: 'cascade',
    }),
    timePackId: uuid('time_pack_id')
      .notNull()
      .references(() => timePacks.id, { onDelete: 'restrict' }),
    /** Snapshot konfigurace pri nakupu. */
    snapshotMaxBookingsPerPeriod: integer('snapshot_max_bookings_per_period'),
    snapshotMaxBookingsPerDay: integer('snapshot_max_bookings_per_day'),
    snapshotAllowedServiceIds: jsonb('snapshot_allowed_service_ids')
      .notNull()
      .default([])
      .$type<string[]>(),
    snapshotAllowedBranchIds: jsonb('snapshot_allowed_branch_ids')
      .notNull()
      .default([])
      .$type<string[]>(),
    /** Cumulative counter pouziti za cele obdobi. */
    bookingsUsed: integer('bookings_used').notNull().default(0),
    /** Platnost od (typicky purchasedAt). */
    validFrom: timestamp('valid_from', { withTimezone: true }).notNull().defaultNow(),
    /** Platnost do — vypocteno z durationDays. */
    validUntil: timestamp('valid_until', { withTimezone: true }).notNull(),
    /** 'active' | 'expired' | 'used_up' | 'refunded' | 'cancelled' */
    status: varchar('status', { length: 20 }).notNull().default('active'),
    pricePaidHellers: integer('price_paid_hellers').notNull().default(0),
    soldBy: uuid('sold_by').references(() => users.id),
    note: text('note'),
    purchasedAt: timestamp('purchased_at', { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => ({
    tenantIdx: index('customer_time_packs_tenant_idx').on(table.tenantId),
    customerIdx: index('customer_time_packs_customer_idx').on(table.customerId, table.status),
    corporateIdx: index('customer_time_packs_corporate_idx').on(
      table.corporateAccountId,
      table.status,
    ),
    validityIdx: index('customer_time_packs_validity_idx').on(table.validUntil, table.status),
  }),
);

export type CustomerTimePack = typeof customerTimePacks.$inferSelect;
export type NewCustomerTimePack = typeof customerTimePacks.$inferInsert;

// ─── Time pack uses (audit log) ────────────────────────────────────────

export const timePackUses = pgTable(
  'time_pack_uses',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    tenantId: uuid('tenant_id')
      .notNull()
      .references(() => tenants.id, { onDelete: 'cascade' }),
    customerTimePackId: uuid('customer_time_pack_id')
      .notNull()
      .references(() => customerTimePacks.id, { onDelete: 'cascade' }),
    /** Booking, ktery zpusobil pouziti. NULL pro admin_adjustment. */
    bookingId: uuid('booking_id').references(() => bookings.id, { onDelete: 'set null' }),
    /** Sluzba, ktera byla rezervovana. NULL pro admin_adjustment. */
    serviceId: uuid('service_id').references(() => services.id, { onDelete: 'restrict' }),
    /** Lokalni datum pouziti (pro maxBookingsPerDay agregaci). */
    usageDate: timestamp('usage_date', { withTimezone: true }).notNull().defaultNow(),
    /** 'consumed' | 'refunded' | 'admin_adjustment' */
    action: varchar('action', { length: 32 }).notNull(),
    /** Kdo provedl. NULL pro automaticke akce. */
    performedBy: uuid('performed_by').references(() => users.id),
    note: text('note'),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => ({
    tenantIdx: index('time_pack_uses_tenant_idx').on(table.tenantId, table.createdAt),
    packIdx: index('time_pack_uses_pack_idx').on(table.customerTimePackId, table.createdAt),
    bookingIdx: index('time_pack_uses_booking_idx').on(table.bookingId),
    dailyIdx: index('time_pack_uses_daily_idx').on(table.customerTimePackId, table.usageDate),
  }),
);

export type TimePackUse = typeof timePackUses.$inferSelect;
export type NewTimePackUse = typeof timePackUses.$inferInsert;
