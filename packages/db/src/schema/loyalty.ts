import { pgTable, uuid, varchar, text, integer, timestamp, index } from 'drizzle-orm/pg-core';
import { tenants } from './tenants.js';

// Sprint 10.8 — věrnostní body. Ledger transakcí; zůstatek = SUM(points) na klienta.
// Kladné = připsání (earn_booking), záporné = uplatnění (redeem). admin_adjust = ruční ±.

export const loyaltyTxTypes = ['earn_booking', 'redeem', 'admin_adjust', 'referral'] as const;
export type LoyaltyTxType = (typeof loyaltyTxTypes)[number];

export const loyaltyTransactions = pgTable(
  'loyalty_transactions',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    tenantId: uuid('tenant_id')
      .notNull()
      .references(() => tenants.id, { onDelete: 'cascade' }),
    customerId: uuid('customer_id').notNull(),
    /** Body: kladné = připsání, záporné = uplatnění. */
    points: integer('points').notNull(),
    type: varchar('type', { length: 32 }).notNull(),
    /** Rezervace, za kterou se body připsaly (u earn_booking). */
    bookingId: uuid('booking_id'),
    note: text('note'),
    createdBy: varchar('created_by', { length: 64 }),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => ({
    tenantIdx: index('loyalty_transactions_tenant_idx').on(table.tenantId),
    customerIdx: index('loyalty_transactions_customer_idx').on(table.tenantId, table.customerId),
  }),
);

export type LoyaltyTransaction = typeof loyaltyTransactions.$inferSelect;
export type NewLoyaltyTransaction = typeof loyaltyTransactions.$inferInsert;
