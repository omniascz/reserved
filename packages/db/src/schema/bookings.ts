import {
  pgTable,
  uuid,
  varchar,
  text,
  timestamp,
  integer,
  boolean,
  jsonb,
  index,
} from 'drizzle-orm/pg-core';
import { tenants } from './tenants.js';
import { branches } from './branches.js';
import { employees } from './employees.js';
import { services } from './services.js';
import { users } from './users.js';

// Reference: reserved-docs/13d_db_schema_bookings_series_packages.md
//            reserved-docs/15_concurrent_booking_marketplace.md
//
// Bookings — finalní rezervace (po zaplacení / potvrzení).
// Slot holds — dočasná rezervace slotu (10 min) zatímco zákazník platí.
// Availability blocks — admin manuálně zablokuje čas (úklid, školení).
// Holidays — státní svátky a tenantem definované zavřené dny.
//
// EXCLUDE constraint na bookings (přidaný v RLS migraci 0007) zaručuje, že
// stejný zaměstnanec nemůže mít dvě překrývající se rezervace v DB. Tohle je
// druhá obrana — aplikační vrstva má vlastní kontrolu, ale RLS politika +
// EXCLUDE constraint = defense in depth.

export const bookingStatuses = [
  'pending',
  'confirmed',
  'completed',
  'cancelled',
  'no_show',
] as const;
export type BookingStatus = (typeof bookingStatuses)[number];

// ─── Bookings ────────────────────────────────────────────────────────────

export const bookings = pgTable(
  'bookings',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    tenantId: uuid('tenant_id')
      .notNull()
      .references(() => tenants.id, { onDelete: 'cascade' }),
    branchId: uuid('branch_id')
      .notNull()
      .references(() => branches.id, { onDelete: 'restrict' }),
    serviceId: uuid('service_id')
      .notNull()
      .references(() => services.id, { onDelete: 'restrict' }),
    employeeId: uuid('employee_id').references(() => employees.id, {
      onDelete: 'set null',
    }),
    /** Volitelně přihlášený zákazník (link na users.id pokud měl účet). */
    customerUserId: uuid('customer_user_id').references(() => users.id),
    /** Údaje zákazníka — kopie pro audit i kdyby user smazán. */
    customerName: varchar('customer_name', { length: 200 }).notNull(),
    customerEmail: varchar('customer_email', { length: 255 }).notNull(),
    customerPhone: varchar('customer_phone', { length: 32 }),
    /** Skutečný čas začátku rezervace (UTC). */
    startsAt: timestamp('starts_at', { withTimezone: true }).notNull(),
    /** Skutečný čas konce (= startsAt + service.durationMinutes + addons). */
    endsAt: timestamp('ends_at', { withTimezone: true }).notNull(),
    /** Buffer před, kdy je zaměstnanec blokovaný (přípravu). */
    bufferStartsAt: timestamp('buffer_starts_at', { withTimezone: true }).notNull(),
    /** Buffer po (úklid, čas mezi). */
    bufferEndsAt: timestamp('buffer_ends_at', { withTimezone: true }).notNull(),
    status: varchar('status', { length: 32 }).notNull().default('pending'),
    /** Skutečně účtovaná částka v haléřích (může se lišit od services.price_hellers). */
    pricePaidHellers: integer('price_paid_hellers').notNull().default(0),
    currency: varchar('currency', { length: 3 }).notNull().default('CZK'),
    /** Volitelná poznámka zákazníka. */
    customerNote: text('customer_note'),
    /** Interní poznámka admin/zaměstnanec. */
    internalNote: text('internal_note'),
    /** Referenční kód, který zákazník dostane v potvrzovacím emailu. */
    referenceCode: varchar('reference_code', { length: 16 }).notNull(),
    /** Volné metadata (zdroj rezervace: 'web', 'admin', 'phone', ...). */
    metadata: jsonb('metadata').notNull().default({}),
    cancelledAt: timestamp('cancelled_at', { withTimezone: true }),
    cancelledReason: text('cancelled_reason'),
    completedAt: timestamp('completed_at', { withTimezone: true }),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => ({
    tenantIdx: index('bookings_tenant_idx').on(table.tenantId),
    employeeRangeIdx: index('bookings_employee_range_idx').on(
      table.employeeId,
      table.bufferStartsAt,
      table.bufferEndsAt,
    ),
    statusIdx: index('bookings_status_idx').on(table.tenantId, table.status),
    customerIdx: index('bookings_customer_idx').on(table.tenantId, table.customerUserId),
    refCodeIdx: index('bookings_ref_code_idx').on(table.referenceCode),
    branchIdx: index('bookings_branch_idx').on(table.branchId, table.startsAt),
  }),
);

export type Booking = typeof bookings.$inferSelect;
export type NewBooking = typeof bookings.$inferInsert;

// ─── Slot holds (dočasné, 10 min TTL) ────────────────────────────────────

