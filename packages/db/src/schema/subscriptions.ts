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
  unique,
} from 'drizzle-orm/pg-core';
import { tenants } from './tenants.js';
import { customers } from './customers.js';
import { users } from './users.js';

// Subscriptions / předplatné (sprint 3.3 fáze A3).
//
// Subscription = recurring billing přes Stripe. Zákazník platí každý měsíc/rok,
// po dobu aktivního předplatného má definované benefity (slevy, prioritní sloty,
// kredity, exkluzivní služby). Auto-renewal pres Stripe webhooks.
//
// Tři tabulky:
//   1. subscription_plans       — tenant-definovany plan (template)
//   2. customer_subscriptions   — instance per zakaznik (sparovany se Stripe Subscription)
//   3. subscription_events      — audit log Stripe webhook eventu (idempotence)
//
// Tok:
//   admin vytvori plan -> service lazy vytvori Stripe Product+Price
//   customer subscribe -> service vytvori Stripe Customer + Checkout Session (subscription mode)
//   webhook 'checkout.session.completed' s mode='subscription' -> sync state
//   webhook 'invoice.payment_succeeded' -> bump currentPeriodEnd
//   webhook 'customer.subscription.updated' -> sync status / cancel_at_period_end
//   webhook 'customer.subscription.deleted' -> status='canceled'

// ─── Subscription plan (template) ──────────────────────────────────────

/**
 * Vyhody platne pro drzitele aktivniho predplatneho.
 *
 * Tato struktura se snapshotuje do customer_subscriptions pri subscribe,
 * takze zmena planu pozdeji neovlivni existujici predplatne.
 */
export type SubscriptionBenefits = {
  /** Sleva v procentech na vsechny sluzby (0-100). */
  discountPercent?: number;
  /** Prioritni pristup ke slotum (zatim flag, future: predřazeni ve fronte). */
  priorityAccess?: boolean;
  /** Pocet kreditu, ktere se kazdy obnoveny period automaticky pridaji. */
  freeCreditsPerPeriod?: number;
  /** UUID[] sluzeb dostupnych pouze drzitelum predplatneho. */
  exclusiveServiceIds?: string[];
};

export const subscriptionPlans = pgTable(
  'subscription_plans',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    tenantId: uuid('tenant_id')
      .notNull()
      .references(() => tenants.id, { onDelete: 'cascade' }),
    name: varchar('name', { length: 200 }).notNull(),
    description: text('description'),
    /** 'monthly' | 'quarterly' | 'yearly'. */
    billingInterval: varchar('billing_interval', { length: 20 }).notNull(),
    /** Cena za jeden billing interval (halere). */
    priceHellers: integer('price_hellers').notNull(),
    currency: varchar('currency', { length: 3 }).notNull().default('CZK'),
    /** Pocet dni trial (0 = bez trialu). */
    trialDays: integer('trial_days').notNull().default(0),
    benefits: jsonb('benefits').notNull().default({}).$type<SubscriptionBenefits>(),
    /** Stripe Product ID — vytvoreny lazily pri prvnim subscribe. NULL = jeste neexistuje. */
    stripeProductId: varchar('stripe_product_id', { length: 255 }),
    /** Stripe Price ID — vytvoreny lazily. NULL = jeste neexistuje. */
    stripePriceId: varchar('stripe_price_id', { length: 255 }),
    isActive: boolean('is_active').notNull().default(true),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
    deletedAt: timestamp('deleted_at', { withTimezone: true }),
  },
  (table) => ({
    tenantIdx: index('subscription_plans_tenant_idx').on(table.tenantId, table.isActive),
  }),
);

export type SubscriptionPlan = typeof subscriptionPlans.$inferSelect;
export type NewSubscriptionPlan = typeof subscriptionPlans.$inferInsert;

// ─── Customer subscription (instance) ──────────────────────────────────

