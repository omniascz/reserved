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
  uniqueIndex,
} from 'drizzle-orm/pg-core';
import { tenants } from './tenants.js';
import { customers } from './customers.js';
import { users } from './users.js';
import { bookings } from './bookings.js';
import { customerCreditPacks } from './credit-packs.js';

// Platby (sprint 3.2 Fáze A).
//
// 3 tabulky:
//   1. payment_methods — config: ktere methody ma tenant zapnute + credentials
//   2. payments — jednotlive zaznamy plateb
//   3. payment_events — audit log webhook udalosti (pro Fazi B)
//
// Methody:
//   - cash (hotovost) — manual recording
//   - card_terminal (terminál) — manual recording po platbe
//   - qr_bank (QR platba) — manual recording, system generuje QR kod
//   - stripe (Stripe) — automatic via API + webhook (Faze B)
//   - gopay (GoPay) — automatic via API + webhook (Faze B)

export const paymentMethods = pgTable(
  'payment_methods',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    tenantId: uuid('tenant_id')
      .notNull()
      .references(() => tenants.id, { onDelete: 'cascade' }),
    /** 'cash' | 'card_terminal' | 'qr_bank' | 'stripe' | 'gopay' */
    methodType: varchar('method_type', { length: 32 }).notNull(),
    /** Display name (volitelne, pro casovani UI). */
    displayName: varchar('display_name', { length: 100 }),
    /** Konfigurace specificka pro provider:
     *  cash/terminal: {}
     *  qr_bank: { iban, bic, accountName, qrFormat: 'spd'|'iban' }
     *  stripe: { publishableKey, secretKey (encrypted), webhookSecret (encrypted) }
     *  gopay: { goId, clientId, clientSecret (encrypted) }
     */
    config: jsonb('config').notNull().default({}),
    isEnabled: boolean('is_enabled').notNull().default(true),
    /** Razeni v UI. Nizsi = drive. */
    sortOrder: integer('sort_order').notNull().default(0),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => ({
    tenantTypeIdx: uniqueIndex('payment_methods_tenant_type_idx').on(
      table.tenantId,
      table.methodType,
    ),
    tenantIdx: index('payment_methods_tenant_idx').on(table.tenantId, table.isEnabled),
  }),
);

export type PaymentMethod = typeof paymentMethods.$inferSelect;
export type NewPaymentMethod = typeof paymentMethods.$inferInsert;

// ─── Payments (jednotlive zaznamy) ─────────────────────────────────

export const payments = pgTable(
  'payments',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    tenantId: uuid('tenant_id')
      .notNull()
      .references(() => tenants.id, { onDelete: 'cascade' }),
    /** Volitelne customer (anonymni platby moznou). */
    customerId: uuid('customer_id').references(() => customers.id, { onDelete: 'set null' }),
    /** Volitelne booking related. */
    bookingId: uuid('booking_id').references(() => bookings.id, { onDelete: 'set null' }),
    /** Volitelne credit pack allocation related (prodej balacku). */
    creditPackAllocationId: uuid('credit_pack_allocation_id').references(
      () => customerCreditPacks.id,
      { onDelete: 'set null' },
    ),
    /** Castka v halerich. */
    amountHellers: integer('amount_hellers').notNull(),
    currency: varchar('currency', { length: 3 }).notNull().default('CZK'),
    /** 'cash' | 'card_terminal' | 'qr_bank' | 'stripe' | 'gopay' */
    methodType: varchar('method_type', { length: 32 }).notNull(),
    /** 'pending' | 'succeeded' | 'failed' | 'refunded' | 'cancelled' */
    status: varchar('status', { length: 32 }).notNull().default('pending'),
    /** Pro online brany: externí transaction ID (pi_xxx pro Stripe, ord_xxx pro GoPay). */
    externalId: varchar('external_id', { length: 200 }),
    /** Description pro paragon / faktura. */
    description: text('description'),
    /** Pro QR/refund: odkaz na puvodni payment ID. */
    refundedFromPaymentId: uuid('refunded_from_payment_id'),
    /** Pro audit: kdo platbu zaznamenal (admin) / null pro automaticke. */
    recordedBy: uuid('recorded_by').references(() => users.id),
    /** Volitelne customer reference / variabilni symbol pro QR. */
    referenceCode: varchar('reference_code', { length: 100 }),
    /** Casy: kdy platba probehla skutecne (pro cash pri vybrat, pro online pri succeeded). */
    paidAt: timestamp('paid_at', { withTimezone: true }),
    failureReason: text('failure_reason'),
    metadata: jsonb('metadata').notNull().default({}),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => ({
    tenantIdx: index('payments_tenant_idx').on(table.tenantId, table.createdAt),
    customerIdx: index('payments_customer_idx').on(table.customerId, table.createdAt),
    bookingIdx: index('payments_booking_idx').on(table.bookingId),
    externalIdx: index('payments_external_idx').on(table.externalId),
    statusIdx: index('payments_status_idx').on(table.tenantId, table.status, table.createdAt),
  }),
);

export type Payment = typeof payments.$inferSelect;
export type NewPayment = typeof payments.$inferInsert;

// ─── Payment events (audit / webhook log) ──────────────────────────

export const paymentEvents = pgTable(
  'payment_events',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    tenantId: uuid('tenant_id')
      .notNull()
      .references(() => tenants.id, { onDelete: 'cascade' }),
    paymentId: uuid('payment_id').references(() => payments.id, { onDelete: 'cascade' }),
    /** 'created' | 'manual_marked' | 'stripe_webhook' | 'gopay_webhook' | 'refund' | 'cancel' */
    eventType: varchar('event_type', { length: 64 }).notNull(),
    /** Raw payload (webhook body, manual reason atd.). */
    payload: jsonb('payload').notNull().default({}),
    /** Pro webhooks: verify status. */
    verified: boolean('verified').notNull().default(true),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => ({
    tenantIdx: index('payment_events_tenant_idx').on(table.tenantId, table.createdAt),
    paymentIdx: index('payment_events_payment_idx').on(table.paymentId, table.createdAt),
    typeIdx: index('payment_events_type_idx').on(table.eventType, table.createdAt),
  }),
);

export type PaymentEvent = typeof paymentEvents.$inferSelect;
export type NewPaymentEvent = typeof paymentEvents.$inferInsert;
