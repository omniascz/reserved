import {
  pgTable,
  uuid,
  varchar,
  integer,
  timestamp,
  index,
  uniqueIndex,
} from 'drizzle-orm/pg-core';
import { tenants } from './tenants.js';

// Referral / doporučovací program (sprint 10.35).
// Každý zákazník má svůj referral kód. Když ho uplatní nový zákazník, oba dostanou
// věrnostní body. referral_codes = kód per zákazník; referral_redemptions = uplatnění.

export const referralCodes = pgTable(
  'referral_codes',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    tenantId: uuid('tenant_id')
      .notNull()
      .references(() => tenants.id, { onDelete: 'cascade' }),
    customerId: uuid('customer_id').notNull(),
    code: varchar('code', { length: 32 }).notNull(),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => ({
    tenantIdx: index('referral_codes_tenant_idx').on(table.tenantId),
    customerUniq: uniqueIndex('referral_codes_customer_uniq').on(table.tenantId, table.customerId),
    codeUniq: uniqueIndex('referral_codes_code_uniq').on(table.tenantId, table.code),
  }),
);
export type ReferralCode = typeof referralCodes.$inferSelect;

export const referralRedemptions = pgTable(
  'referral_redemptions',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    tenantId: uuid('tenant_id')
      .notNull()
      .references(() => tenants.id, { onDelete: 'cascade' }),
    codeId: uuid('code_id').notNull(),
    referrerCustomerId: uuid('referrer_customer_id').notNull(),
    refereeEmail: varchar('referee_email', { length: 255 }).notNull(),
    refereeCustomerId: uuid('referee_customer_id'),
    referrerPoints: integer('referrer_points').notNull().default(0),
    refereePoints: integer('referee_points').notNull().default(0),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => ({
    tenantIdx: index('referral_redemptions_tenant_idx').on(table.tenantId),
    // Jeden e-mail uplatní doporučení v rámci tenanta jen jednou.
    refereeUniq: uniqueIndex('referral_redemptions_referee_uniq').on(
      table.tenantId,
      table.refereeEmail,
    ),
  }),
);
export type ReferralRedemption = typeof referralRedemptions.$inferSelect;
