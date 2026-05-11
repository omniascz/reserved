import {
  pgTable,
  uuid,
  varchar,
  text,
  timestamp,
  boolean,
  jsonb,
  index,
  uniqueIndex,
} from 'drizzle-orm/pg-core';
import { tenants } from './tenants.js';
import { users } from './users.js';

// Reference: reserved-docs/13b_db_schema_users_customers.md
//
// Customer = entita zákazníka v rámci tenanta. Oddělená od `users` (= admin
// zaměstnanci). Customer může (ale nemusí) mít login do portálu — pak má
// link na users.id přes user_id.
//
// Customer je jednoznačně identifikovaný (tenantId, email) — viz unique index.
// Existující booking.customer_id → customers.id (nová FK přidaná v sprintu 1.7).

export const customers = pgTable(
  'customers',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    tenantId: uuid('tenant_id')
      .notNull()
      .references(() => tenants.id, { onDelete: 'cascade' }),
    /** Volitelně přihlášený zákazník (pro portál v sprint 2.3). */
    userId: uuid('user_id').references(() => users.id, { onDelete: 'set null' }),
    firstName: varchar('first_name', { length: 100 }).notNull(),
    lastName: varchar('last_name', { length: 100 }).notNull(),
    email: varchar('email', { length: 255 }).notNull(),
    phone: varchar('phone', { length: 32 }),
    /** ISO 3166 country code. */
    country: varchar('country', { length: 2 }),
    /** Datum narození (pro age-verified služby, narozeninové notifikace). */
    dateOfBirth: timestamp('date_of_birth', { withTimezone: false, mode: 'date' }),
    /** Souhlas s marketingem (GDPR). Default false = opt-in vyžadován. */
    marketingOptIn: boolean('marketing_opt_in').notNull().default(false),
    /** Zákazník je VIP / firemní / atd. — explicitní flag pro rychlou filtraci. */
    customerType: varchar('customer_type', { length: 32 }).notNull().default('regular'),
    /** Volné metadata (lifecycle stav, source, custom fields). */
    metadata: jsonb('metadata').notNull().default({}),
    isActive: boolean('is_active').notNull().default(true),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
    deletedAt: timestamp('deleted_at', { withTimezone: true }),
  },
  (table) => ({
    tenantEmailUniq: uniqueIndex('customers_tenant_email_uniq').on(table.tenantId, table.email),
    tenantIdx: index('customers_tenant_idx').on(table.tenantId),
    userIdx: index('customers_user_idx').on(table.userId),
    /** Pro full-text search v admin UI. */
    nameIdx: index('customers_name_idx').on(table.tenantId, table.lastName, table.firstName),
  }),
);

export type Customer = typeof customers.$inferSelect;
export type NewCustomer = typeof customers.$inferInsert;

// ─── Customer tags ──────────────────────────────────────────────────────

export const customerTags = pgTable(
  'customer_tags',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    tenantId: uuid('tenant_id')
      .notNull()
      .references(() => tenants.id, { onDelete: 'cascade' }),
    customerId: uuid('customer_id')
      .notNull()
      .references(() => customers.id, { onDelete: 'cascade' }),
    /** Tag jako text: "VIP", "firemní", "alergie", ... */
    tag: varchar('tag', { length: 50 }).notNull(),
    /** Hex barva tagu pro UI. */
    color: varchar('color', { length: 7 }),
    createdBy: uuid('created_by').references(() => users.id),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => ({
    uniqIdx: uniqueIndex('customer_tags_uniq').on(table.customerId, table.tag),
    tenantIdx: index('customer_tags_tenant_idx').on(table.tenantId),
    tagSearchIdx: index('customer_tags_tag_search_idx').on(table.tenantId, table.tag),
  }),
);

export type CustomerTag = typeof customerTags.$inferSelect;
export type NewCustomerTag = typeof customerTags.$inferInsert;

// ─── Customer notes ─────────────────────────────────────────────────────

export const customerNotes = pgTable(
  'customer_notes',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    tenantId: uuid('tenant_id')
      .notNull()
      .references(() => tenants.id, { onDelete: 'cascade' }),
    customerId: uuid('customer_id')
      .notNull()
      .references(() => customers.id, { onDelete: 'cascade' }),
    note: text('note').notNull(),
    /** Stínový atribut: 'general' | 'medical' | 'preferences' | 'warning'. */
    category: varchar('category', { length: 32 }).notNull().default('general'),
    /** Visibility: 'all' (všichni zaměstnanci) | 'managers' (manager+owner). */
    visibility: varchar('visibility', { length: 32 }).notNull().default('all'),
    createdBy: uuid('created_by').references(() => users.id),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => ({
    tenantIdx: index('customer_notes_tenant_idx').on(table.tenantId),
    customerIdx: index('customer_notes_customer_idx').on(table.customerId, table.createdAt),
  }),
);

export type CustomerNote = typeof customerNotes.$inferSelect;
export type NewCustomerNote = typeof customerNotes.$inferInsert;
