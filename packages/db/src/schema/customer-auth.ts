import { pgTable, uuid, varchar, text, timestamp, boolean, index } from 'drizzle-orm/pg-core';
import { tenants } from './tenants.js';
import { customers } from './customers.js';

// Portal auth (sprint 2.3):
//   - customer_sessions:    refresh token rotation pro portal zákazníky
//   - customer_magic_links: one-time tokeny pro magic-link login
//
// Paraleluje s user_sessions / email_verifications pro admin uživatele.

export const customerSessions = pgTable(
  'customer_sessions',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    tenantId: uuid('tenant_id')
      .notNull()
      .references(() => tenants.id, { onDelete: 'cascade' }),
    customerId: uuid('customer_id')
      .notNull()
      .references(() => customers.id, { onDelete: 'cascade' }),
    family: uuid('family').notNull(),
    refreshTokenJti: uuid('refresh_token_jti').notNull(),
    userAgent: text('user_agent'),
    ipAddress: varchar('ip_address', { length: 45 }),
    isRevoked: boolean('is_revoked').notNull().default(false),
    revokedAt: timestamp('revoked_at', { withTimezone: true }),
    revokedReason: varchar('revoked_reason', { length: 50 }),
    expiresAt: timestamp('expires_at', { withTimezone: true }).notNull(),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
    lastUsedAt: timestamp('last_used_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => ({
    tenantIdx: index('customer_sessions_tenant_idx').on(table.tenantId),
    customerIdx: index('customer_sessions_customer_idx').on(table.customerId),
    familyIdx: index('customer_sessions_family_idx').on(table.family),
    expiryIdx: index('customer_sessions_expiry_idx').on(table.expiresAt),
  }),
);

export type CustomerSession = typeof customerSessions.$inferSelect;
export type NewCustomerSession = typeof customerSessions.$inferInsert;

// ---------------------------------------------------------------------------

export const customerMagicLinks = pgTable(
  'customer_magic_links',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    tenantId: uuid('tenant_id')
      .notNull()
      .references(() => tenants.id, { onDelete: 'cascade' }),
    /** NULL pokud zákazník ještě neexistuje — vytvoříme ho při verify. */
    customerId: uuid('customer_id').references(() => customers.id, { onDelete: 'cascade' }),
    /** E-mail, kam token přišel — slouží i pro lookup customera při verify. */
    email: varchar('email', { length: 255 }).notNull(),
    /** SHA-256 hash tokenu — surový token jen v e-mailu. */
    tokenHash: varchar('token_hash', { length: 128 }).notNull(),
    /** 'login' | 'set_password' (pro reset hesla). */
    purpose: varchar('purpose', { length: 32 }).notNull().default('login'),
    consumedAt: timestamp('consumed_at', { withTimezone: true }),
    expiresAt: timestamp('expires_at', { withTimezone: true }).notNull(),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
    /** Pro rate limiting — IP/user-agent kdo žádal. */
    requestedIp: varchar('requested_ip', { length: 45 }),
    requestedUa: text('requested_ua'),
  },
  (table) => ({
    tenantIdx: index('customer_magic_links_tenant_idx').on(table.tenantId),
    emailIdx: index('customer_magic_links_email_idx').on(table.tenantId, table.email),
    tokenHashIdx: index('customer_magic_links_token_hash_idx').on(table.tokenHash),
    expiryIdx: index('customer_magic_links_expiry_idx').on(table.expiresAt),
  }),
);

export type CustomerMagicLink = typeof customerMagicLinks.$inferSelect;
export type NewCustomerMagicLink = typeof customerMagicLinks.$inferInsert;
