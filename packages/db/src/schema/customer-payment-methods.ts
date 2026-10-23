import { pgTable, uuid, varchar, integer, timestamp, index, unique } from 'drizzle-orm/pg-core';
import { tenants } from './tenants.js';
import { customers } from './customers.js';

// Uložená karta zákazníka (P4 — strh storno / no-show poplatku bez odkazu).
//
// Vzor cal.com (calcom/cal.diy@0f19cc4 packages/app-store/stripepayment —
// `collectCard` + `chargeCard`, MIT): zákazník kartu jednou uloží přes Stripe
// (Checkout v režimu „setup"), a když pak nepřijde nebo zruší pozdě, poplatek
// se strhne bez jeho účasti (off-session PaymentIntent).
//
// Číslo karty u nás NIKDY není — jen odkazy do Stripe (customer + payment
// method) a údaje k zobrazení (značka, poslední 4 číslice, platnost).

export const customerPaymentMethodStatuses = ['active', 'removed'] as const;

export const customerPaymentMethods = pgTable(
  'customer_payment_methods',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    tenantId: uuid('tenant_id')
      .notNull()
      .references(() => tenants.id, { onDelete: 'cascade' }),
    customerId: uuid('customer_id')
      .notNull()
      .references(() => customers.id, { onDelete: 'cascade' }),
    /** Brána: zatím jen 'stripe'. */
    provider: varchar('provider', { length: 16 }).notNull(),
    /** Stripe Customer (cus_…), ke kterému je karta připojená. */
    externalCustomerId: varchar('external_customer_id', { length: 255 }).notNull(),
    /** Stripe PaymentMethod (pm_…). */
    externalPaymentMethodId: varchar('external_payment_method_id', { length: 255 }).notNull(),
    brand: varchar('brand', { length: 32 }),
    last4: varchar('last4', { length: 4 }),
    expMonth: integer('exp_month'),
    expYear: integer('exp_year'),
    /** 'active' | 'removed' (odebraná zákazníkem/adminem nebo při výmazu GDPR). */
    status: varchar('status', { length: 16 }).notNull().default('active'),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
    removedAt: timestamp('removed_at', { withTimezone: true }),
  },
  (table) => ({
    customerIdx: index('customer_payment_methods_customer_idx').on(
      table.tenantId,
      table.customerId,
      table.status,
    ),
    externalUniq: unique('customer_payment_methods_external_uniq').on(
      table.tenantId,
      table.provider,
      table.externalPaymentMethodId,
    ),
  }),
);

export type CustomerPaymentMethod = typeof customerPaymentMethods.$inferSelect;
export type NewCustomerPaymentMethod = typeof customerPaymentMethods.$inferInsert;