export const slotHolds = pgTable(
  'slot_holds',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    tenantId: uuid('tenant_id')
      .notNull()
      .references(() => tenants.id, { onDelete: 'cascade' }),
    branchId: uuid('branch_id')
      .notNull()
      .references(() => branches.id, { onDelete: 'cascade' }),
    serviceId: uuid('service_id')
      .notNull()
      .references(() => services.id, { onDelete: 'cascade' }),
    employeeId: uuid('employee_id')
      .notNull()
      .references(() => employees.id, { onDelete: 'cascade' }),
    startsAt: timestamp('starts_at', { withTimezone: true }).notNull(),
    endsAt: timestamp('ends_at', { withTimezone: true }).notNull(),
    bufferStartsAt: timestamp('buffer_starts_at', { withTimezone: true }).notNull(),
    bufferEndsAt: timestamp('buffer_ends_at', { withTimezone: true }).notNull(),
    /** Po kterém čase hold vyprší a může se rezervovat znovu. */
    expiresAt: timestamp('expires_at', { withTimezone: true }).notNull(),
    /** Token, který zákazník posílá při následném POST /bookings. */
    sessionToken: varchar('session_token', { length: 64 }).notNull(),
    /** Stav: 'active' | 'converted' (proběhla rezervace) | 'released' | 'expired'. */
    status: varchar('status', { length: 32 }).notNull().default('active'),
    convertedToBookingId: uuid('converted_to_booking_id'),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => ({
    tenantIdx: index('slot_holds_tenant_idx').on(table.tenantId),
    employeeRangeIdx: index('slot_holds_employee_range_idx').on(
      table.employeeId,
      table.bufferStartsAt,
      table.bufferEndsAt,
    ),
    expiryIdx: index('slot_holds_expiry_idx').on(table.expiresAt, table.status),
    tokenIdx: index('slot_holds_token_idx').on(table.sessionToken),
  }),
);

export type SlotHold = typeof slotHolds.$inferSelect;
export type NewSlotHold = typeof slotHolds.$inferInsert;

// ─── Availability blocks (admin manuálně blokuje čas) ────────────────────

export const availabilityBlocks = pgTable(
  'availability_blocks',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    tenantId: uuid('tenant_id')
      .notNull()
      .references(() => tenants.id, { onDelete: 'cascade' }),
    /** Pokud branchId je NULL = block na všechny pobočky tenanta. */
    branchId: uuid('branch_id').references(() => branches.id, { onDelete: 'cascade' }),
    /** Pokud employeeId je NULL = block všech zaměstnanců (např. zavírací doba). */
    employeeId: uuid('employee_id').references(() => employees.id, {
      onDelete: 'cascade',
    }),
    startsAt: timestamp('starts_at', { withTimezone: true }).notNull(),
    endsAt: timestamp('ends_at', { withTimezone: true }).notNull(),
    /** Typ: 'cleaning' | 'training' | 'meeting' | 'maintenance' | 'other'. */
    blockType: varchar('block_type', { length: 32 }).notNull().default('other'),
    /** Volitelný popis pro kalendář. */
    title: varchar('title', { length: 200 }),
    note: text('note'),
    createdBy: uuid('created_by').references(() => users.id),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => ({
    tenantIdx: index('availability_blocks_tenant_idx').on(table.tenantId),
    rangeIdx: index('availability_blocks_range_idx').on(
      table.tenantId,
      table.startsAt,
      table.endsAt,
    ),
    employeeIdx: index('availability_blocks_employee_idx').on(table.employeeId, table.startsAt),
    branchIdx: index('availability_blocks_branch_idx').on(table.branchId, table.startsAt),
  }),
);

export type AvailabilityBlock = typeof availabilityBlocks.$inferSelect;
export type NewAvailabilityBlock = typeof availabilityBlocks.$inferInsert;

// ─── Holidays / zavřené dny ──────────────────────────────────────────────

export const holidays = pgTable(
  'holidays',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    tenantId: uuid('tenant_id')
      .notNull()
      .references(() => tenants.id, { onDelete: 'cascade' }),
    /** Pokud branchId NULL = pro všechny pobočky. */
    branchId: uuid('branch_id').references(() => branches.id, { onDelete: 'cascade' }),
    /** Datum (např. '2026-12-24') v lokalní timezone tenantu. */
    date: timestamp('date', { withTimezone: false, mode: 'date' }).notNull(),
    name: varchar('name', { length: 200 }).notNull(),
    /** Source: 'public_holiday' (státní) | 'custom' (tenantem nastavený). */
    source: varchar('source', { length: 32 }).notNull().default('custom'),
    /** Pokud je tenant otevřený jen v omezené době (např. svátek 8-12), uveď zde. */
    customStartTime: varchar('custom_start_time', { length: 5 }),
    customEndTime: varchar('custom_end_time', { length: 5 }),
    /** Pokud true, salon má otevřeno (jen text k zobrazení). False = zavřeno. */
    isOpen: boolean('is_open').notNull().default(false),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => ({
    tenantIdx: index('holidays_tenant_idx').on(table.tenantId),
    dateIdx: index('holidays_date_idx').on(table.tenantId, table.date),
    branchIdx: index('holidays_branch_idx').on(table.branchId, table.date),
  }),
);

export type Holiday = typeof holidays.$inferSelect;
export type NewHoliday = typeof holidays.$inferInsert;
