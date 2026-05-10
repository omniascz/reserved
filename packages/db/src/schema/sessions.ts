import { pgTable, uuid, varchar, text, timestamp, boolean, index } from 'drizzle-orm/pg-core';
import { tenants } from './tenants.js';
import { users } from './users.js';

// Reference: reserved-docs/13b_db_schema_users_customers.md
//
// user_sessions: refresh token rotation, device tracking, multi-session logout.
// email_verifications: token-based email confirmation a password reset.

export const userSessions = pgTable(
  'user_sessions',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    tenantId: uuid('tenant_id')
      .notNull()
      .references(() => tenants.id, { onDelete: 'cascade' }),
    userId: uuid('user_id')
      .notNull()
      .references(() => users.id, { onDelete: 'cascade' }),
    /** UUID propojené s `family` claim refresh tokenu — detekce reuse. */
    family: uuid('family').notNull(),
    /** Aktuální `jti` refresh tokenu — invalidace starých při rotaci. */
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
    tenantIdx: index('user_sessions_tenant_idx').on(table.tenantId),
    userIdx: index('user_sessions_user_idx').on(table.userId),
    familyIdx: index('user_sessions_family_idx').on(table.family),
    expiryIdx: index('user_sessions_expiry_idx').on(table.expiresAt),
  }),
);

export type UserSession = typeof userSessions.$inferSelect;
export type NewUserSession = typeof userSessions.$inferInsert;

// ---------------------------------------------------------------------------

export const emailVerifications = pgTable(
  'email_verifications',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    tenantId: uuid('tenant_id')
      .notNull()
      .references(() => tenants.id, { onDelete: 'cascade' }),
    userId: uuid('user_id')
      .notNull()
      .references(() => users.id, { onDelete: 'cascade' }),
    /** Type of verification: 'email_confirm' | 'password_reset' | 'email_change'. */
    purpose: varchar('purpose', { length: 32 }).notNull(),
    /** Hash tokenu — surový token nikdy neukládat. */
    tokenHash: varchar('token_hash', { length: 128 }).notNull(),
    /** Pro email_change purpose: nový email k ověření. */
    newEmail: varchar('new_email', { length: 255 }),
    consumedAt: timestamp('consumed_at', { withTimezone: true }),
    expiresAt: timestamp('expires_at', { withTimezone: true }).notNull(),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => ({
    tenantIdx: index('email_verifications_tenant_idx').on(table.tenantId),
    userPurposeIdx: index('email_verifications_user_purpose_idx').on(table.userId, table.purpose),
    tokenHashIdx: index('email_verifications_token_hash_idx').on(table.tokenHash),
  }),
);

export type EmailVerification = typeof emailVerifications.$inferSelect;
export type NewEmailVerification = typeof emailVerifications.$inferInsert;
