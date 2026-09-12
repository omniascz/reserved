import {
  pgTable,
  uuid,
  varchar,
  text,
  integer,
  boolean,
  timestamp,
  index,
} from 'drizzle-orm/pg-core';
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

// Sprint 10.36 — věrnostní úrovně (tiery) + katalog odměn.
// Tier = nejvyšší úroveň, jejíž min_points <= celkově nasbírané body zákazníka.
export const loyaltyTiers = pgTable(
  'loyalty_tiers',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    tenantId: uuid('tenant_id')
      .notNull()
      .references(() => tenants.id, { onDelete: 'cascade' }),
    name: varchar('name', { length: 100 }).notNull(),
    minPoints: integer('min_points').notNull().default(0),
    perk: text('perk'),
    sortOrder: integer('sort_order').notNull().default(0),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => ({
    tenantIdx: index('loyalty_tiers_tenant_idx').on(table.tenantId),
  }),
);
export type LoyaltyTier = typeof loyaltyTiers.$inferSelect;

/** Druh odměny: % sleva / pevná sleva (haléře) / položka zdarma / vlastní. */
export const loyaltyRewardKinds = [
  'discount_percent',
  'discount_amount',
  'free_item',
  'custom',
] as const;
export type LoyaltyRewardKind = (typeof loyaltyRewardKinds)[number];

export const loyaltyRewards = pgTable(
  'loyalty_rewards',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    tenantId: uuid('tenant_id')
      .notNull()
      .references(() => tenants.id, { onDelete: 'cascade' }),
    name: varchar('name', { length: 200 }).notNull(),
    description: text('description'),
    pointsCost: integer('points_cost').notNull(),
    kind: varchar('kind', { length: 24 }).notNull().default('custom'),
    /** Hodnota dle druhu: procenta / haléře / 0 pro free_item/custom. */
    value: integer('value').notNull().default(0),
    isActive: boolean('is_active').notNull().default(true),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => ({
    tenantIdx: index('loyalty_rewards_tenant_idx').on(table.tenantId),
  }),
);
export type LoyaltyReward = typeof loyaltyRewards.$inferSelect;

export const loyaltyRewardRedemptions = pgTable(
  'loyalty_reward_redemptions',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    tenantId: uuid('tenant_id')
      .notNull()
      .references(() => tenants.id, { onDelete: 'cascade' }),
    customerId: uuid('customer_id').notNull(),
    rewardId: uuid('reward_id').notNull(),
    rewardName: varchar('reward_name', { length: 200 }).notNull(),
    pointsCost: integer('points_cost').notNull(),
    /** Kód k uplatnění u obsluhy. */
    code: varchar('code', { length: 32 }).notNull(),
    status: varchar('status', { length: 16 }).notNull().default('issued'),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
    usedAt: timestamp('used_at', { withTimezone: true }),
  },
  (table) => ({
    tenantIdx: index('loyalty_reward_redemptions_tenant_idx').on(table.tenantId),
    customerIdx: index('loyalty_reward_redemptions_customer_idx').on(
      table.tenantId,
      table.customerId,
    ),
  }),
);
export type LoyaltyRewardRedemption = typeof loyaltyRewardRedemptions.$inferSelect;
