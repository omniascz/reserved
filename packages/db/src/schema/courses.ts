import { pgTable, uuid, varchar, integer, text, timestamp, index } from 'drizzle-orm/pg-core';
import { tenants } from './tenants.js';
import { services } from './services.js';
import { employees } from './employees.js';
import { branches } from './branches.js';

// Kurzy (sprint 10.26): klient se přihlásí JEDNOU do série lekcí (8týdenní kurz,
// EMS program). Lekce kurzu = class_sessions s course_id; zápis = booking v každé
// lekci. Kapacita se hlídá na úrovni kurzu (max studentů).

export const courses = pgTable(
  'courses',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    tenantId: uuid('tenant_id')
      .notNull()
      .references(() => tenants.id, { onDelete: 'cascade' }),
    branchId: uuid('branch_id').references(() => branches.id, { onDelete: 'set null' }),
    serviceId: uuid('service_id')
      .notNull()
      .references(() => services.id, { onDelete: 'restrict' }),
    employeeId: uuid('employee_id').references(() => employees.id, { onDelete: 'set null' }),
    name: varchar('name', { length: 200 }).notNull(),
    description: text('description'),
    /** Max počet studentů kurzu. */
    capacity: integer('capacity').notNull(),
    priceHellers: integer('price_hellers').notNull().default(0),
    status: varchar('status', { length: 16 }).notNull().default('open'),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => ({
    tenantIdx: index('courses_tenant_idx').on(table.tenantId),
  }),
);
export type Course = typeof courses.$inferSelect;

export const courseEnrollments = pgTable(
  'course_enrollments',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    tenantId: uuid('tenant_id')
      .notNull()
      .references(() => tenants.id, { onDelete: 'cascade' }),
    courseId: uuid('course_id')
      .notNull()
      .references(() => courses.id, { onDelete: 'cascade' }),
    customerId: uuid('customer_id'),
    customerName: varchar('customer_name', { length: 200 }).notNull(),
    customerEmail: varchar('customer_email', { length: 255 }).notNull(),
    status: varchar('status', { length: 16 }).notNull().default('enrolled'),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => ({
    courseIdx: index('course_enrollments_course_idx').on(table.courseId),
  }),
);
export type CourseEnrollment = typeof courseEnrollments.$inferSelect;
