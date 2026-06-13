import { pgTable, uuid, varchar, boolean, jsonb, timestamp, index } from 'drizzle-orm/pg-core';
import { tenants } from './tenants.js';
import { branches } from './branches.js';

// Sprint 10.2 — Zdroje (přístroje / vybavení).
// Reference: MIGRACE-FITNESS.md, Ticketarium ems-booking.
//
// resource = fyzický zdroj s vlastní kapacitou v čase (typicky EMS přístroj).
// EMS lekce = class_session s capacity 1 navázaná na konkrétní `resource_id`.
// Dvojí rezervaci stejného přístroje ve stejný čas hlídá EXCLUDE constraint
// na class_sessions (migrace 0052), analogicky k 1:1 ochraně zaměstnance.

export const resourceTypes = ['ems_machine', 'room', 'equipment', 'vehicle', 'other'] as const;
export type ResourceType = (typeof resourceTypes)[number];

export const resources = pgTable(
  'resources',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    tenantId: uuid('tenant_id')
      .notNull()
      .references(() => tenants.id, { onDelete: 'cascade' }),
    branchId: uuid('branch_id')
      .notNull()
      .references(() => branches.id, { onDelete: 'cascade' }),
    name: varchar('name', { length: 200 }).notNull(),
    /** Typ zdroje: ems_machine | room | equipment | other. */
    type: varchar('type', { length: 32 }).notNull().default('ems_machine'),
    isActive: boolean('is_active').notNull().default(true),
    metadata: jsonb('metadata').notNull().default({}),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
    deletedAt: timestamp('deleted_at', { withTimezone: true }),
  },
  (table) => ({
    tenantIdx: index('resources_tenant_idx').on(table.tenantId),
    branchIdx: index('resources_branch_idx').on(table.branchId),
  }),
);

export type Resource = typeof resources.$inferSelect;
export type NewResource = typeof resources.$inferInsert;
