import { pgTable, uuid, varchar, integer, text, timestamp, index } from 'drizzle-orm/pg-core';
import { tenants } from './tenants.js';
import { branches } from './branches.js';
import { resources } from './resources.js';
import { servicePeriods } from './service-periods.js';
import { users } from './users.js';

// Vertikála Restaurace — fáze R1 (sprint 10.23): rezervace stolu na časový slot.
//
// Stůl = resource (type='table'). Rezervace drží stůl v <starts_at, ends_at), kde
// ends_at = příchod + turn_time (dle party_size) + úklidový buffer stolu.
//
// AUTORITATIVNÍ obsazenost stolů je v `table_reservation_tables` (join), kde je
// JEDEN EXCLUDE přes (resource_id, tstzrange) — tím je race-safe i slučování
// (R3): primární i slučované stoly leží ve stejné tabulce, takže se nikdy
// "neminou" dvěma oddělenými constrainty. `resource_id` zde je jen denormalizovaný
// ukazatel na vedoucí stůl pro rychlý výpis (není zdroj pravdy o kolizích).
//
// R1 = jeden stůl na rezervaci (1 join řádek). R3 = N stolů (N join řádků).

export const tableReservationStatuses = [
  'confirmed', // potvrzeno, host ještě nedorazil
  'seated', // host usazen
  'completed', // dokončeno (host odešel)
  'no_show', // host nedorazil — uvolňuje stůl
  'cancelled', // zrušeno — uvolňuje stůl
] as const;
export type TableReservationStatus = (typeof tableReservationStatuses)[number];

/** Preference posazení (volitelná, ne tvrdá podmínka). */
export const seatingPreferences = ['indoor', 'terrace', 'bar', 'quiet', 'window'] as const;
export type SeatingPreference = (typeof seatingPreferences)[number];

export const tableReservations = pgTable(
  'table_reservations',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    tenantId: uuid('tenant_id')
      .notNull()
      .references(() => tenants.id, { onDelete: 'cascade' }),
    branchId: uuid('branch_id').references(() => branches.id, { onDelete: 'set null' }),
    /** Vedoucí stůl (denormalizovaný ukazatel pro výpis). Autoritativní obsazenost
     *  všech stolů rezervace je v `table_reservation_tables`. */
    resourceId: uuid('resource_id').references(() => resources.id, { onDelete: 'restrict' }),
    /** Směna, ve které rezervace spadá (NULL = mimo definované směny / ruční). */
    servicePeriodId: uuid('service_period_id').references(() => servicePeriods.id, {
      onDelete: 'set null',
    }),
    customerId: uuid('customer_id'),
    customerName: varchar('customer_name', { length: 200 }).notNull(),
    customerEmail: varchar('customer_email', { length: 255 }),
    customerPhone: varchar('customer_phone', { length: 32 }),
    /** Příchod (UTC). */
    startsAt: timestamp('starts_at', { withTimezone: true }).notNull(),
    /** Konec obsazení stolu = příchod + turn time + úklid (UTC, půlotevřený interval). */
    endsAt: timestamp('ends_at', { withTimezone: true }).notNull(),
    /** Počet hostů (covers). */
    partySize: integer('party_size').notNull().default(2),
    /** Preference posazení (indoor/terrace/...). */
    seatingPref: varchar('seating_pref', { length: 30 }),
    /** Příležitost (narozeniny, výročí, byznys) — pro personalizaci/upsell. */
    occasion: varchar('occasion', { length: 50 }),
    /** Záloha (haléře) — u velkých skupin / akcí dle Rules Engine. */
    depositHellers: integer('deposit_hellers').notNull().default(0),
    currency: varchar('currency', { length: 3 }).notNull().default('CZK'),
    status: varchar('status', { length: 16 }).notNull().default('confirmed'),
    note: text('note'),
    createdBy: uuid('created_by').references(() => users.id),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => ({
    tenantIdx: index('table_reservations_tenant_idx').on(table.tenantId),
    resourceIdx: index('table_reservations_resource_idx').on(table.resourceId),
    startsAtIdx: index('table_reservations_starts_at_idx').on(table.tenantId, table.startsAt),
  }),
);

export type TableReservation = typeof tableReservations.$inferSelect;
export type NewTableReservation = typeof tableReservations.$inferInsert;
