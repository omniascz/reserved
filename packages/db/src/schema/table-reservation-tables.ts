import { pgTable, uuid, boolean, timestamp, varchar, index } from 'drizzle-orm/pg-core';
import { tenants } from './tenants.js';
import { tableReservations } from './table-reservations.js';
import { resources } from './resources.js';

// Vertikála Restaurace — autoritativní obsazenost stolů (R1 jeden stůl, R3 slučování).
//
// Jeden řádek = jeden stůl (resource type='table') držený jednou rezervací v daném
// čase. JEDEN EXCLUDE na (resource_id, tstzrange(occupied_starts_at, occupied_ends_at))
// hlídá kolize pro VŠECHNY stoly napříč R1 i R3 — slučování tak nemá slepé místo
// (na rozdíl od dvou oddělených constraintů). Čas je denormalizovaný kvůli EXCLUDE,
// stejně jako u `booking_resources` (Motor 1). Viz migrace 0083.

export const tableReservationTables = pgTable(
  'table_reservation_tables',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    tenantId: uuid('tenant_id')
      .notNull()
      .references(() => tenants.id, { onDelete: 'cascade' }),
    reservationId: uuid('reservation_id')
      .notNull()
      .references(() => tableReservations.id, { onDelete: 'cascade' }),
    resourceId: uuid('resource_id')
      .notNull()
      .references(() => resources.id, { onDelete: 'restrict' }),
    /** Vedoucí stůl skupiny (u nesloučené rezervace je primární jediný stůl). */
    isPrimary: boolean('is_primary').notNull().default(false),
    /** Kopie časového rozsahu rezervace — pro EXCLUDE překryvu. */
    occupiedStartsAt: timestamp('occupied_starts_at', { withTimezone: true }).notNull(),
    occupiedEndsAt: timestamp('occupied_ends_at', { withTimezone: true }).notNull(),
    /** Zrcadlí stav rezervace; 'cancelled'/'no_show' stůl uvolňují (mimo EXCLUDE). */
    status: varchar('status', { length: 16 }).notNull().default('confirmed'),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => ({
    tenantIdx: index('table_reservation_tables_tenant_idx').on(table.tenantId),
    reservationIdx: index('table_reservation_tables_reservation_idx').on(table.reservationId),
    resourceIdx: index('table_reservation_tables_resource_idx').on(table.resourceId),
  }),
);

export type TableReservationTable = typeof tableReservationTables.$inferSelect;
export type NewTableReservationTable = typeof tableReservationTables.$inferInsert;
