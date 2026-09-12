import {
  pgTable,
  uuid,
  varchar,
  text,
  boolean,
  jsonb,
  timestamp,
  index,
} from 'drizzle-orm/pg-core';
import { tenants } from './tenants.js';
import { services } from './services.js';

// Sprint 10.10 — intake / consent formuláře. Provozovatel definuje dotazník
// (pole), klient ho vyplní (typicky před návštěvou). Klíčové pro medical/EMS.
// fields jsonb: [{ key, label, type: text|textarea|select|checkbox|date, required, options? }].

export const intakeFieldTypes = ['text', 'textarea', 'select', 'checkbox', 'date'] as const;
export type IntakeFieldType = (typeof intakeFieldTypes)[number];

export const intakeForms = pgTable(
  'intake_forms',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    tenantId: uuid('tenant_id')
      .notNull()
      .references(() => tenants.id, { onDelete: 'cascade' }),
    name: varchar('name', { length: 200 }).notNull(),
    description: text('description'),
    /** Volitelně navázaný na službu (NULL = obecný formulář). */
    serviceId: uuid('service_id').references(() => services.id, { onDelete: 'set null' }),
    fields: jsonb('fields').notNull().default([]),
    isActive: boolean('is_active').notNull().default(true),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
    deletedAt: timestamp('deleted_at', { withTimezone: true }),
  },
  (table) => ({
    tenantIdx: index('intake_forms_tenant_idx').on(table.tenantId),
    serviceIdx: index('intake_forms_service_idx').on(table.tenantId, table.serviceId),
  }),
);

export type IntakeForm = typeof intakeForms.$inferSelect;
export type NewIntakeForm = typeof intakeForms.$inferInsert;

export const intakeSubmissions = pgTable(
  'intake_submissions',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    tenantId: uuid('tenant_id')
      .notNull()
      .references(() => tenants.id, { onDelete: 'cascade' }),
    formId: uuid('form_id')
      .notNull()
      .references(() => intakeForms.id, { onDelete: 'cascade' }),
    bookingId: uuid('booking_id'),
    customerId: uuid('customer_id'),
    customerEmail: varchar('customer_email', { length: 255 }).notNull(),
    answers: jsonb('answers').notNull().default({}),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => ({
    tenantIdx: index('intake_submissions_tenant_idx').on(table.tenantId),
    formIdx: index('intake_submissions_form_idx').on(table.formId, table.createdAt),
  }),
);

export type IntakeSubmission = typeof intakeSubmissions.$inferSelect;
export type NewIntakeSubmission = typeof intakeSubmissions.$inferInsert;
