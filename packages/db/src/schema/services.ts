import {
  pgTable,
  uuid,
  varchar,
  text,
  timestamp,
  integer,
  boolean,
  jsonb,
  index,
  uniqueIndex,
} from 'drizzle-orm/pg-core';
import { tenants } from './tenants.js';

// Reference: reserved-docs/13c_db_schema_services_pricing.md
//
// Hierarchie:
//   service_categories  (např. "Vlasy", "Manikúra", "Masáže")
//     └── services      (např. "Dámský střih", "Pánský střih")
//          └── service_addons (např. "Mytí + foukání", "Hloubková regenerace")
//
// Vše tenant-scoped (každý salon má vlastní katalog).
// Cena v haléřích jako INTEGER (per CLAUDE.md).

// ─── Kategorie služeb ──────────────────────────────────────────────────────

export const serviceCategories = pgTable(
  'service_categories',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    tenantId: uuid('tenant_id')
      .notNull()
      .references(() => tenants.id, { onDelete: 'cascade' }),
    name: varchar('name', { length: 200 }).notNull(),
    description: text('description'),
    /** Hex kód (#RRGGBB) — pro vizuální rozlišení v kalendáři. */
    color: varchar('color', { length: 7 }),
    /** Ikona z lucide.dev nebo emoji. */
    icon: varchar('icon', { length: 50 }),
    /** Pořadí v UI; nižší = první. */
    sortOrder: integer('sort_order').notNull().default(0),
    isActive: boolean('is_active').notNull().default(true),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
    deletedAt: timestamp('deleted_at', { withTimezone: true }),
  },
  (table) => ({
    tenantIdx: index('service_categories_tenant_idx').on(table.tenantId),
    sortIdx: index('service_categories_sort_idx').on(table.tenantId, table.sortOrder),
  }),
);

export type ServiceCategory = typeof serviceCategories.$inferSelect;
export type NewServiceCategory = typeof serviceCategories.$inferInsert;

// ─── Služby ────────────────────────────────────────────────────────────────

export const services = pgTable(
  'services',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    tenantId: uuid('tenant_id')
      .notNull()
      .references(() => tenants.id, { onDelete: 'cascade' }),
    categoryId: uuid('category_id').references(() => serviceCategories.id, {
      onDelete: 'set null',
    }),
    name: varchar('name', { length: 200 }).notNull(),
    /** Krátký popis (1-2 věty). */
    description: text('description'),
    /** Trvání služby v minutách. */
    durationMinutes: integer('duration_minutes').notNull(),
    /** Buffer čas po službě (např. 10 min na úklid). */
    bufferAfterMinutes: integer('buffer_after_minutes').notNull().default(0),
    /** Buffer čas před službou (např. 5 min příprava). */
    bufferBeforeMinutes: integer('buffer_before_minutes').notNull().default(0),
    /** Cena v haléřích. INTEGER, nikdy float. */
    priceHellers: integer('price_hellers').notNull(),
    /** ISO 4217 měna; default = tenant.currency. */
    currency: varchar('currency', { length: 3 }).notNull().default('CZK'),
    /** Hex barva (přepíše kategorii v kalendáři). */
    color: varchar('color', { length: 7 }),
    /** URL k fotce / náhledu. */
    imageUrl: text('image_url'),
    /** Pro online widget — má být služba viditelná zvenku? */
    isPublic: boolean('is_public').notNull().default(true),
    /** Vyžaduje zálohu předem (procento z ceny). NULL = bez zálohy. */
    depositPercent: integer('deposit_percent'),
    /** Maximální počet účastníků (1 = individuální, >1 = skupinová). */
    capacity: integer('capacity').notNull().default(1),
    /** Pořadí v rámci kategorie. */
    sortOrder: integer('sort_order').notNull().default(0),
    isActive: boolean('is_active').notNull().default(true),
    /** Volné rozšíření (např. equipment_required, intake_form_url, ...). */
    metadata: jsonb('metadata').notNull().default({}),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
    deletedAt: timestamp('deleted_at', { withTimezone: true }),
  },
  (table) => ({
    tenantIdx: index('services_tenant_idx').on(table.tenantId),
    categoryIdx: index('services_category_idx').on(table.tenantId, table.categoryId),
    publicIdx: index('services_public_idx').on(table.tenantId, table.isPublic, table.isActive),
    sortIdx: index('services_sort_idx').on(table.tenantId, table.sortOrder),
  }),
);

export type Service = typeof services.$inferSelect;
export type NewService = typeof services.$inferInsert;

// ─── Service addons (volitelné přídavky) ───────────────────────────────────

export const serviceAddons = pgTable(
  'service_addons',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    tenantId: uuid('tenant_id')
      .notNull()
      .references(() => tenants.id, { onDelete: 'cascade' }),
    serviceId: uuid('service_id')
      .notNull()
      .references(() => services.id, { onDelete: 'cascade' }),
    name: varchar('name', { length: 200 }).notNull(),
    description: text('description'),
    /** Dodatečné minuty navíc, když si zákazník přikoupí. */
    extraMinutes: integer('extra_minutes').notNull().default(0),
    /** Příplatek v haléřích. */
    extraPriceHellers: integer('extra_price_hellers').notNull().default(0),
    isActive: boolean('is_active').notNull().default(true),
    sortOrder: integer('sort_order').notNull().default(0),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => ({
    tenantIdx: index('service_addons_tenant_idx').on(table.tenantId),
    serviceIdx: index('service_addons_service_idx').on(table.serviceId),
  }),
);

export type ServiceAddon = typeof serviceAddons.$inferSelect;
export type NewServiceAddon = typeof serviceAddons.$inferInsert;
