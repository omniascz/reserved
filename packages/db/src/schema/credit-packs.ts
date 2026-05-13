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

// Permanentky / kreditové balíčky (sprint 3.1).
//
// Tři tabulky:
//   1. credit_packs — sablona / SKU, kterou admin definuje ("10x EMS za 3000 Kč")
//   2. customer_credit_packs — instance vlastnena zakaznikem
//        (Jana koupila 10x EMS dne X, zbyva 7)
//   3. credit_uses — audit log pouziti (kazdy odpocet / refund)
//
// Dva rezimy fungovani:
//   - 'per_visit': 1 kredit = 1 rezervace, bez ohledu na delku/cenu sluzby
//   - 'per_credit': sluzba ma vlastni 'cost' v kreditech (creditCostsByService JSONB)

export const creditPacks = pgTable(
  'credit_packs',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    tenantId: uuid('tenant_id')
      .notNull()
      .references(() => tenants.id, { onDelete: 'cascade' }),
    name: varchar('name', { length: 200 }).notNull(),
    description: text('description'),
    /** 'per_visit' = 1 rezervace = 1 kredit / 'per_credit' = sluzba ma vlastni cost. */
    mode: varchar('mode', { length: 20 }).notNull().default('per_visit'),
    /** Celkovy pocet kreditu pri zakoupeni. */
    totalCredits: integer('total_credits').notNull(),
    /** Pocet dni platnosti od zakoupeni. NULL = bez expirace. */
    validityDays: integer('validity_days'),
    /** Prodejni cena v halerich. */
    priceHellers: integer('price_hellers').notNull().default(0),
    currency: varchar('currency', { length: 3 }).notNull().default('CZK'),
    /** UUID[] sluzeb, pro ktere lze balicek pouzit. Prazdny array = vsechny sluzby. */
    allowedServiceIds: jsonb('allowed_service_ids').notNull().default([]),
    /** UUID[] pobocek, kde lze pouzit. Prazdny = vsechny pobocky. */
    allowedBranchIds: jsonb('allowed_branch_ids').notNull().default([]),
    /** Jen pro per_credit mode: {serviceId: creditCost}. */
    creditCostsByService: jsonb('credit_costs_by_service').notNull().default({}),
    isActive: boolean('is_active').notNull().default(true),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
    deletedAt: timestamp('deleted_at', { withTimezone: true }),
  },
  (table) => ({
    tenantIdx: index('credit_packs_tenant_idx').on(table.tenantId, table.isActive),
  }),
);

export type CreditPack = typeof creditPacks.$inferSelect;
export type NewCreditPack = typeof creditPacks.$inferInsert;

// ─── Customer credit pack (instance) ───────────────────────────────────

export const customerCreditPacks = pgTable(
  'customer_credit_packs',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    tenantId: uuid('tenant_id')
      .notNull()
      .references(() => tenants.id, { onDelete: 'cascade' }),
    customerId: uuid('customer_id')
      .notNull()
      .references(() => customers.id, { onDelete: 'cascade' }),
    creditPackId: uuid('credit_pack_id')
      .notNull()
      .references(() => creditPacks.id, { onDelete: 'restrict' }),
    /** Aktualni zustatek kreditu. */
    creditsRemaining: integer('credits_remaining').notNull(),
    /** Snapshot totalCredits v dobe nakupu (sablona se muze pozdeji zmenit). */
    creditsAtPurchase: integer('credits_at_purchase').notNull(),
    /** Snapshot mode / scope (pro pripad ze sablona se zmeni). */
    snapshotMode: varchar('snapshot_mode', { length: 20 }).notNull(),
    snapshotAllowedServiceIds: jsonb('snapshot_allowed_service_ids').notNull().default([]),
    snapshotAllowedBranchIds: jsonb('snapshot_allowed_branch_ids').notNull().default([]),
    snapshotCreditCosts: jsonb('snapshot_credit_costs').notNull().default({}),
    /** Platnost od (typicky purchasedAt). */
    validFrom: timestamp('valid_from', { withTimezone: true }).notNull().defaultNow(),
    /** Platnost do — NULL pro bez expirace. */
    validUntil: timestamp('valid_until', { withTimezone: true }),
    /** 'active' | 'expired' | 'used_up' | 'refunded' | 'cancelled' */
    status: varchar('status', { length: 20 }).notNull().default('active'),
    /** Cena ktera byla skutecne zaplacena (muze se lisit od sablony pro slevy). */
    pricePaidHellers: integer('price_paid_hellers').notNull().default(0),
    /** Kdo prodal (admin user) */
    soldBy: uuid('sold_by').references(() => users.id),
    note: text('note'),
    purchasedAt: timestamp('purchased_at', { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => ({
    tenantIdx: index('customer_credit_packs_tenant_idx').on(table.tenantId),
    customerIdx: index('customer_credit_packs_customer_idx').on(table.customerId, table.status),
    validityIdx: index('customer_credit_packs_validity_idx').on(table.validUntil, table.status),
  }),
);

export type CustomerCreditPack = typeof customerCreditPacks.$inferSelect;
export type NewCustomerCreditPack = typeof customerCreditPacks.$inferInsert;

// ─── Credit uses (audit log) ───────────────────────────────────────────

export const creditUses = pgTable(
  'credit_uses',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    tenantId: uuid('tenant_id')
      .notNull()
      .references(() => tenants.id, { onDelete: 'cascade' }),
    customerCreditPackId: uuid('customer_credit_pack_id')
      .notNull()
      .references(() => customerCreditPacks.id, { onDelete: 'cascade' }),
    /** Booking, ktery zpusobil uziti. NULL pro admin_adjustment nebo penalty. */
    bookingId: uuid('booking_id').references(() => bookings.id, { onDelete: 'set null' }),
    /** Kolik kreditu strzeno. Zaporne = refund. */
    creditsDeducted: integer('credits_deducted').notNull(),
    /** 'consumed' | 'refunded' | 'penalty' | 'admin_adjustment' | 'expired_balance' */
    action: varchar('action', { length: 32 }).notNull(),
    /** Kdo provedl. NULL pro automaticke akce (rules engine, scheduler). */
    performedBy: uuid('performed_by').references(() => users.id),
    note: text('note'),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => ({
    tenantIdx: index('credit_uses_tenant_idx').on(table.tenantId, table.createdAt),
    packIdx: index('credit_uses_pack_idx').on(table.customerCreditPackId, table.createdAt),
    bookingIdx: index('credit_uses_booking_idx').on(table.bookingId),
  }),
);

export type CreditUse = typeof creditUses.$inferSelect;
export type NewCreditUse = typeof creditUses.$inferInsert;
