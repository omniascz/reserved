import {
  pgTable,
  uuid,
  varchar,
  text,
  timestamp,
  boolean,
  index,
  uniqueIndex,
} from 'drizzle-orm/pg-core';
import { tenants } from './tenants';

// Reference: reserved-docs/13b_db_schema_users_customers.md
//
// User = administrativní uživatel tenanta (owner, manager, employee, receptionist).
// Customers (zákazníci tenanta) jsou v separátní tabulce — viz schema/customers.ts.

export const users = pgTable(
  'users',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    tenantId: uuid('tenant_id')
      .notNull()
      .references(() => tenants.id, { onDelete: 'cascade' }),
    email: varchar('email', { length: 255 }).notNull(),
    passwordHash: varchar('password_hash', { length: 255 }),
    firstName: varchar('first_name', { length: 100 }).notNull(),
    lastName: varchar('last_name', { length: 100 }).notNull(),
    phone: varchar('phone', { length: 32 }),
    role: varchar('role', { length: 32 }).notNull().default('employee'),
    customRoleId: uuid('custom_role_id'),
    emailVerifiedAt: timestamp('email_verified_at', { withTimezone: true }),
    twoFactorSecret: text('two_factor_secret'),
    twoFactorEnabled: boolean('two_factor_enabled').notNull().default(false),
    lastLoginAt: timestamp('last_login_at', { withTimezone: true }),
    isActive: boolean('is_active').notNull().default(true),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
    deletedAt: timestamp('deleted_at', { withTimezone: true }),
  },
  (table) => ({
    tenantEmailIdx: uniqueIndex('users_tenant_email_idx').on(table.tenantId, table.email),
    tenantRoleIdx: index('users_tenant_role_idx').on(table.tenantId, table.role),
  }),
);

export type User = typeof users.$inferSelect;
export type NewUser = typeof users.$inferInsert;

export const userRoles = ['owner', 'manager', 'employee', 'receptionist'] as const;
export type UserRole = (typeof userRoles)[number];
