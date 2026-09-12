import {
  boolean,
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
    /** NOT NULL = doména je ověřená přes DNS TXT záznam (a používá se v middleware). */
    customDomainVerifiedAt: timestamp('custom_domain_verified_at', { withTimezone: true }),
    /** Token, který musí být v TXT záznamu `_reserved-verification.<domain>`. */
    customDomainVerificationToken: varchar('custom_domain_verification_token', { length: 64 }),
    plan: varchar('plan', { length: 32 }).notNull().default('starter'),
    status: varchar('status', { length: 32 }).notNull().default('trial'),
    locale: varchar('locale', { length: 8 }).notNull().default('cs-CZ'),
    timezone: varchar('timezone', { length: 64 }).notNull().default('Europe/Prague'),
    currency: varchar('currency', { length: 3 }).notNull().default('CZK'),
    settings: jsonb('settings').notNull().default({}),
    trialEndsAt: timestamp('trial_ends_at', { withTimezone: true }),
    suspendedAt: timestamp('suspended_at', { withTimezone: true }),
    suspensionReason: text('suspension_reason'),
    businessType: varchar('business_type', { length: 64 }),
    ownerEmail: varchar('owner_email', { length: 255 }),
    /** Stripe Customer ID — tenant je customer u Reserved (ne u sebe). */
    stripeCustomerId: varchar('stripe_customer_id', { length: 64 }),
    /** Aktivní Stripe Subscription ID. */
    stripeSubscriptionId: varchar('stripe_subscription_id', { length: 64 }),
    /** Status z Stripe — incomplete | trialing | active | past_due | canceled | unpaid. */
    stripeSubscriptionStatus: varchar('stripe_subscription_status', { length: 32 }),
    /** Datum dalšího plateby (z Stripe current_period_end). */
    currentPeriodEnd: timestamp('current_period_end', { withTimezone: true }),
    /** Zda subscription bude zrušená na konci období. */
    cancelAtPeriodEnd: varchar('cancel_at_period_end', { length: 8 }).default('false'),
    /** Volitelný oddělený fakturační email (jinak owner_email). */
    billingEmail: varchar('billing_email', { length: 255 }),
    /** Marketplace v1: tenant je viditelný v katalogu na reserved.cz. */
    listedInCatalog: boolean('listed_in_catalog').notNull().default(false),
    /** Dlouhý popis pro katalog (markdown OK). */
    publicDescription: text('public_description'),
    /** Město pro vyhledávání. */
    publicCity: varchar('public_city', { length: 100 }),
    /** Plná adresa s ulicí a PSČ. */
    publicAddress: text('public_address'),
    /** Pole URL fotografií (cover + další). */
    publicPhotos: jsonb('public_photos').notNull().default([]),
    /** Otevírací hodiny { mon: '9-18', tue: '9-18', ... }. */
    publicBusinessHours: jsonb('public_business_hours').notNull().default({}),
    /**
     * Theme pro widget (Sprint 8.1):
     *   { primaryColor: '#FF6B6B', borderRadius: 'md', logoUrl, fontFamily }
     * Widget aplikuje pres CSS custom properties.
     */
    theme: jsonb('theme').notNull().default({}),
    /**
     * Sprint 9.0: Mini-website šablona.
     * 'elegant' | 'bold' | 'fresh' | null (= jen widget na doméně).
     */
    siteTemplate: varchar('site_template', { length: 32 }),
    /** Sprint 9.0: Mini-website je aktivní (publikovaná na custom doméně). */
    siteEnabled: boolean('site_enabled').notNull().default(false),
    /**
     * Sprint 9.0: Obsah sekcí mini-webu (hero, about, team, gallery, faq, contact, ...).
     */
    siteContent: jsonb('site_content').notNull().default({}),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
    deletedAt: timestamp('deleted_at', { withTimezone: true }),
  },
  (table) => ({
    slugIdx: uniqueIndex('tenants_slug_idx').on(table.slug),
    customDomainIdx: uniqueIndex('tenants_custom_domain_idx').on(table.customDomain),
    statusIdx: index('tenants_status_idx').on(table.status),
    suspendedIdx: index('tenants_suspended_idx').on(table.suspendedAt),
    businessTypeIdx: index('tenants_business_type_idx').on(table.businessType),
  }),
);

export type Tenant = typeof tenants.$inferSelect;
export type NewTenant = typeof tenants.$inferInsert;
