import { pgTable, uuid, varchar, timestamp, index } from 'drizzle-orm/pg-core';
import { tenants } from './tenants.js';

// Náhrady (make-up credits, sprint 10.40) — systémové řešení zameškaných lekcí.
// Vznikne, když studio zruší lekci nebo klient zruší v okně náhrad; klient si
// pak může zdarma rezervovat jinou lekci. Žádné dnešní řešení to nedělá systémově.

export const makeupReasons = ['studio_cancelled', 'client_cancelled', 'admin_granted'] as const;
export type MakeupReason = (typeof makeupReasons)[number];

export const makeupCredits = pgTable(
  'makeup_credits',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    tenantId: uuid('tenant_id')
      .notNull()
      .references(() => tenants.id, { onDelete: 'cascade' }),
    customerId: uuid('customer_id'),
    customerName: varchar('customer_name', { length: 200 }).notNull(),
    customerEmail: varchar('customer_email', { length: 255 }).notNull(),
    reason: varchar('reason', { length: 24 }).notNull().default('admin_granted'),
    /** Zameškaná/zrušená rezervace, ze které náhrada vznikla. */
    originBookingId: uuid('origin_booking_id'),
    status: varchar('status', { length: 16 }).notNull().default('available'),
    validUntil: timestamp('valid_until', { withTimezone: true }),
    usedBookingId: uuid('used_booking_id'),
    usedAt: timestamp('used_at', { withTimezone: true }),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => ({
    tenantIdx: index('makeup_credits_tenant_idx').on(table.tenantId),
    customerIdx: index('makeup_credits_customer_idx').on(
      table.tenantId,
      table.customerEmail,
      table.status,
    ),
  }),
);
export type MakeupCredit = typeof makeupCredits.$inferSelect;
