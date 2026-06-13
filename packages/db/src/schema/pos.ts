import {
  pgTable,
  uuid,
  varchar,
  integer,
  boolean,
  text,
  timestamp,
  index,
} from 'drizzle-orm/pg-core';
import { tenants } from './tenants.js';
import { branches } from './branches.js';
import { users } from './users.js';

// Lehký POS (sprint 10.19) — pultový prodej na recepci.
// Reserved není plná kavárenská pokladna; tohle je „prodej na místě" pro
// booking-studia: prodej permanentky / zboží / ruční položky → platba →
// účtenka → zápis do DB (+ odečet skladu). Plný terminál karet = až s platbami.

// ─── Produkty (retail zboží) ───────────────────────────────────────────

export const posProducts = pgTable(
  'pos_products',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    tenantId: uuid('tenant_id')
      .notNull()
      .references(() => tenants.id, { onDelete: 'cascade' }),
    name: varchar('name', { length: 200 }).notNull(),
    sku: varchar('sku', { length: 64 }),
    priceHellers: integer('price_hellers').notNull(),
    /** DPH sazba v procentech (CZ: 21 / 12 / 0). */
    vatRate: integer('vat_rate').notNull().default(21),
    /** Sleduje se sklad? Služby/neskladové = false. */
    tracksStock: boolean('tracks_stock').notNull().default(true),
    stock: integer('stock').notNull().default(0),
    isActive: boolean('is_active').notNull().default(true),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
    deletedAt: timestamp('deleted_at', { withTimezone: true }),
  },
  (table) => ({
    tenantIdx: index('pos_products_tenant_idx').on(table.tenantId),
  }),
);
export type PosProduct = typeof posProducts.$inferSelect;

// ─── Prodeje + položky ──────────────────────────────────────────────────

export const posPaymentMethods = ['cash', 'card_manual', 'voucher'] as const;
export type PosPaymentMethod = (typeof posPaymentMethods)[number];

export const posSales = pgTable(
  'pos_sales',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    tenantId: uuid('tenant_id')
      .notNull()
      .references(() => tenants.id, { onDelete: 'cascade' }),
    branchId: uuid('branch_id').references(() => branches.id, { onDelete: 'set null' }),
    customerId: uuid('customer_id'),
    /** Pořadové číslo účtenky v rámci tenanta, formát R-YYYY-NNNN. */
    receiptNumber: varchar('receipt_number', { length: 32 }).notNull(),
    totalHellers: integer('total_hellers').notNull(),
    currency: varchar('currency', { length: 3 }).notNull().default('CZK'),
    paymentMethod: varchar('payment_method', { length: 16 }).notNull(),
    note: text('note'),
    createdBy: uuid('created_by').references(() => users.id),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => ({
    tenantIdx: index('pos_sales_tenant_idx').on(table.tenantId, table.createdAt),
    receiptIdx: index('pos_sales_receipt_idx').on(table.tenantId, table.receiptNumber),
  }),
);
export type PosSale = typeof posSales.$inferSelect;

export const posSaleItemTypes = ['product', 'pack', 'manual'] as const;
export type PosSaleItemType = (typeof posSaleItemTypes)[number];

export const posSaleItems = pgTable(
  'pos_sale_items',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    tenantId: uuid('tenant_id')
      .notNull()
      .references(() => tenants.id, { onDelete: 'cascade' }),
    saleId: uuid('sale_id')
      .notNull()
      .references(() => posSales.id, { onDelete: 'cascade' }),
    /** product | pack | manual. */
    itemType: varchar('item_type', { length: 16 }).notNull(),
    /** Odkaz na produkt (pos_products.id) nebo šablonu permanentky (credit_packs.id). */
    refId: uuid('ref_id'),
    name: varchar('name', { length: 200 }).notNull(),
    quantity: integer('quantity').notNull().default(1),
    unitPriceHellers: integer('unit_price_hellers').notNull(),
    vatRate: integer('vat_rate').notNull().default(21),
    lineTotalHellers: integer('line_total_hellers').notNull(),
  },
  (table) => ({
    saleIdx: index('pos_sale_items_sale_idx').on(table.saleId),
  }),
);
export type PosSaleItem = typeof posSaleItems.$inferSelect;
