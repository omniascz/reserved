import { pgTable, uuid, varchar, integer, timestamp, index } from 'drizzle-orm/pg-core';
import { tenants } from './tenants.js';
import { classSessions } from './class-sessions.js';

// Sprint 10.5 — pořadník (waitlist) na plné skupinové lekce.
// Když je lekce plná, klient se zařadí do pořadníku. Při uvolnění místa
// (odhlášení účastníka) se první čekající automaticky povýší na rezervaci.

export const waitlistStatuses = ['waiting', 'promoted', 'cancelled'] as const;
export type WaitlistStatus = (typeof waitlistStatuses)[number];

export const classSessionWaitlist = pgTable(
  'class_session_waitlist',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    tenantId: uuid('tenant_id')
      .notNull()
      .references(() => tenants.id, { onDelete: 'cascade' }),
    sessionId: uuid('session_id')
      .notNull()
      .references(() => classSessions.id, { onDelete: 'cascade' }),
    customerId: uuid('customer_id'),
    customerName: varchar('customer_name', { length: 200 }).notNull(),
    customerEmail: varchar('customer_email', { length: 255 }).notNull(),
    customerPhone: varchar('customer_phone', { length: 32 }),
    /** Pořadí v pořadníku (1 = první na řadě). */
    position: integer('position').notNull(),
    status: varchar('status', { length: 32 }).notNull().default('waiting'),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => ({
    tenantIdx: index('class_session_waitlist_tenant_idx').on(table.tenantId),
    sessionIdx: index('class_session_waitlist_session_idx').on(table.sessionId, table.position),
  }),
);

export type ClassSessionWaitlistEntry = typeof classSessionWaitlist.$inferSelect;
export type NewClassSessionWaitlistEntry = typeof classSessionWaitlist.$inferInsert;
