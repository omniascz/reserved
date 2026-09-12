import { pgTable, uuid, varchar, timestamp, integer, index, check } from 'drizzle-orm/pg-core';
import { sql } from 'drizzle-orm';
import { tenants } from './tenants.js';
import { branches } from './branches.js';
import { services } from './services.js';
import { employees } from './employees.js';
import { resources } from './resources.js';

// Sprint 10.0 — Skupinové lekce / kapacita >1.
// Reference: MIGRACE-FITNESS.md, předloha Ticketarium fitness-slots/migrations/140_fitness_slots.sql
//
// class_session = vypsaná instance skupinové lekce (jeden trenér, kapacita N).
// Jednotlivý účastník = řádek v `bookings` s vyplněným `session_id`.
//   - 1:1 služba (services.capacity = 1): rezervace má session_id = NULL, chová se
//     jako dosud (chrání ji EXCLUDE constraint `bookings_no_overlap`).
//   - skupinová lekce (services.capacity > 1): provoz vypíše class_session a klienti
//     se do ní přihlašují; kapacitu hlídá `booked_count` (atomicky přes FOR UPDATE
//     na řádku session + CHECK booked_count <= capacity jako pojistka v DB).
//
// EXCLUDE constraint na bookings je od migrace 0050 partial — platí jen pro
// session_id IS NULL, takže víc účastníků u jednoho trenéra v jednom čase už nekoliduje.

export const classSessionStatuses = ['open', 'cancelled', 'completed'] as const;
export type ClassSessionStatus = (typeof classSessionStatuses)[number];

export const classSessions = pgTable(
  'class_sessions',
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
    /** Trenér vedoucí lekci. Nullable (např. pool / nezařazeno). */
    employeeId: uuid('employee_id').references(() => employees.id, { onDelete: 'set null' }),
    /**
     * Zdroj/přístroj (sprint 10.2 — EMS). NULL = lekce bez zdroje (skupinová u trenéra).
     * EMS lekce = capacity 1 + resource_id; dvojí rezervaci přístroje hlídá EXCLUDE.
     */
    resourceId: uuid('resource_id').references(() => resources.id, { onDelete: 'set null' }),
    startsAt: timestamp('starts_at', { withTimezone: true }).notNull(),
    endsAt: timestamp('ends_at', { withTimezone: true }).notNull(),
    /** Buffery — kvůli kalendáři a budoucímu sdílení zdroje. */
    bufferStartsAt: timestamp('buffer_starts_at', { withTimezone: true }).notNull(),
    bufferEndsAt: timestamp('buffer_ends_at', { withTimezone: true }).notNull(),
    /** Maximální počet účastníků. Snapshot ze services.capacity při vypsání. */
    capacity: integer('capacity').notNull(),
    /** Kolik míst je obsazeno. Udržováno atomicky při přihlášení/odhlášení. */
    bookedCount: integer('booked_count').notNull().default(0),
    status: varchar('status', { length: 32 }).notNull().default('open'),
    /** Opakovaný rozvrh (sprint 10.25) — NULL = jednorázová lekce. */
    recurrenceId: uuid('recurrence_id'),
    /** Kurz (sprint 10.26) — NULL = samostatná lekce; jinak lekce patří do kurzu. */
    courseId: uuid('course_id'),
    /** Spot booking (10.33): počet pojmenovaných míst v sále. 0 = bez výběru místa. */
    spotCount: integer('spot_count').notNull().default(0),
    /** Tvrdé podmínky (10.33): věkové omezení účastníka (k datu lekce). */
    minAge: integer('min_age'),
    maxAge: integer('max_age'),
    /** Prerekvizita: účastník musí mít dokončenou rezervaci této služby. */
    prerequisiteServiceId: uuid('prerequisite_service_id'),
    cancelledAt: timestamp('cancelled_at', { withTimezone: true }),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => ({
    tenantIdx: index('class_sessions_tenant_idx').on(table.tenantId),
    lookupIdx: index('class_sessions_lookup_idx').on(
      table.tenantId,
      table.serviceId,
      table.branchId,
      table.startsAt,
    ),
    employeeIdx: index('class_sessions_employee_idx').on(table.employeeId, table.startsAt),
    resourceIdx: index('class_sessions_resource_idx').on(table.resourceId, table.startsAt),
    capacityPositive: check('class_sessions_capacity_positive', sql`${table.capacity} >= 1`),
    bookedCountRange: check(
      'class_sessions_booked_count_range',
      sql`${table.bookedCount} >= 0 AND ${table.bookedCount} <= ${table.capacity}`,
    ),
  }),
);

export type ClassSession = typeof classSessions.$inferSelect;
export type NewClassSession = typeof classSessions.$inferInsert;
