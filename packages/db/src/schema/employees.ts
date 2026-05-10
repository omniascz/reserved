import {
  pgTable,
  uuid,
  varchar,
  text,
  timestamp,
  integer,
  boolean,
  date,
  time,
  jsonb,
  index,
  uniqueIndex,
} from 'drizzle-orm/pg-core';
import { tenants } from './tenants.js';
import { branches } from './branches.js';
import { users } from './users.js';
import { services } from './services.js';

// Reference: reserved-docs/13b_db_schema_users_customers.md +
//            reserved-docs/05_hr_a_pobocky.md
//
// Employee = osoba poskytující službu (kadeřnice, trenér, masér, ...).
// Pozn.: může a nemusí mít login do systému (linkováno přes users.id).
// Recepční s loginem ale bez rezervací = jen `users` row, žádný `employees`.

// ─── Zaměstnanci ───────────────────────────────────────────────────────────

export const employees = pgTable(
  'employees',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    tenantId: uuid('tenant_id')
      .notNull()
      .references(() => tenants.id, { onDelete: 'cascade' }),
    /** Volitelné spojení s users (login do systému). */
    userId: uuid('user_id').references(() => users.id, { onDelete: 'set null' }),
    firstName: varchar('first_name', { length: 100 }).notNull(),
    lastName: varchar('last_name', { length: 100 }).notNull(),
    /** Veřejný display name (např. "Jana K." nebo nick). */
    displayName: varchar('display_name', { length: 200 }),
    email: varchar('email', { length: 255 }),
    phone: varchar('phone', { length: 32 }),
    /** Krátký bio pro online widget. */
    bio: text('bio'),
    /** URL k profilové fotce. */
    avatarUrl: text('avatar_url'),
    /** Hex barva pro kalendář. */
    color: varchar('color', { length: 7 }),
    /** Pozice/specializace (např. "Senior stylistka", "Trenér EMS"). */
    title: varchar('title', { length: 200 }),
    /** Má být zaměstnanec viditelný v public widgetu? */
    isPublic: boolean('is_public').notNull().default(true),
    /** Akceptuje rezervace online? Pokud ne, jen admin přiřadí ručně. */
    acceptsOnlineBookings: boolean('accepts_online_bookings').notNull().default(true),
    /** Volitelné metadata (interní poznámky, certifikace, ...). */
    metadata: jsonb('metadata').notNull().default({}),
    isActive: boolean('is_active').notNull().default(true),
    sortOrder: integer('sort_order').notNull().default(0),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
    deletedAt: timestamp('deleted_at', { withTimezone: true }),
  },
  (table) => ({
    tenantIdx: index('employees_tenant_idx').on(table.tenantId),
    userIdx: index('employees_user_idx').on(table.userId),
    activeIdx: index('employees_active_idx').on(table.tenantId, table.isActive),
  }),
);

export type Employee = typeof employees.$inferSelect;
export type NewEmployee = typeof employees.$inferInsert;

// ─── Many-to-many: zaměstnanec ↔ pobočka ──────────────────────────────────

export const employeeBranches = pgTable(
  'employee_branches',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    tenantId: uuid('tenant_id')
      .notNull()
      .references(() => tenants.id, { onDelete: 'cascade' }),
    employeeId: uuid('employee_id')
      .notNull()
      .references(() => employees.id, { onDelete: 'cascade' }),
    branchId: uuid('branch_id')
      .notNull()
      .references(() => branches.id, { onDelete: 'cascade' }),
    /** Je to hlavní/domovská pobočka zaměstnance? */
    isPrimary: boolean('is_primary').notNull().default(false),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => ({
    uniqIdx: uniqueIndex('employee_branches_uniq_idx').on(table.employeeId, table.branchId),
    tenantIdx: index('employee_branches_tenant_idx').on(table.tenantId),
  }),
);

export type EmployeeBranch = typeof employeeBranches.$inferSelect;
export type NewEmployeeBranch = typeof employeeBranches.$inferInsert;

// ─── Many-to-many: zaměstnanec ↔ služba (matice dovedností) ───────────────

