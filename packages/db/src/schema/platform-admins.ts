import {
  pgTable,
  uuid,
  varchar,
  timestamp,
  boolean,
  jsonb,
  index,
  uniqueIndex,
} from 'drizzle-orm/pg-core';

// Platform admin = provozovatel SaaSu (Reserved), nikoli admin tenanta.
// Tato vrstva existuje mimo tenant scope: vidi vsechny tenanty, muze je
// suspendovat, prodluzovat trial, impersonovat owner uctu pro support.
//
// Reference: reserved-docs/03_architektura_systemu.md (Platform admin API)

export const platformAdmins = pgTable(
  'platform_admins',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    email: varchar('email', { length: 255 }).notNull(),
    passwordHash: varchar('password_hash', { length: 255 }).notNull(),
    firstName: varchar('first_name', { length: 100 }).notNull(),
    lastName: varchar('last_name', { length: 100 }).notNull(),
    isActive: boolean('is_active').notNull().default(true),
    lastLoginAt: timestamp('last_login_at', { withTimezone: true }),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => ({
    emailIdx: uniqueIndex('platform_admins_email_idx').on(table.email),
  }),
);

export type PlatformAdmin = typeof platformAdmins.$inferSelect;
export type NewPlatformAdmin = typeof platformAdmins.$inferInsert;

// Audit log akci master admina. KAZDA destruktivni/zmenova akce je sem zapsana.
export const platformAdminActions = pgTable(
  'platform_admin_actions',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    adminId: uuid('admin_id')
      .notNull()
      .references(() => platformAdmins.id, { onDelete: 'restrict' }),
    action: varchar('action', { length: 64 }).notNull(),
    targetType: varchar('target_type', { length: 32 }).notNull(),
    targetId: uuid('target_id').notNull(),
    payload: jsonb('payload').notNull().default({}),
    ipAddress: varchar('ip_address', { length: 64 }),
    userAgent: varchar('user_agent', { length: 255 }),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => ({
    adminIdx: index('platform_admin_actions_admin_idx').on(table.adminId, table.createdAt),
    targetIdx: index('platform_admin_actions_target_idx').on(
      table.targetType,
      table.targetId,
      table.createdAt,
    ),
    actionIdx: index('platform_admin_actions_action_idx').on(table.action, table.createdAt),
  }),
);

export type PlatformAdminAction = typeof platformAdminActions.$inferSelect;
export type NewPlatformAdminAction = typeof platformAdminActions.$inferInsert;

export const platformActionTypes = [
  'login',
  'logout',
  'password_changed',
  'tenant_suspended',
  'tenant_reactivated',
  'tenant_trial_extended',
  'tenant_plan_changed',
  'tenant_soft_deleted',
  'tenant_impersonated',
] as const;
export type PlatformActionType = (typeof platformActionTypes)[number];

// Refresh tokeny pro platform admin sessions (oddelene od user_sessions).
export const platformAdminSessions = pgTable(
  'platform_admin_sessions',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    adminId: uuid('admin_id')
      .notNull()
      .references(() => platformAdmins.id, { onDelete: 'cascade' }),
    refreshTokenHash: varchar('refresh_token_hash', { length: 255 }).notNull(),
    expiresAt: timestamp('expires_at', { withTimezone: true }).notNull(),
    revokedAt: timestamp('revoked_at', { withTimezone: true }),
    ipAddress: varchar('ip_address', { length: 64 }),
    userAgent: varchar('user_agent', { length: 255 }),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => ({
    tokenIdx: uniqueIndex('platform_admin_sessions_token_idx').on(table.refreshTokenHash),
    adminIdx: index('platform_admin_sessions_admin_idx').on(table.adminId),
  }),
);

export type PlatformAdminSession = typeof platformAdminSessions.$inferSelect;
export type NewPlatformAdminSession = typeof platformAdminSessions.$inferInsert;
