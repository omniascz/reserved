import {
  pgTable,
  uuid,
  varchar,
  text,
  timestamp,
  boolean,
  index,
  unique,
} from 'drizzle-orm/pg-core';
import { tenants } from './tenants.js';
import { customers } from './customers.js';
import { users } from './users.js';

// Korporátní (B2B) účty (sprint 3.3 fáze B1).
//
// Firma jako entita ktera muze:
//   - mit vlastni fakturacni udaje (DIC, adresa, kontakt)
//   - mit prirazene zamestnance/cleny (customers)
//   - kupovat balicky pro cleny (B2 phase)
//   - dostavat fakturu hromadne (B3 phase)
//
// Vztah customer <-> corporate je M:N pres corporate_account_members.

// ─── Corporate account (firma) ─────────────────────────────────────────

export const corporateAccounts = pgTable(
  'corporate_accounts',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    tenantId: uuid('tenant_id')
      .notNull()
      .references(() => tenants.id, { onDelete: 'cascade' }),
    companyName: varchar('company_name', { length: 200 }).notNull(),
    /** DIČ (CZ format pripadne IC neuvedeno = NULL). */
    vatId: varchar('vat_id', { length: 32 }),
    /** IČO (CZ identifikační číslo) — odlišné od DIČ. */
    companyRegId: varchar('company_reg_id', { length: 32 }),
    /** Fakturacni adresa. */
    billingAddressLine1: varchar('billing_address_line1', { length: 200 }),
    billingAddressLine2: varchar('billing_address_line2', { length: 200 }),
    billingCity: varchar('billing_city', { length: 100 }),
    billingZip: varchar('billing_zip', { length: 20 }),
    billingCountry: varchar('billing_country', { length: 2 }).default('CZ'),
    /** Kontaktni email pro fakturaci + notifikace. */
    contactEmail: varchar('contact_email', { length: 255 }),
    contactPhone: varchar('contact_phone', { length: 40 }),
    contactPersonName: varchar('contact_person_name', { length: 200 }),
    note: text('note'),
    isActive: boolean('is_active').notNull().default(true),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
    deletedAt: timestamp('deleted_at', { withTimezone: true }),
  },
  (table) => ({
    tenantIdx: index('corporate_accounts_tenant_idx').on(table.tenantId, table.isActive),
    nameIdx: index('corporate_accounts_name_idx').on(table.tenantId, table.companyName),
  }),
);

export type CorporateAccount = typeof corporateAccounts.$inferSelect;
export type NewCorporateAccount = typeof corporateAccounts.$inferInsert;

// ─── Corporate account members (clenove firmy) ─────────────────────────

export const corporateAccountMembers = pgTable(
  'corporate_account_members',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    tenantId: uuid('tenant_id')
      .notNull()
      .references(() => tenants.id, { onDelete: 'cascade' }),
    corporateAccountId: uuid('corporate_account_id')
      .notNull()
      .references(() => corporateAccounts.id, { onDelete: 'cascade' }),
    customerId: uuid('customer_id')
      .notNull()
      .references(() => customers.id, { onDelete: 'cascade' }),
    /**
     * 'member' = bezny clen ktery cerpa firmni balicky
     * 'admin' = clen ktery muze spravovat ostatni cleny + objednavat balicky
     *           za firmu (pres self-service portal v budoucnu)
     */
    role: varchar('role', { length: 20 }).notNull().default('member'),
    /** Kdo pridal clena (admin / corporate admin). */
    addedBy: uuid('added_by').references(() => users.id),
    joinedAt: timestamp('joined_at', { withTimezone: true }).notNull().defaultNow(),
    /** Soft removal — clen prestal byt aktivni (napr. opustil firmu). */
    removedAt: timestamp('removed_at', { withTimezone: true }),
  },
  (table) => ({
    tenantIdx: index('corporate_account_members_tenant_idx').on(table.tenantId),
    corporateIdx: index('corporate_account_members_corporate_idx').on(
      table.corporateAccountId,
      table.removedAt,
    ),
    customerIdx: index('corporate_account_members_customer_idx').on(
      table.customerId,
      table.removedAt,
    ),
    // Customer muze byt aktivnim clenem stejne firmy jen jednou (pokud byl
    // odstranen, lze ho znovu pridat — proto vcetne removedAt v unique).
    uniqueActiveMember: unique('corporate_account_members_unique_active').on(
      table.corporateAccountId,
      table.customerId,
      table.removedAt,
    ),
  }),
);

export type CorporateAccountMember = typeof corporateAccountMembers.$inferSelect;
export type NewCorporateAccountMember = typeof corporateAccountMembers.$inferInsert;
