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

// Bundle balicky (sprint 3.3 fáze A1).
//
// Bundle = svazek konkretnich sluzeb v jedne cene. Priklad:
//   "Relaxacni balicek" = masaz 60min × 1 + manikura × 1 + zabal × 1 za 2200 Kc.
//
// Tri tabulky paralelne ke credit_packs:
//   1. bundle_packs            — sablona (admin definuje)
//   2. customer_bundle_packs   — instance vlastnena zakaznikem (mutable items)
//   3. bundle_item_uses        — audit log per polozka

// ─── Bundle pack template ──────────────────────────────────────────────

export type BundleItem = {
  serviceId: string;
  quantity: number;
};

export const bundlePacks = pgTable(
  'bundle_packs',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    tenantId: uuid('tenant_id')
      .notNull()
      .references(() => tenants.id, { onDelete: 'cascade' }),
    name: varchar('name', { length: 200 }).notNull(),
    description: text('description'),
    /** Položky balíčku: [{ serviceId, quantity }]. */
    items: jsonb('items').notNull().default([]).$type<BundleItem[]>(),
    /** Pocet dni platnosti od zakoupeni. NULL = bez expirace. */
    validityDays: integer('validity_days'),
    /** Prodejni cena (haléřů). */
    priceHellers: integer('price_hellers').notNull().default(0),
    currency: varchar('currency', { length: 3 }).notNull().default('CZK'),
    /** UUID[] pobocek; prazdne = vsechny. */
    allowedBranchIds: jsonb('allowed_branch_ids').notNull().default([]).$type<string[]>(),
    /** Pokud true, vsechny polozky musi byt vycerpany v jedne rezervaci (group booking). */
    sameVisitRequired: boolean('same_visit_required').notNull().default(false),
    isActive: boolean('is_active').notNull().default(true),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
    deletedAt: timestamp('deleted_at', { withTimezone: true }),
  },
  (table) => ({
    tenantIdx: index('bundle_packs_tenant_idx').on(table.tenantId, table.isActive),
  }),
);

export type BundlePack = typeof bundlePacks.$inferSelect;
export type NewBundlePack = typeof bundlePacks.$inferInsert;

// ─── Customer bundle pack (instance) ───────────────────────────────────

export const customerBundlePacks = pgTable(
  'customer_bundle_packs',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    tenantId: uuid('tenant_id')
      .notNull()
      .references(() => tenants.id, { onDelete: 'cascade' }),
    customerId: uuid('customer_id')
      .notNull()
      .references(() => customers.id, { onDelete: 'cascade' }),
    bundlePackId: uuid('bundle_pack_id')
      .notNull()
      .references(() => bundlePacks.id, { onDelete: 'restrict' }),
    /** Aktualni stav polozek (mutuje pri cerpani). */
    itemsRemaining: jsonb('items_remaining').notNull().default([]).$type<BundleItem[]>(),
    /** Snapshot polozek pri nakupu (sablona se muze pozdeji zmenit). */
    snapshotItems: jsonb('snapshot_items').notNull().default([]).$type<BundleItem[]>(),
    snapshotAllowedBranchIds: jsonb('snapshot_allowed_branch_ids')
      .notNull()
      .default([])
      .$type<string[]>(),
    snapshotSameVisitRequired: boolean('snapshot_same_visit_required').notNull().default(false),
    /** Platnost od (typicky purchasedAt). */
    validFrom: timestamp('valid_from', { withTimezone: true }).notNull().defaultNow(),
    /** Platnost do — NULL pro bez expirace. */
    validUntil: timestamp('valid_until', { withTimezone: true }),
    /** 'active' | 'expired' | 'used_up' | 'refunded' | 'cancelled' */
    status: varchar('status', { length: 20 }).notNull().default('active'),
    /** Cena ktera byla skutecne zaplacena (muze se lisit od sablony pro slevy). */
    pricePaidHellers: integer('price_paid_hellers').notNull().default(0),
    soldBy: uuid('sold_by').references(() => users.id),
    note: text('note'),
    purchasedAt: timestamp('purchased_at', { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => ({
    tenantIdx: index('customer_bundle_packs_tenant_idx').on(table.tenantId),
    customerIdx: index('customer_bundle_packs_customer_idx').on(table.customerId, table.status),
    validityIdx: index('customer_bundle_packs_validity_idx').on(table.validUntil, table.status),
  }),
);

export type CustomerBundlePack = typeof customerBundlePacks.$inferSelect;
export type NewCustomerBundlePack = typeof customerBundlePacks.$inferInsert;

// ─── Bundle item uses (audit log) ──────────────────────────────────────

export const bundleItemUses = pgTable(
  'bundle_item_uses',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    tenantId: uuid('tenant_id')
      .notNull()
      .references(() => tenants.id, { onDelete: 'cascade' }),
    customerBundlePackId: uuid('customer_bundle_pack_id')
      .notNull()
      .references(() => customerBundlePacks.id, { onDelete: 'cascade' }),
    /** Booking, ktery zpusobil uziti. NULL pro admin_adjustment. */
    bookingId: uuid('booking_id').references(() => bookings.id, { onDelete: 'set null' }),
    /** Sluzba ktere se polozka tyka. */
    serviceId: uuid('service_id')
      .notNull()
      .references(() => services.id, { onDelete: 'restrict' }),
    /** Kolik kusu strzeno. Zaporne = refund. */
    quantityDeducted: integer('quantity_deducted').notNull(),
    /** 'consumed' | 'refunded' | 'admin_adjustment' | 'cancelled' */
    action: varchar('action', { length: 32 }).notNull(),
    /** Kdo provedl. NULL pro automaticke akce. */
    performedBy: uuid('performed_by').references(() => users.id),
    note: text('note'),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => ({
    tenantIdx: index('bundle_item_uses_tenant_idx').on(table.tenantId, table.createdAt),
    packIdx: index('bundle_item_uses_pack_idx').on(table.customerBundlePackId, table.createdAt),
    bookingIdx: index('bundle_item_uses_booking_idx').on(table.bookingId),
  }),
);

export type BundleItemUse = typeof bundleItemUses.$inferSelect;
export type NewBundleItemUse = typeof bundleItemUses.$inferInsert;
