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
} from 'drizzle-orm/pg-core';
import { tenants } from './tenants.js';
import { users } from './users.js';

// Rules engine schema (sprint 2.5 Phase 1).
//
// Jedno pravidlo = trigger (událost) + 0..N podmínek (boolean expression tree)
// + 1..N akcí (sekvenčně provedených). Vše scoped tenantem.
//
// JSONB pro tree umožňuje libovolnou strukturu bez schema změny při přidání
// nového operátoru / akce.

export const rules = pgTable(
  'rules',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    tenantId: uuid('tenant_id')
      .notNull()
      .references(() => tenants.id, { onDelete: 'cascade' }),
    name: varchar('name', { length: 200 }).notNull(),
    description: text('description'),
    /** Které událost spouští pravidlo: 'booking_created' | 'booking_cancelled'
     *  | 'booking_rescheduled' | 'booking_completed' | 'booking_no_show' | ... */
    triggerEvent: varchar('trigger_event', { length: 64 }).notNull(),
    /** Podmínkový strom (AND/OR + leaf comparisons). JSON Schema viz
     *  rules-engine package types. Prázdné = vždy match. */
    conditions: jsonb('conditions').notNull().default({ type: 'always' }),
    /** Sekvenční list akcí. Každá akce: {type: string, config: {...}}. */
    actions: jsonb('actions').notNull().default([]),
    isEnabled: boolean('is_enabled').notNull().default(true),
    /** Priorita pro evaluaci: vyšší = dřív. Default 100. */
    priority: integer('priority').notNull().default(100),
    /** Pro analytics: kolikrát se pravidlo trigerovalo. */
    triggerCount: integer('trigger_count').notNull().default(0),
    lastTriggeredAt: timestamp('last_triggered_at', { withTimezone: true }),
    createdBy: uuid('created_by').references(() => users.id),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
    deletedAt: timestamp('deleted_at', { withTimezone: true }),
  },
  (table) => ({
    tenantIdx: index('rules_tenant_idx').on(table.tenantId),
    triggerIdx: index('rules_trigger_idx').on(table.tenantId, table.triggerEvent, table.isEnabled),
  }),
);

export type Rule = typeof rules.$inferSelect;
export type NewRule = typeof rules.$inferInsert;

// ─── Rule execution log ────────────────────────────────────────────────

export const ruleExecutions = pgTable(
  'rule_executions',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    tenantId: uuid('tenant_id')
      .notNull()
      .references(() => tenants.id, { onDelete: 'cascade' }),
    ruleId: uuid('rule_id')
      .notNull()
      .references(() => rules.id, { onDelete: 'cascade' }),
    /** Snapshot eventu, který pravidlo spustil. */
    eventType: varchar('event_type', { length: 64 }).notNull(),
    eventPayload: jsonb('event_payload').notNull(),
    /** Výsledek vyhodnocení podmínek: matched / not_matched / error. */
    matched: boolean('matched').notNull(),
    /** Výsledek každé akce — [{action: 'send_email', status: 'ok'|'failed', error?: ...}]. */
    actionResults: jsonb('action_results').notNull().default([]),
    /** Doba evaluace v milisekundách. */
    durationMs: integer('duration_ms'),
    error: text('error'),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => ({
    tenantIdx: index('rule_executions_tenant_idx').on(table.tenantId, table.createdAt),
    ruleIdx: index('rule_executions_rule_idx').on(table.ruleId, table.createdAt),
  }),
);

export type RuleExecution = typeof ruleExecutions.$inferSelect;
export type NewRuleExecution = typeof ruleExecutions.$inferInsert;
