import { pgTable, uuid, varchar, text, timestamp, jsonb, index } from 'drizzle-orm/pg-core';
import { tenants } from './tenants.js';

// Reference: reserved-docs/13a_db_schema_core.md, 05_hr_a_pobocky.md
//
// Branch = pobočka v rámci tenanta. Tenant může mít 1..N poboček.
// Default branch se vytvoří při tenant onboardingu.

export const branches = pgTable(
  'branches',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    tenantId: uuid('tenant_id')
      .notNull()
      .references(() => tenants.id, { onDelete: 'cascade' }),
    name: varchar('name', { length: 200 }).notNull(),
    slug: varchar('slug', { length: 64 }).notNull(),
    address: text('address'),
    city: varchar('city', { length: 100 }),
    postalCode: varchar('postal_code', { length: 20 }),
    country: varchar('country', { length: 2 }).notNull().default('CZ'),
    phone: varchar('phone', { length: 32 }),
    email: varchar('email', { length: 255 }),
    timezone: varchar('timezone', { length: 64 }),
    settings: jsonb('settings').notNull().default({}),
    isDefault: text('is_default'),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
    deletedAt: timestamp('deleted_at', { withTimezone: true }),
  },
  (table) => ({
    tenantIdx: index('branches_tenant_idx').on(table.tenantId),
    tenantSlugIdx: index('branches_tenant_slug_idx').on(table.tenantId, table.slug),
  }),
);

export type Branch = typeof branches.$inferSelect;
export type NewBranch = typeof branches.$inferInsert;
