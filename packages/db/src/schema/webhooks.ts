// Outgoing webhooks — pro Zapier, Make, IFTTT, vlastni endpointy.
// Sprint 3.3 faze C5.
//
// Model:
//   outgoing_webhooks   — konfigurace per tenant: URL + secret + event_types
//   webhook_deliveries  — audit log kazdeho doruceni (success/fail + retry counter)
//
// Bezpecnost: kazdy payload je podepsany HMAC-SHA256 v hlavicce
// X-Reserved-Signature. Prijemce musi overit podpis pomoci sdileneho secretu.

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

// ─── Outgoing webhook config (per tenant) ─────────────────────────────

export const outgoingWebhooks = pgTable(
  'outgoing_webhooks',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    tenantId: uuid('tenant_id')
      .notNull()
      .references(() => tenants.id, { onDelete: 'cascade' }),
    /** Popis pro admina ("Zapier — nova rezervace"). */
    name: varchar('name', { length: 200 }).notNull(),
    /** Cilovy webhook URL (HTTPS doporuceno). */
    url: text('url').notNull(),
    /** HMAC-SHA256 secret pro podpis payloadu. */
    secret: varchar('secret', { length: 64 }).notNull(),
    /**
     * JSON array nazvu event types: ['booking.created', 'booking.cancelled', ...].
     * Webhook se zavola jen pro tyto eventy.
     */
    eventTypes: jsonb('event_types').notNull().default('[]'),
    /** Pokud false, webhook je pozastaven a nevolan. */
    isActive: boolean('is_active').notNull().default(true),
    /** Pocet po sobe jdoucich chyb — po 5 se isActive nastavi na false. */
    consecutiveErrors: integer('consecutive_errors').notNull().default(0),
    lastSuccessAt: timestamp('last_success_at', { withTimezone: true }),
    lastErrorAt: timestamp('last_error_at', { withTimezone: true }),
    lastError: text('last_error'),
    createdBy: uuid('created_by').references(() => users.id),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => ({
    tenantIdx: index('outgoing_webhooks_tenant_idx').on(table.tenantId),
  }),
);

export type OutgoingWebhook = typeof outgoingWebhooks.$inferSelect;
export type NewOutgoingWebhook = typeof outgoingWebhooks.$inferInsert;

// ─── Webhook delivery audit log ────────────────────────────────────────

export const webhookDeliveries = pgTable(
  'webhook_deliveries',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    tenantId: uuid('tenant_id')
      .notNull()
      .references(() => tenants.id, { onDelete: 'cascade' }),
    webhookId: uuid('webhook_id')
      .notNull()
      .references(() => outgoingWebhooks.id, { onDelete: 'cascade' }),
    eventType: varchar('event_type', { length: 64 }).notNull(),
    /** Payload JSON poslany v body. */
    payload: jsonb('payload').notNull(),
    /** 'pending' | 'sent' | 'failed' */
    status: varchar('status', { length: 16 }).notNull().default('pending'),
    /** Pocet pokusu doruceni. */
    attempts: integer('attempts').notNull().default(0),
    /** HTTP status z posledniho pokusu. */
    responseStatus: integer('response_status'),
    /** Odpoved (truncated 2000 chars) pro debugging. */
    responseBody: text('response_body'),
    /** Posledni chybova zprava. */
    lastError: text('last_error'),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => ({
    tenantIdx: index('webhook_deliveries_tenant_idx').on(table.tenantId),
    webhookIdx: index('webhook_deliveries_webhook_idx').on(table.webhookId, table.createdAt),
    statusIdx: index('webhook_deliveries_status_idx').on(table.status, table.createdAt),
  }),
);

export type WebhookDelivery = typeof webhookDeliveries.$inferSelect;
export type NewWebhookDelivery = typeof webhookDeliveries.$inferInsert;

/**
 * Kanonicke event types poustenne v Reserved.
 * Pridej sem dalsi pri rozsireni — service kontroluje, ze webhook ma event v
 * eventTypes pred volanim.
 */
export const WEBHOOK_EVENT_TYPES = [
  'booking.created',
  'booking.confirmed',
  'booking.cancelled',
  'booking.completed',
  'booking.no_show',
  'customer.created',
] as const;

export type WebhookEventType = (typeof WEBHOOK_EVENT_TYPES)[number];
