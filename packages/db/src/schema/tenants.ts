import {
  pgTable,
  uuid,
  varchar,
  text,
  timestamp,
  jsonb,
  index,
  uniqueIndex,
} from 'drizzle-orm/pg-core';

// Reference: reserved-docs/13a_db_schema_core.md
//
// Tenant = jeden zákazník platformy (salon, fitness studio, klinika...).
// Subdoména `salon-jana.reserved.cz` nebo custom doména `rezervace.salon-jana.cz`.

export const tenants = pgTable(
  'tenants',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    slug: varchar('slug', { length: 64 }).notNull(),
    name: varchar('name', { length: 200 }).notNull(),
    customDomain: varchar('custom_domain', { length: 255 }),
    plan: varchar('plan', { length: 32 }).notNull().default('starter'),
    status: varchar('status', { length: 32 }).notNull().default('trial'),
    locale: varchar('locale', { length: 8 }).notNull().default('cs-CZ'),
    timezone: varchar('timezone', { length: 64 }).notNull().default('Europe/Prague'),
    currency: varchar('currency', { length: 3 }).notNull().default('CZK'),
    settings: jsonb('settings').notNull().default({}),
    trialEndsAt: timestamp('trial_ends_at', { withTimezone: true }),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
    deletedAt: timestamp('deleted_at', { withTimezone: true }),
  },
  (table) => ({
    slugIdx: uniqueIndex('tenants_slug_idx').on(table.slug),
    customDomainIdx: uniqueIndex('tenants_custom_domain_idx').on(table.customDomain),
    statusIdx: index('tenants_status_idx').on(table.status),
  }),
);

export type Tenant = typeof tenants.$inferSelect;
export type NewTenant = typeof tenants.$inferInsert;
