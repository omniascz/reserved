import { pgTable, uuid, varchar, integer, boolean, timestamp, index } from 'drizzle-orm/pg-core';
import { tenants } from './tenants.js';
import { branches } from './branches.js';

// Vertikála Restaurace — fáze R3 (sprint 10.23): předdefinované slučitelné sestavy.
//
// Restaurace explicitně řekne, které stoly lze spojit a jaká je výsledná kapacita
// (často > součet míst — víc lidí se vejde ke spojeným stolům). Engine pro velkou
// skupinu zkusí: (a) jeden dost velký stůl, (b) kombinaci, jejíž VŠECHNY stoly jsou
// v daném čase volné. Slučitelnost je řízená, ne libovolné spojování čehokoli.

export const tableCombinations = pgTable(
  'table_combinations',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    tenantId: uuid('tenant_id')
      .notNull()
      .references(() => tenants.id, { onDelete: 'cascade' }),
    branchId: uuid('branch_id')
      .notNull()
      .references(() => branches.id, { onDelete: 'cascade' }),
    name: varchar('name', { length: 100 }).notNull(),
    /** Stoly (resource ids), které sestavu tvoří. */
    resourceIds: uuid('resource_ids').array().notNull(),
    /** Výsledná kapacita spojené sestavy. */
    combinedCapacity: integer('combined_capacity').notNull(),
    /** Nepoužij velkou sestavu pro malou skupinu. */
    minPartySize: integer('min_party_size').notNull().default(1),
    isActive: boolean('is_active').notNull().default(true),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
    deletedAt: timestamp('deleted_at', { withTimezone: true }),
  },
  (table) => ({
    tenantIdx: index('table_combinations_tenant_idx').on(table.tenantId),
    branchIdx: index('table_combinations_branch_idx').on(table.branchId),
  }),
);

export type TableCombination = typeof tableCombinations.$inferSelect;
export type NewTableCombination = typeof tableCombinations.$inferInsert;
