import {
  pgTable,
  uuid,
  varchar,
  text,
  timestamp,
  boolean,
  jsonb,
  index,
  unique,
} from 'drizzle-orm/pg-core';
import { tenants } from './tenants.js';
import { users } from './users.js';

// Feature flags (sprint 3.3 fáze D).
//
// Tenant-scoped flags pro zapinani/vypinani funkci. Pouziva se pro:
//   - Postupne rolloutovani novych features (alpha tester opt-in)
//   - Disablovani funkci pro konkretni tenant
//   - A/B testy
//   - Conditional visibility balicku (s key='package_visibility_*' + config)
//
// Konvence pro klice: lowercase + underscore, namespacing dvojteckou.
// Priklady:
//   - 'subscriptions_enabled'
//   - 'experimental_calendar_v2'
//   - 'beta:google_calendar_sync'
//   - 'package_visibility:vip_only_bundle' (s config { requiredTags: ['VIP'] })

export const featureFlags = pgTable(
  'feature_flags',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    tenantId: uuid('tenant_id')
      .notNull()
      .references(() => tenants.id, { onDelete: 'cascade' }),
    /** Unikatni klic per tenant (lowercase + underscore). */
    key: varchar('key', { length: 100 }).notNull(),
    /** Lidsky popis k cemu flag slouzi. */
    description: text('description'),
    /** Hlavni on/off prepinac. */
    isEnabled: boolean('is_enabled').notNull().default(false),
    /**
     * Typed config JSONB. Tvar zavisi na klici:
     *   - prazdne {} pro jednoduche bool flag
     *   - {requiredTags: string[]} pro package_visibility
     *   - {percentageRollout: 0-100} pro postupny rollout
     *   - libovolne structure pro custom integrace
     */
    config: jsonb('config').notNull().default({}),
    /** Kdo posledni updatoval. */
    updatedBy: uuid('updated_by').references(() => users.id),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => ({
    tenantIdx: index('feature_flags_tenant_idx').on(table.tenantId, table.key),
    uniqueKey: unique('feature_flags_tenant_key_unique').on(table.tenantId, table.key),
  }),
);

export type FeatureFlag = typeof featureFlags.$inferSelect;
export type NewFeatureFlag = typeof featureFlags.$inferInsert;
