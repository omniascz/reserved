import {
  pgTable,
  uuid,
  varchar,
  timestamp,
  jsonb,
  integer,
  index,
  uniqueIndex,
} from 'drizzle-orm/pg-core';
import { tenants } from './tenants.js';
import { users } from './users.js';

// API klíče pro programatický přístup tenant businessů ke svým datům přes
// /external/v1/* endpointy. Klíč má formát "rsk_<32 hex chars>" (Reserved
// Secret Key). V DB se ukládá jen SHA-256 hash + 8 znaků prefixu pro UI.
//
// Scopes (pole stringů) určují, co klíč může:
//   - "bookings:read" / "bookings:write"
//   - "customers:read" / "customers:write"
//   - "services:read"  (jen čtení, write zustava jen pres admin UI)
//   - "employees:read"
//   - "availability:read"
//   - "*" = full access (default pro admin-created keys)

export const apiKeys = pgTable(
  'api_keys',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    tenantId: uuid('tenant_id')
      .notNull()
      .references(() => tenants.id, { onDelete: 'cascade' }),
    name: varchar('name', { length: 120 }).notNull(),
    /** SHA-256 hash plného klíče (hex 64 znaků). */
    keyHash: varchar('key_hash', { length: 64 }).notNull(),
    /** Prvních 8 znaků klíče po prefixu pro UI ("rsk_abc12345..."). */
    keyPrefix: varchar('key_prefix', { length: 16 }).notNull(),
    /** Pole scope stringů (např. ["bookings:read","customers:write"]) nebo ["*"]. */
    scopes: jsonb('scopes').notNull().default(['*']),
    /** Volitelná expirace. NULL = neomezeně. */
    expiresAt: timestamp('expires_at', { withTimezone: true }),
    /** Kdy byl klíč naposled použit (pro detekci nepoužívaných klíčů). */
    lastUsedAt: timestamp('last_used_at', { withTimezone: true }),
    /** Kolikrát byl klíč použit (orientační, není atomicky přesné). */
    usageCount: integer('usage_count').notNull().default(0),
    /** Soft delete přes revoked_at. */
    revokedAt: timestamp('revoked_at', { withTimezone: true }),
    createdBy: uuid('created_by').references(() => users.id, { onDelete: 'set null' }),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => ({
    hashIdx: uniqueIndex('api_keys_hash_idx').on(table.keyHash),
    tenantIdx: index('api_keys_tenant_idx').on(table.tenantId),
  }),
);

export type ApiKey = typeof apiKeys.$inferSelect;
export type NewApiKey = typeof apiKeys.$inferInsert;

export const API_KEY_SCOPES = [
  'bookings:read',
  'bookings:write',
  'customers:read',
  'customers:write',
  'services:read',
  'employees:read',
  'availability:read',
  'branches:read',
  'access:validate',
] as const;

export type ApiKeyScope = (typeof API_KEY_SCOPES)[number] | '*';
