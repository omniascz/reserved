import {
  pgTable,
  uuid,
  varchar,
  text,
  integer,
  jsonb,
  timestamp,
  index,
} from 'drizzle-orm/pg-core';
import { tenants } from './tenants.js';

// Sprint 10.7 — marketingové kampaně + win-back.
// Kampaň = segment publika (jen klienti s marketing souhlasem) + zpráva (email/SMS).
// Odeslání vloží zprávy do fronty `notifications`, kterou rozešle worker.
// audience jsonb: { type: 'all_optin' | 'inactive_days' | 'tag', days?: number, tag?: string }.

export const campaignChannels = ['email', 'sms', 'whatsapp'] as const;
export type CampaignChannel = (typeof campaignChannels)[number];

export const campaignStatuses = ['draft', 'sent'] as const;
export type CampaignStatus = (typeof campaignStatuses)[number];

export const marketingCampaigns = pgTable(
  'marketing_campaigns',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    tenantId: uuid('tenant_id')
      .notNull()
      .references(() => tenants.id, { onDelete: 'cascade' }),
    name: varchar('name', { length: 200 }).notNull(),
    channel: varchar('channel', { length: 16 }).notNull(),
    subject: varchar('subject', { length: 500 }),
    body: text('body').notNull(),
    /** { type, days?, tag? } — segment příjemců. */
    audience: jsonb('audience').notNull().default({}),
    status: varchar('status', { length: 32 }).notNull().default('draft'),
    sentCount: integer('sent_count').notNull().default(0),
    createdBy: uuid('created_by'),
    sentAt: timestamp('sent_at', { withTimezone: true }),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => ({
    tenantIdx: index('marketing_campaigns_tenant_idx').on(table.tenantId, table.status),
  }),
);

export type MarketingCampaign = typeof marketingCampaigns.$inferSelect;
export type NewMarketingCampaign = typeof marketingCampaigns.$inferInsert;
