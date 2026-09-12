import { pgTable, uuid, varchar, boolean, timestamp, index } from 'drizzle-orm/pg-core';
import { tenants } from './tenants.js';

// Platby koncových klientů — propojení účtu tenanta (Stripe Connect Standard).
// Peníze + zálohy chodí přímo tenantovi; platforma nebere transakční fee (0 %).
// (sprint 10.29 — P1)

export const paymentConnectionStatuses = ['pending', 'active', 'disabled'] as const;

export const paymentConnections = pgTable(
  'payment_connections',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    tenantId: uuid('tenant_id')
      .notNull()
      .references(() => tenants.id, { onDelete: 'cascade' }),
    /** 'stripe' | 'gopay' | 'mock'. */
    provider: varchar('provider', { length: 16 }).notNull(),
    /** ID propojeného účtu u providera (Stripe acct_...). */
    accountId: varchar('account_id', { length: 255 }),
    status: varchar('status', { length: 16 }).notNull().default('pending'),
    /** Provider potvrdil, že účet může přijímat platby. */
    chargesEnabled: boolean('charges_enabled').notNull().default(false),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => ({
    tenantProviderIdx: index('payment_connections_tenant_provider_idx').on(
      table.tenantId,
      table.provider,
    ),
  }),
);
export type PaymentConnection = typeof paymentConnections.$inferSelect;
