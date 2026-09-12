import {
  pgTable,
  uuid,
  varchar,
  text,
  integer,
  boolean,
  timestamp,
  index,
} from 'drizzle-orm/pg-core';
import { tenants } from './tenants.js';

// Doplněk (sprint 10.16) — on-demand video / knihovna obsahu.
// Nahrané lekce / videa (fitness retence). Reserved obsah NEHOSTUJE — ukládá
// URL na externí přehrávač (YouTube/Vimeo/CDN). access_level řídí, kdo URL uvidí:
//   public       = kdokoli
//   members      = přihlášený klient (má účet/portál)
//   subscription = jen klient s aktivním předplatným

export const contentAccessLevels = ['public', 'members', 'subscription'] as const;
export type ContentAccessLevel = (typeof contentAccessLevels)[number];

export const contentItems = pgTable(
  'content_items',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    tenantId: uuid('tenant_id')
      .notNull()
      .references(() => tenants.id, { onDelete: 'cascade' }),
    title: varchar('title', { length: 200 }).notNull(),
    description: text('description'),
    /** URL externího přehrávače (YouTube/Vimeo/CDN). */
    videoUrl: text('video_url').notNull(),
    thumbnailUrl: text('thumbnail_url'),
    category: varchar('category', { length: 100 }),
    accessLevel: varchar('access_level', { length: 16 }).notNull().default('members'),
    durationSeconds: integer('duration_seconds'),
    isPublished: boolean('is_published').notNull().default(true),
    sortOrder: integer('sort_order').notNull().default(0),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
    deletedAt: timestamp('deleted_at', { withTimezone: true }),
  },
  (table) => ({
    tenantIdx: index('content_items_tenant_idx').on(table.tenantId),
    publishedIdx: index('content_items_published_idx').on(table.tenantId, table.isPublished),
  }),
);

export type ContentItem = typeof contentItems.$inferSelect;
export type NewContentItem = typeof contentItems.$inferInsert;
