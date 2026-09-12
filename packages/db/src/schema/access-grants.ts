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
import { branches } from './branches.js';

// Access control (sprint 10.32): vstup bez personálu.
// Klient dostane ke své rezervaci (slot) nebo permanentce/členství (open gym)
// vstupní KÓD. Zámek/turniket ho ověří přes external API (access:validate).
// access_grants = vydaný kód s platností a limitem použití.
// access_events = log každého pokusu o vstup (granted/denied).

/** booking = kód na konkrétní slot; membership = open gym / permanentka na období. */
export const accessGrantKinds = ['booking', 'membership', 'open_gym'] as const;
export type AccessGrantKind = (typeof accessGrantKinds)[number];

export const accessGrants = pgTable(
  'access_grants',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    tenantId: uuid('tenant_id')
      .notNull()
      .references(() => tenants.id, { onDelete: 'cascade' }),
    branchId: uuid('branch_id').references(() => branches.id, { onDelete: 'set null' }),
    /** Volitelná vazba na rezervaci (kind='booking'). */
    bookingId: uuid('booking_id'),
    customerId: uuid('customer_id'),
    customerName: varchar('customer_name', { length: 200 }),
    /** Vstupní kód (unikátní v rámci tenanta). */
    code: varchar('code', { length: 32 }).notNull(),
    kind: varchar('kind', { length: 16 }).notNull().default('booking'),
    validFrom: timestamp('valid_from', { withTimezone: true }).notNull(),
    validUntil: timestamp('valid_until', { withTimezone: true }).notNull(),
    /** Max počet vstupů; 0 = neomezeně (open gym v rámci platnosti). */
    maxUses: integer('max_uses').notNull().default(1),
    usesCount: integer('uses_count').notNull().default(0),
    status: varchar('status', { length: 16 }).notNull().default('active'),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => ({
    tenantIdx: index('access_grants_tenant_idx').on(table.tenantId),
    codeUnique: uniqueIndex('access_grants_tenant_code_unique').on(table.tenantId, table.code),
  }),
);
export type AccessGrant = typeof accessGrants.$inferSelect;

export const accessEvents = pgTable(
  'access_events',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    tenantId: uuid('tenant_id')
      .notNull()
      .references(() => tenants.id, { onDelete: 'cascade' }),
    grantId: uuid('grant_id'),
    code: varchar('code', { length: 32 }).notNull(),
    branchId: uuid('branch_id'),
    result: varchar('result', { length: 16 }).notNull(),
    reason: varchar('reason', { length: 64 }),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => ({
    tenantIdx: index('access_events_tenant_idx').on(table.tenantId),
  }),
);
export type AccessEvent = typeof accessEvents.$inferSelect;
