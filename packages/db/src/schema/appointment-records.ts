import { pgTable, uuid, varchar, text, timestamp, index } from 'drizzle-orm/pg-core';
import { tenants } from './tenants.js';

// Záznamy o návštěvě / ošetření (sprint 10.42) — odlišuje appointment služby
// (spa/fyzio/masáž/konzultace) od skupinové lekce. Praktik po návštěvě zapíše,
// co se provedlo; vzniká klinická/spa historie návštěv zákazníka.

export const appointmentRecords = pgTable(
  'appointment_records',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    tenantId: uuid('tenant_id')
      .notNull()
      .references(() => tenants.id, { onDelete: 'cascade' }),
    /** Rezervace (návštěva), ke které záznam patří. */
    bookingId: uuid('booking_id').notNull(),
    customerId: uuid('customer_id'),
    customerName: varchar('customer_name', { length: 200 }).notNull(),
    customerEmail: varchar('customer_email', { length: 255 }).notNull(),
    /** Kdo ošetření provedl. */
    employeeId: uuid('employee_id'),
    /** Co se provedlo (může vidět i klient v portálu). */
    summary: text('summary').notNull(),
    /** Interní poznámka (jen pro tým). */
    privateNote: text('private_note'),
    followUpAt: timestamp('follow_up_at', { withTimezone: true }),
    createdBy: varchar('created_by', { length: 64 }),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => ({
    tenantIdx: index('appointment_records_tenant_idx').on(table.tenantId),
    bookingIdx: index('appointment_records_booking_idx').on(table.bookingId),
    customerIdx: index('appointment_records_customer_idx').on(table.tenantId, table.customerEmail),
  }),
);
export type AppointmentRecord = typeof appointmentRecords.$inferSelect;
