import {
  pgTable,
  uuid,
  varchar,
  text,
  timestamp,
  integer,
  jsonb,
  index,
} from 'drizzle-orm/pg-core';
import { tenants } from './tenants.js';
import { bookings } from './bookings.js';

// Reference: reserved-docs/13e_db_schema_audit_rls_triggers.md
//
// booking_status_history — audit historie každé změny stavu rezervace.
// notifications — fronta odchozích emailů/SMS. Worker je pickne a pošle.

// ─── Booking status history ──────────────────────────────────────────────

export const bookingStatusHistory = pgTable(
  'booking_status_history',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    tenantId: uuid('tenant_id')
      .notNull()
      .references(() => tenants.id, { onDelete: 'cascade' }),
    bookingId: uuid('booking_id')
      .notNull()
      .references(() => bookings.id, { onDelete: 'cascade' }),
    fromStatus: varchar('from_status', { length: 32 }),
    toStatus: varchar('to_status', { length: 32 }).notNull(),
    /** Kdo provedl změnu: 'system' | 'customer' | UUID admin usera. */
    changedBy: varchar('changed_by', { length: 64 }).notNull(),
    /** Důvod nebo poznámka (např. "Klient nemohl přijít — nemoc"). */
    reason: text('reason'),
    /** Volitelné metadata (např. před přesunem starý čas). */
    metadata: jsonb('metadata').notNull().default({}),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => ({
    tenantIdx: index('booking_status_history_tenant_idx').on(table.tenantId),
    bookingIdx: index('booking_status_history_booking_idx').on(table.bookingId, table.createdAt),
  }),
);

export type BookingStatusHistory = typeof bookingStatusHistory.$inferSelect;
export type NewBookingStatusHistory = typeof bookingStatusHistory.$inferInsert;

// ─── Notification queue ──────────────────────────────────────────────────

export const notifications = pgTable(
  'notifications',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    tenantId: uuid('tenant_id')
      .notNull()
      .references(() => tenants.id, { onDelete: 'cascade' }),
    /** Kanál: 'email' | 'sms' | 'push'. */
    channel: varchar('channel', { length: 16 }).notNull(),
    /** Template kód: 'booking_confirmed' | 'booking_cancelled' | ... */
    templateCode: varchar('template_code', { length: 64 }).notNull(),
    /** Příjemce — pro email je to email adresa, pro SMS telefon. */
    recipient: varchar('recipient', { length: 255 }).notNull(),
    /** Volitelný subject (jen pro email). */
    subject: varchar('subject', { length: 500 }),
    /** Vyrenderované tělo zprávy. */
    body: text('body').notNull(),
    /** Reference: ID rezervace, customer ID, ... */
    relatedBookingId: uuid('related_booking_id').references(() => bookings.id, {
      onDelete: 'set null',
    }),
    /** Stav fronty: 'pending' | 'sent' | 'failed' | 'cancelled'. */
    status: varchar('status', { length: 32 }).notNull().default('pending'),
    /** Naplánovaný čas odeslání (default = teď). Pro plánované připomínky. */
    scheduledAt: timestamp('scheduled_at', { withTimezone: true }).notNull().defaultNow(),
    sentAt: timestamp('sent_at', { withTimezone: true }),
    /** Provider ID (Mailgun, Postmark, BulkGate) pro tracking delivery. */
    providerMessageId: varchar('provider_message_id', { length: 255 }),
    /** Počet pokusů o odeslání (worker retry). */
    attempts: integer('attempts').notNull().default(0),
    /** Chybová zpráva při posledním selhání. */
    lastError: text('last_error'),
    /** Volné metadata (vars pro re-render, tracking pixels apod.). */
    metadata: jsonb('metadata').notNull().default({}),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => ({
    tenantIdx: index('notifications_tenant_idx').on(table.tenantId),
    queueIdx: index('notifications_queue_idx').on(table.status, table.scheduledAt),
    bookingIdx: index('notifications_booking_idx').on(table.relatedBookingId),
  }),
);

export type Notification = typeof notifications.$inferSelect;
export type NewNotification = typeof notifications.$inferInsert;