export const employeeServices = pgTable(
  'employee_services',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    tenantId: uuid('tenant_id')
      .notNull()
      .references(() => tenants.id, { onDelete: 'cascade' }),
    employeeId: uuid('employee_id')
      .notNull()
      .references(() => employees.id, { onDelete: 'cascade' }),
    serviceId: uuid('service_id')
      .notNull()
      .references(() => services.id, { onDelete: 'cascade' }),
    /** Vlastní cena pro tohoto zaměstnance — přepíše services.price_hellers. */
    customPriceHellers: integer('custom_price_hellers'),
    /** Vlastní trvání pro tohoto zaměstnance — přepíše services.duration_minutes. */
    customDurationMinutes: integer('custom_duration_minutes'),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => ({
    uniqIdx: uniqueIndex('employee_services_uniq_idx').on(table.employeeId, table.serviceId),
    tenantIdx: index('employee_services_tenant_idx').on(table.tenantId),
    serviceIdx: index('employee_services_service_idx').on(table.serviceId),
  }),
);

export type EmployeeService = typeof employeeServices.$inferSelect;
export type NewEmployeeService = typeof employeeServices.$inferInsert;

// ─── Pracovní doba (recurring weekly) ──────────────────────────────────────

export const employeeWorkingHours = pgTable(
  'employee_working_hours',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    tenantId: uuid('tenant_id')
      .notNull()
      .references(() => tenants.id, { onDelete: 'cascade' }),
    employeeId: uuid('employee_id')
      .notNull()
      .references(() => employees.id, { onDelete: 'cascade' }),
    branchId: uuid('branch_id').references(() => branches.id, { onDelete: 'cascade' }),
    /** ISO weekday: 1 = pondělí, 7 = neděle. */
    dayOfWeek: integer('day_of_week').notNull(),
    /** "09:00" — začátek směny. */
    startTime: time('start_time').notNull(),
    /** "17:30" — konec směny. */
    endTime: time('end_time').notNull(),
    /** Volitelná polední pauza, např. "12:00-13:00". */
    breakStartTime: time('break_start_time'),
    breakEndTime: time('break_end_time'),
    /** Platnost od kdy (umožňuje plánovat budoucí změny). */
    validFrom: date('valid_from'),
    validUntil: date('valid_until'),
    isActive: boolean('is_active').notNull().default(true),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => ({
    tenantIdx: index('employee_working_hours_tenant_idx').on(table.tenantId),
    employeeDowIdx: index('employee_working_hours_employee_dow_idx').on(
      table.employeeId,
      table.dayOfWeek,
    ),
    branchIdx: index('employee_working_hours_branch_idx').on(table.branchId),
  }),
);

export type EmployeeWorkingHours = typeof employeeWorkingHours.$inferSelect;
export type NewEmployeeWorkingHours = typeof employeeWorkingHours.$inferInsert;

// ─── Výjimky pracovní doby (dovolená, nemoc, jednorázová úprava) ──────────

export const employeeScheduleExceptions = pgTable(
  'employee_schedule_exceptions',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    tenantId: uuid('tenant_id')
      .notNull()
      .references(() => tenants.id, { onDelete: 'cascade' }),
    employeeId: uuid('employee_id')
      .notNull()
      .references(() => employees.id, { onDelete: 'cascade' }),
    /** Type: 'vacation' | 'sickness' | 'training' | 'extra_shift' | 'time_off' */
    exceptionType: varchar('exception_type', { length: 32 }).notNull(),
    startDate: date('start_date').notNull(),
    endDate: date('end_date').notNull(),
    /** Pro extra_shift / time_off — konkrétní časové okno. */
    startTime: time('start_time'),
    endTime: time('end_time'),
    note: text('note'),
    /** Přidána výjimka byla schválena (manager workflow)? */
    status: varchar('status', { length: 32 }).notNull().default('approved'),
    requestedBy: uuid('requested_by').references(() => users.id),
    approvedBy: uuid('approved_by').references(() => users.id),
    approvedAt: timestamp('approved_at', { withTimezone: true }),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => ({
    tenantIdx: index('employee_schedule_exceptions_tenant_idx').on(table.tenantId),
    employeeRangeIdx: index('employee_schedule_exceptions_range_idx').on(
      table.employeeId,
      table.startDate,
      table.endDate,
    ),
  }),
);

export type EmployeeScheduleException = typeof employeeScheduleExceptions.$inferSelect;
export type NewEmployeeScheduleException = typeof employeeScheduleExceptions.$inferInsert;
