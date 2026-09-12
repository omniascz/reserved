import {
  pgTable,
  uuid,
  varchar,
  text,
  timestamp,
  integer,
  boolean,
  jsonb,
  uniqueIndex,
} from 'drizzle-orm/pg-core';

// platform_plans — placené plány Reserved samotného (tenant je platí, ne customer).
// Plán má dva Stripe Price IDs (monthly + yearly) a strukturované limity/features
// pro UI a runtime gating.
//
// Keys jsou stabilní: 'starter', 'professional', 'business', 'enterprise'.
// Cena v halerich pro konzistenci se zbytkem systemu.

export const platformPlans = pgTable(
  'platform_plans',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    /** Stabilní key (např. 'starter'); shoduje se s tenants.plan. */
    key: varchar('key', { length: 32 }).notNull(),
    name: varchar('name', { length: 100 }).notNull(),
    description: text('description'),
    /** Měsíční cena (halere). 0 = free plán. */
    monthlyPriceHellers: integer('monthly_price_hellers').notNull(),
    /** Roční cena (halere). Default 10× měsíční (2 měsíce zdarma). */
    yearlyPriceHellers: integer('yearly_price_hellers').notNull(),
    currency: varchar('currency', { length: 3 }).notNull().default('CZK'),
    /** Stripe Price ID pro měsíční plán (null pro free). */
    stripeMonthlyPriceId: varchar('stripe_monthly_price_id', { length: 64 }),
    /** Stripe Price ID pro roční plán. */
    stripeYearlyPriceId: varchar('stripe_yearly_price_id', { length: 64 }),
    /** Trial dni pri prvním přihlášení (volitelné). */
    trialDays: integer('trial_days').notNull().default(0),
    /** Strukturované limity: maxBookingsPerMonth, maxEmployees, maxBranches, atd. */
    limits: jsonb('limits').notNull().default({}),
    /** Sezena fíčur: smsEnabled, googleCalendar, b2b, atd. */
    features: jsonb('features').notNull().default({}),
    isPublic: boolean('is_public').notNull().default(true),
    sortOrder: integer('sort_order').notNull().default(0),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => ({
    keyIdx: uniqueIndex('platform_plans_key_idx').on(table.key),
  }),
);

export type PlatformPlan = typeof platformPlans.$inferSelect;
export type NewPlatformPlan = typeof platformPlans.$inferInsert;
