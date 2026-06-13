import {
  pgTable,
  uuid,
  varchar,
  text,
  integer,
  timestamp,
  index,
  check,
} from 'drizzle-orm/pg-core';
import { sql } from 'drizzle-orm';
import { tenants } from './tenants.js';
import { services } from './services.js';
import { employees } from './employees.js';

// Sprint 10.6 — recenze / hodnocení. Klient po návštěvě ohodnotí (1–5 + text),
// jedna recenze na rezervaci. Veřejně se zobrazuje průměr na službu/zaměstnance,
// admin může recenzi skrýt.

export const reviewStatuses = ['published', 'hidden'] as const;
export type ReviewStatus = (typeof reviewStatuses)[number];

export const reviews = pgTable(
  'reviews',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    tenantId: uuid('tenant_id')
      .notNull()
      .references(() => tenants.id, { onDelete: 'cascade' }),
    /** Rezervace, ke které se recenze váže (1 recenze na rezervaci). */
    bookingId: uuid('booking_id').notNull(),
    customerId: uuid('customer_id'),
    serviceId: uuid('service_id').references(() => services.id, { onDelete: 'set null' }),
    employeeId: uuid('employee_id').references(() => employees.id, { onDelete: 'set null' }),
    /** Hodnocení 1–5. */
    rating: integer('rating').notNull(),
    comment: text('comment'),
    status: varchar('status', { length: 32 }).notNull().default('published'),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => ({
    tenantIdx: index('reviews_tenant_idx').on(table.tenantId),
    serviceIdx: index('reviews_service_idx').on(table.tenantId, table.serviceId, table.status),
    employeeIdx: index('reviews_employee_idx').on(table.tenantId, table.employeeId, table.status),
    ratingRange: check('reviews_rating_range', sql`${table.rating} >= 1 AND ${table.rating} <= 5`),
  }),
);

export type Review = typeof reviews.$inferSelect;
export type NewReview = typeof reviews.$inferInsert;
