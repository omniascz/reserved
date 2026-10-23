import {
  pgTable,
  uuid,
  varchar,
  text,
  timestamp,
  boolean,
  integer,
  jsonb,
  index,
  unique,
} from 'drizzle-orm/pg-core';
import { tenants } from './tenants.js';
import { employees } from './employees.js';
import { bookings, availabilityBlocks } from './bookings.js';

// Další kalendáře zaměstnanců — Outlook (Microsoft 365) a CalDAV (Apple
// iCloud, Nextcloud, Seznam kalendář, …). Google má vlastní tabulky
// (google-calendar.ts) z dřívějška.
//
// Vzor cal.com (calcom/cal.diy@0f19cc4 packages/app-store/office365calendar,
// packages/lib/CalendarService.ts pro CalDAV, packages/features/calendar-subscription
// pro push — MIT): rezervace se propisují ven jako události a události
// z kalendáře se propisují dovnitř jako bloky dostupnosti (availability_blocks),
// takže výpočet volných termínů zůstává beze změny.
//
// Tabulky:
//   1. calendar_connections     — připojený kalendář zaměstnance (přístupy šifrovaně)
//   2. calendar_event_links     — rezervace ↔ událost v externím kalendáři
//   3. calendar_inbound_events  — událost z kalendáře ↔ blok dostupnosti

export const calendarProviders = ['outlook', 'caldav'] as const;
export type CalendarProvider = (typeof calendarProviders)[number];

export const calendarConnections = pgTable(
  'calendar_connections',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    tenantId: uuid('tenant_id')
      .notNull()
      .references(() => tenants.id, { onDelete: 'cascade' }),
    employeeId: uuid('employee_id')
      .notNull()
      .references(() => employees.id, { onDelete: 'cascade' }),
    /** 'outlook' | 'caldav' */
    provider: varchar('provider', { length: 16 }).notNull(),
    /** E-mail / uživatelské jméno účtu (pro zobrazení). */
    accountEmail: varchar('account_email', { length: 255 }),
    /** Outlook: ID kalendáře (null = výchozí). CalDAV: URL kalendáře. */
    calendarRef: text('calendar_ref'),
    calendarName: varchar('calendar_name', { length: 255 }),
    /**
     * Přístupy ŠIFROVANĚ (zasifrujKonfiguraci, klíč PAYMENT_CONFIG_KEY):
     * Outlook { refreshToken, accessToken, accessTokenExpiresAt },
     * CalDAV { serverUrl, username, password }.
     */
    credentials: jsonb('credentials').notNull().default({}),
    isActive: boolean('is_active').notNull().default(true),
    /** Události z kalendáře blokují termíny (dovnitř). */
    inboundSyncEnabled: boolean('inbound_sync_enabled').notNull().default(true),
    /** Rezervace se zapisují do kalendáře (ven). */
    outboundEnabled: boolean('outbound_enabled').notNull().default(true),
    /** Outlook: @odata.deltaLink. CalDAV: nepoužito (stahuje se okno vždy celé). */
    syncCursor: text('sync_cursor'),
    /** Přišel push „něco se změnilo" → worker stáhne změny co nejdřív. */
    needsSync: boolean('needs_sync').notNull().default(false),
    /** Outlook: Graph subscription (push) a její konec platnosti. */
    subscriptionId: varchar('subscription_id', { length: 255 }),
    subscriptionExpiresAt: timestamp('subscription_expires_at', { withTimezone: true }),
    lastSyncedAt: timestamp('last_synced_at', { withTimezone: true }),
    lastInboundSyncAt: timestamp('last_inbound_sync_at', { withTimezone: true }),
    lastSyncError: text('last_sync_error'),
    consecutiveErrors: integer('consecutive_errors').notNull().default(0),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
    revokedAt: timestamp('revoked_at', { withTimezone: true }),
  },
  (table) => ({
    tenantIdx: index('calendar_connections_tenant_idx').on(table.tenantId),
    employeeIdx: index('calendar_connections_employee_idx').on(
      table.employeeId,
      table.provider,
      table.revokedAt,
    ),
    subscriptionIdx: index('calendar_connections_subscription_idx').on(table.subscriptionId),
  }),
);

export type CalendarConnection = typeof calendarConnections.$inferSelect;
export type NewCalendarConnection = typeof calendarConnections.$inferInsert;

export const calendarEventLinks = pgTable(
  'calendar_event_links',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    tenantId: uuid('tenant_id')
      .notNull()
      .references(() => tenants.id, { onDelete: 'cascade' }),
    connectionId: uuid('connection_id')
      .notNull()
      .references(() => calendarConnections.id, { onDelete: 'cascade' }),
    bookingId: uuid('booking_id')
      .notNull()
      .references(() => bookings.id, { onDelete: 'cascade' }),
    /** Outlook: event id. CalDAV: UID události. */
    externalEventId: varchar('external_event_id', { length: 1024 }).notNull(),
    /** CalDAV: URL objektu a etag (pro úpravu / smazání). */
    externalUrl: text('external_url'),
    externalEtag: varchar('external_etag', { length: 255 }),
    lastSyncedAt: timestamp('last_synced_at', { withTimezone: true }).notNull().defaultNow(),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => ({
    tenantIdx: index('calendar_event_links_tenant_idx').on(table.tenantId),
    bookingIdx: index('calendar_event_links_booking_idx').on(table.bookingId),
    uniqueBooking: unique('calendar_event_links_booking_unique').on(
      table.connectionId,
      table.bookingId,
    ),
  }),
);

export type CalendarEventLink = typeof calendarEventLinks.$inferSelect;

export const calendarInboundEvents = pgTable(
  'calendar_inbound_events',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    tenantId: uuid('tenant_id')
      .notNull()
      .references(() => tenants.id, { onDelete: 'cascade' }),
    connectionId: uuid('connection_id')
      .notNull()
      .references(() => calendarConnections.id, { onDelete: 'cascade' }),
    externalEventId: varchar('external_event_id', { length: 1024 }).notNull(),
    blockId: uuid('block_id')
      .notNull()
      .references(() => availabilityBlocks.id, { onDelete: 'cascade' }),
    contentHash: varchar('content_hash', { length: 64 }).notNull(),
    lastSyncedAt: timestamp('last_synced_at', { withTimezone: true }).notNull().defaultNow(),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => ({
    tenantIdx: index('calendar_inbound_events_tenant_idx').on(table.tenantId),
    blockIdx: index('calendar_inbound_events_block_idx').on(table.blockId),
    uniqueEvent: unique('calendar_inbound_events_unique').on(
      table.connectionId,
      table.externalEventId,
    ),
  }),
);

export type CalendarInboundEvent = typeof calendarInboundEvents.$inferSelect;
