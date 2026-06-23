import {
  pgTable,
  uuid,
  varchar,
  integer,
  time,
  boolean,
  jsonb,
  timestamp,
  index,
} from 'drizzle-orm/pg-core';
import { tenants } from './tenants.js';
import { branches } from './branches.js';

// Vertikála Restaurace — fáze R1 (sprint 10.23): směny / dayparts.
//
// service_period = rezervovatelné okno provozu (Oběd / Večeře / Brunch) s vlastním
// pacingem (strop hostů na slot — ochrana kuchyně) a pravidly doby sezení (turn time).
// Restaurace nemyslí v "pracovní době zaměstnance", ale ve směnách; availability
// engine restaurace počítá volné stoly v rámci aktivní směny.

export const turnTimeRuleSchema = {
  /** turn_time_rules: pole pravidel doby sezení dle velikosti skupiny.
   *  [{ "maxParty": 2, "minutes": 90 }, { "maxParty": 4, "minutes": 120 }] */
} as const;

export const servicePeriods = pgTable(
  'service_periods',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    tenantId: uuid('tenant_id')
      .notNull()
      .references(() => tenants.id, { onDelete: 'cascade' }),
    branchId: uuid('branch_id')
      .notNull()
      .references(() => branches.id, { onDelete: 'cascade' }),
    /** Název směny: 'Oběd' | 'Večeře' | 'Brunch'. */
    name: varchar('name', { length: 50 }).notNull(),
    /** Dny v týdnu, kdy směna platí: 1=Po … 7=Ne. */
    daysOfWeek: integer('days_of_week').array().notNull(),
    /** Začátek směny (lokální čas pobočky). */
    startsAt: time('starts_at').notNull(),
    /** Konec směny. */
    endsAt: time('ends_at').notNull(),
    /** Poslední usazení — po tomto čase už nepřijímáme příchod (NULL = až do endsAt). */
    lastSeating: time('last_seating'),
    /** Krok usazování v minutách (po kolika minutách nabízíme sloty). */
    slotIntervalMin: integer('slot_interval_min').notNull().default(15),
    /** Pacing: max hostů usazených v jednom slotu (NULL = bez limitu). */
    maxCoversPerSlot: integer('max_covers_per_slot'),
    /** Pacing: max rezervací usazených v jednom slotu (NULL = bez limitu). */
    maxPartiesPerSlot: integer('max_parties_per_slot'),
    /** Pravidla doby sezení dle velikosti skupiny (turn time). */
    turnTimeRules: jsonb('turn_time_rules').notNull().default([]),
    /** Od kolika hostů se vyžaduje záloha (NULL = nikdy). */
    depositThresholdGuests: integer('deposit_threshold_guests'),
    /** Výše zálohy na hosta v haléřích (0 = žádná). */
    depositPerGuestHellers: integer('deposit_per_guest_hellers').notNull().default(0),
    isActive: boolean('is_active').notNull().default(true),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
    deletedAt: timestamp('deleted_at', { withTimezone: true }),
  },
  (table) => ({
    tenantIdx: index('service_periods_tenant_idx').on(table.tenantId),
    branchIdx: index('service_periods_branch_idx').on(table.branchId),
  }),
);

export type ServicePeriod = typeof servicePeriods.$inferSelect;
export type NewServicePeriod = typeof servicePeriods.$inferInsert;

/** Jedno pravidlo doby sezení (uloženo v `turnTimeRules` JSONB). */
export interface TurnTimeRule {
  /** Platí pro skupiny do tohoto počtu hostů včetně. */
  maxParty: number;
  /** Doba obsazení stolu v minutách (bez úklidového bufferu). */
  minutes: number;
}
