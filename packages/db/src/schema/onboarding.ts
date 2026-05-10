import { pgTable, uuid, boolean, timestamp, jsonb, index } from 'drizzle-orm/pg-core';
import { tenants } from './tenants.js';

// Reference: reserved-docs/17_onboarding_flow.md
//
// onboarding_checklist: per-tenant flag-based progress.
// Updated event-driven (např. po vytvoření první služby), zobrazeno v admin UI.

export const onboardingChecklist = pgTable(
  'onboarding_checklist',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    tenantId: uuid('tenant_id')
      .notNull()
      .references(() => tenants.id, { onDelete: 'cascade' }),
    emailVerified: boolean('email_verified').notNull().default(false),
    firstServiceCreated: boolean('first_service_created').notNull().default(false),
    workingHoursSet: boolean('working_hours_set').notNull().default(false),
    teamInvited: boolean('team_invited').notNull().default(false),
    paymentsConnected: boolean('payments_connected').notNull().default(false),
    firstBookingReceived: boolean('first_booking_received').notNull().default(false),
    /** Volitelná surová data — události s timestampy, počítadly, atd. */
    metadata: jsonb('metadata').notNull().default({}),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
    completedAt: timestamp('completed_at', { withTimezone: true }),
  },
  (table) => ({
    tenantIdx: index('onboarding_checklist_tenant_idx').on(table.tenantId),
  }),
);

export type OnboardingChecklist = typeof onboardingChecklist.$inferSelect;
export type NewOnboardingChecklist = typeof onboardingChecklist.$inferInsert;
