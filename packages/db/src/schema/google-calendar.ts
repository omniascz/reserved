import {
  pgTable,
  uuid,
  varchar,
  text,
  timestamp,
  boolean,
  index,
  unique,
} from 'drizzle-orm/pg-core';
import { tenants } from './tenants.js';
import { employees } from './employees.js';
import { bookings } from './bookings.js';

// Google Calendar integrace (sprint 3.3 fáze C1).
//
// Per-employee OAuth napojeni na Google. Zamestnanec si propoji svuj
// Google ucet -> Reserved rezervace se syncuji do jeho Google Calendare.
//
// Tabulky:
//   1. google_calendar_connections — refresh_token + oauth metadata per employee
//   2. google_calendar_event_links — mapovani booking_id <-> google_event_id
//
// Cely modul je gated feature flagem 'integrations:google_calendar'.

// ─── Connection (per employee) ─────────────────────────────────────────

export const googleCalendarConnections = pgTable(
  'google_calendar_connections',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    tenantId: uuid('tenant_id')
      .notNull()
      .references(() => tenants.id, { onDelete: 'cascade' }),
    employeeId: uuid('employee_id')
      .notNull()
      .references(() => employees.id, { onDelete: 'cascade' }),
    /**
     * Refresh token — long-lived, pouzivame pro ziskani novych access tokenu.
     * TODO: production by mel byt encrypted at-rest (column encryption nebo KMS).
     * Zatim spolehame na RLS + DB-level encryption.
     */
    refreshToken: text('refresh_token').notNull(),
    /** Aktualni access token + expiry; refresh-ujeme pred kazdym pouzitim pokud expired. */
    accessToken: text('access_token'),
    accessTokenExpiresAt: timestamp('access_token_expires_at', { withTimezone: true }),
    /** Email Google uctu (pro UI zobrazeni). */
    googleEmail: varchar('google_email', { length: 255 }),
    /** Calendar ID, do ktereho posilame eventy. 'primary' = hlavni kalendar. */
    calendarId: varchar('calendar_id', { length: 255 }).notNull().default('primary'),
    /** Pokud false, sync je docasne pozastaven (napr. po opakovanych chybach). */
    isActive: boolean('is_active').notNull().default(true),
    /** Inbound sync (G -> R): pokud true, eventy z Google se kopiruji jako bloky. */
    inboundSyncEnabled: boolean('inbound_sync_enabled').notNull().default(false),
    /** Cas posledniho inbound syncu. */
    lastInboundSyncAt: timestamp('last_inbound_sync_at', { withTimezone: true }),
    /** Posledni sync timestamp + posledni chyba pro debugging. */
    lastSyncedAt: timestamp('last_synced_at', { withTimezone: true }),
    lastSyncError: text('last_sync_error'),
    consecutiveErrors: text('consecutive_errors').notNull().default('0'),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
    revokedAt: timestamp('revoked_at', { withTimezone: true }),
  },
  (table) => ({
    tenantIdx: index('google_calendar_connections_tenant_idx').on(table.tenantId),
    employeeIdx: index('google_calendar_connections_employee_idx').on(table.employeeId),
    // Pouze jedno aktivni connection per employee
    uniqueActive: unique('google_calendar_connections_employee_unique').on(
      table.employeeId,
      table.revokedAt,
    ),
  }),
);

export type GoogleCalendarConnection = typeof googleCalendarConnections.$inferSelect;
export type NewGoogleCalendarConnection = typeof googleCalendarConnections.$inferInsert;

// ─── Event mapping (booking <-> google event) ──────────────────────────

export const googleCalendarEventLinks = pgTable(
  'google_calendar_event_links',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    tenantId: uuid('tenant_id')
      .notNull()
      .references(() => tenants.id, { onDelete: 'cascade' }),
    connectionId: uuid('connection_id')
      .notNull()
      .references(() => googleCalendarConnections.id, { onDelete: 'cascade' }),
    bookingId: uuid('booking_id')
      .notNull()
      .references(() => bookings.id, { onDelete: 'cascade' }),
    /** Google event ID (z odpovedi gcal.events.insert). */
    googleEventId: varchar('google_event_id', { length: 1024 }).notNull(),
    /** Datum posledni synchronizace pro detekci stale eventu. */
    lastSyncedAt: timestamp('last_synced_at', { withTimezone: true }).notNull().defaultNow(),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => ({
    tenantIdx: index('google_calendar_event_links_tenant_idx').on(table.tenantId),
    bookingIdx: index('google_calendar_event_links_booking_idx').on(table.bookingId),
    // Jeden booking = jeden link (per connection)
    uniqueBooking: unique('google_calendar_event_links_booking_unique').on(
      table.connectionId,
      table.bookingId,
    ),
  }),
);

export type GoogleCalendarEventLink = typeof googleCalendarEventLinks.$inferSelect;
export type NewGoogleCalendarEventLink = typeof googleCalendarEventLinks.$inferInsert;

// ─── Inbound events (sprint 3.3 fáze C2: Google -> Reserved) ───────────
//
// Eventy v Google kalendari, ktere NEvznikly v Reserved, se synchronizuji
// jako availability_blocks (aby se misto nedalo prebookovat). Tato tabulka
// mapuje google_event_id <-> block_id pro detekci zmen/smazani pri dalsim
// syncu.

export const googleCalendarInboundEvents = pgTable(
  'google_calendar_inbound_events',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    tenantId: uuid('tenant_id')
      .notNull()
      .references(() => tenants.id, { onDelete: 'cascade' }),
    connectionId: uuid('connection_id')
      .notNull()
      .references(() => googleCalendarConnections.id, { onDelete: 'cascade' }),
    /** Google event ID (z eventu, ktery jsme NEvytvoreli my). */
    googleEventId: varchar('google_event_id', { length: 1024 }).notNull(),
    /** Block, ktery jsme vytvorili jako odraz tohoto eventu. */
    blockId: uuid('block_id').notNull(),
    /** Posledni hash obsahu (start+end+summary) pro detekci zmen. */
    contentHash: varchar('content_hash', { length: 64 }).notNull(),
    /** Posledni sync timestamp. */
    lastSyncedAt: timestamp('last_synced_at', { withTimezone: true }).notNull().defaultNow(),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => ({
    tenantIdx: index('google_calendar_inbound_events_tenant_idx').on(table.tenantId),
    connectionIdx: index('google_calendar_inbound_events_connection_idx').on(table.connectionId),
    blockIdx: index('google_calendar_inbound_events_block_idx').on(table.blockId),
    uniqueGoogleEvent: unique('google_calendar_inbound_events_unique').on(
      table.connectionId,
      table.googleEventId,
    ),
  }),
);

export type GoogleCalendarInboundEvent = typeof googleCalendarInboundEvents.$inferSelect;
export type NewGoogleCalendarInboundEvent = typeof googleCalendarInboundEvents.$inferInsert;
