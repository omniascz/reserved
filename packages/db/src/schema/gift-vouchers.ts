import {
  pgTable,
  uuid,
  varchar,
  text,
  integer,
  timestamp,
  index,
  uniqueIndex,
  check,
} from 'drizzle-orm/pg-core';
import { sql } from 'drizzle-orm';
import { tenants } from './tenants.js';

// Sprint 10.9 — dárkové poukazy. Poukaz = kód + hodnota (haléře). Lze uplatnit
// i částečně; remaining_value_hellers se snižuje (row-lock při uplatnění).

export const voucherStatuses = ['active', 'redeemed', 'cancelled'] as const;
export type VoucherStatus = (typeof voucherStatuses)[number];

export const giftVouchers = pgTable(
  'gift_vouchers',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    tenantId: uuid('tenant_id')
      .notNull()
      .references(() => tenants.id, { onDelete: 'cascade' }),
    /** Lidsky čitelný kód, unikátní v rámci tenanta. */
    code: varchar('code', { length: 32 }).notNull(),
    initialValueHellers: integer('initial_value_hellers').notNull(),
    remainingValueHellers: integer('remaining_value_hellers').notNull(),
    currency: varchar('currency', { length: 3 }).notNull().default('CZK'),
    status: varchar('status', { length: 32 }).notNull().default('active'),
    recipientName: varchar('recipient_name', { length: 200 }),
    recipientEmail: varchar('recipient_email', { length: 255 }),
    validUntil: timestamp('valid_until', { withTimezone: true }),
    note: text('note'),
    createdBy: varchar('created_by', { length: 64 }),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => ({
    codeUniq: uniqueIndex('gift_vouchers_code_uniq').on(table.tenantId, table.code),
    tenantIdx: index('gift_vouchers_tenant_idx').on(table.tenantId, table.status),
    remainingNonNegative: check(
      'gift_vouchers_remaining_nonneg',
      sql`${table.remainingValueHellers} >= 0`,
    ),
  }),
);

export type GiftVoucher = typeof giftVouchers.$inferSelect;
export type NewGiftVoucher = typeof giftVouchers.$inferInsert;

// Ledger uplatnění (audit + částečná uplatnění).
export const voucherRedemptions = pgTable(
  'voucher_redemptions',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    tenantId: uuid('tenant_id')
      .notNull()
      .references(() => tenants.id, { onDelete: 'cascade' }),
    voucherId: uuid('voucher_id')
      .notNull()
      .references(() => giftVouchers.id, { onDelete: 'cascade' }),
    amountHellers: integer('amount_hellers').notNull(),
    bookingId: uuid('booking_id'),
    note: text('note'),
    createdBy: varchar('created_by', { length: 64 }),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => ({
    voucherIdx: index('voucher_redemptions_voucher_idx').on(table.voucherId),
    tenantIdx: index('voucher_redemptions_tenant_idx').on(table.tenantId),
  }),
);

export type VoucherRedemption = typeof voucherRedemptions.$inferSelect;
export type NewVoucherRedemption = typeof voucherRedemptions.$inferInsert;
