import { pgTable, uuid, varchar, integer, timestamp, index } from 'drizzle-orm/pg-core';
import { tenants } from './tenants.js';

// Sjednocený košík / objednávka (sprint 10.41) — zaplať víc věcí různého typu
// (lekce + vstup do wellness + 1:1 + produkt) jednou platbou. Žádný smíšený dům
// to dnes nemá; končí s 2–4 oddělenými platbami.

/** Typ položky košíku. */
export const orderItemKinds = [
  'class',
  'admission',
  'appointment',
  'course',
  'product',
  'other',
] as const;
export type OrderItemKind = (typeof orderItemKinds)[number];

export const orders = pgTable(
  'orders',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    tenantId: uuid('tenant_id')
      .notNull()
      .references(() => tenants.id, { onDelete: 'cascade' }),
    customerId: uuid('customer_id'),
    customerName: varchar('customer_name', { length: 200 }).notNull(),
    customerEmail: varchar('customer_email', { length: 255 }),
    totalHellers: integer('total_hellers').notNull().default(0),
    currency: varchar('currency', { length: 3 }).notNull().default('CZK'),
    status: varchar('status', { length: 16 }).notNull().default('open'),
    paymentId: uuid('payment_id'),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => ({
    tenantIdx: index('orders_tenant_idx').on(table.tenantId),
  }),
);
export type Order = typeof orders.$inferSelect;

export const orderItems = pgTable(
  'order_items',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    tenantId: uuid('tenant_id')
      .notNull()
      .references(() => tenants.id, { onDelete: 'cascade' }),
    orderId: uuid('order_id')
      .notNull()
      .references(() => orders.id, { onDelete: 'cascade' }),
    kind: varchar('kind', { length: 16 }).notNull().default('other'),
    /** Volitelná vazba na konkrétní entitu (rezervace, vstupenka, produkt…). */
    refId: uuid('ref_id'),
    name: varchar('name', { length: 200 }).notNull(),
    priceHellers: integer('price_hellers').notNull().default(0),
    quantity: integer('quantity').notNull().default(1),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => ({
    orderIdx: index('order_items_order_idx').on(table.orderId),
  }),
);
export type OrderItem = typeof orderItems.$inferSelect;