export const customerSubscriptions = pgTable(
  'customer_subscriptions',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    tenantId: uuid('tenant_id')
      .notNull()
      .references(() => tenants.id, { onDelete: 'cascade' }),
    customerId: uuid('customer_id')
      .notNull()
      .references(() => customers.id, { onDelete: 'cascade' }),
    planId: uuid('plan_id')
      .notNull()
      .references(() => subscriptionPlans.id, { onDelete: 'restrict' }),
    /** Stripe Customer ID (cus_xxx). */
    stripeCustomerId: varchar('stripe_customer_id', { length: 255 }),
    /** Stripe Subscription ID (sub_xxx). NULL pred dokoncenim checkoutu. */
    stripeSubscriptionId: varchar('stripe_subscription_id', { length: 255 }),
    /**
     * Status: 'incomplete' | 'trialing' | 'active' | 'past_due' |
     *        'canceled' | 'unpaid' | 'incomplete_expired'
     */
    status: varchar('status', { length: 30 }).notNull().default('incomplete'),
    /** Aktualni billing period start. */
    currentPeriodStart: timestamp('current_period_start', { withTimezone: true }),
    /** Aktualni billing period end (kdy by se mela uctovat dalsi platba). */
    currentPeriodEnd: timestamp('current_period_end', { withTimezone: true }),
    /** Konec trial obdobi (pokud bezelo). */
    trialEnd: timestamp('trial_end', { withTimezone: true }),
    /** Kdy bylo cancele requested. */
    canceledAt: timestamp('canceled_at', { withTimezone: true }),
    /** True = zustane aktivni do konce period, pak zrusen. */
    cancelAtPeriodEnd: boolean('cancel_at_period_end').notNull().default(false),
    /** Snapshot benefitu z planu pri subscribe (cesta-zavislost na planu). */
    snapshotBenefits: jsonb('snapshot_benefits')
      .notNull()
      .default({})
      .$type<SubscriptionBenefits>(),
    /** Snapshot billing intervalu. */
    snapshotBillingInterval: varchar('snapshot_billing_interval', { length: 20 }).notNull(),
    snapshotPriceHellers: integer('snapshot_price_hellers').notNull(),
    soldBy: uuid('sold_by').references(() => users.id),
    note: text('note'),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => ({
    tenantIdx: index('customer_subscriptions_tenant_idx').on(table.tenantId),
    customerIdx: index('customer_subscriptions_customer_idx').on(table.customerId, table.status),
    stripeIdx: index('customer_subscriptions_stripe_idx').on(table.stripeSubscriptionId),
    periodEndIdx: index('customer_subscriptions_period_end_idx').on(
      table.currentPeriodEnd,
      table.status,
    ),
  }),
);

export type CustomerSubscription = typeof customerSubscriptions.$inferSelect;
export type NewCustomerSubscription = typeof customerSubscriptions.$inferInsert;

// ─── Subscription events (audit log + idempotence) ─────────────────────

export const subscriptionEvents = pgTable(
  'subscription_events',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    tenantId: uuid('tenant_id')
      .notNull()
      .references(() => tenants.id, { onDelete: 'cascade' }),
    /** Customer subscription, ktereho se event tyka. NULL pokud jeste neznam (early webhooks). */
    customerSubscriptionId: uuid('customer_subscription_id').references(
      () => customerSubscriptions.id,
      { onDelete: 'cascade' },
    ),
    /** Stripe event ID (evt_xxx) — pouziva se pro idempotence (UNIQUE). */
    stripeEventId: varchar('stripe_event_id', { length: 255 }).notNull(),
    /** Stripe event type (napr. 'invoice.payment_succeeded'). */
    eventType: varchar('event_type', { length: 100 }).notNull(),
    /** Raw payload pro audit / debugging. */
    payload: jsonb('payload').notNull().default({}),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => ({
    tenantIdx: index('subscription_events_tenant_idx').on(table.tenantId, table.createdAt),
    subIdx: index('subscription_events_sub_idx').on(table.customerSubscriptionId, table.createdAt),
    // Unique constraint na (tenantId, stripeEventId) zajistuje idempotenci webhooku
    uniqueEvent: unique('subscription_events_unique_stripe_event').on(
      table.tenantId,
      table.stripeEventId,
    ),
  }),
);

export type SubscriptionEvent = typeof subscriptionEvents.$inferSelect;
export type NewSubscriptionEvent = typeof subscriptionEvents.$inferInsert;
