import {
  pgTable,
  uuid,
  varchar,
  integer,
  text,
  timestamp,
  index,
  uniqueIndex,
} from 'drizzle-orm/pg-core';
import { tenants } from './tenants.js';

// Výzvy + leaderboard (sprint 10.38) — retenční engine pro fitness.
// Klient se zapíše do výzvy (např. „20 lekcí za měsíc"); postup se počítá
// z dokončených rezervací v okně výzvy; leaderboard = žebříček účastníků.

/** Metrika výzvy: počet dokončených lekcí / nacvičené minuty. */
export const challengeMetrics = ['attendance', 'minutes'] as const;
export type ChallengeMetric = (typeof challengeMetrics)[number];

export const challenges = pgTable(
  'challenges',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    tenantId: uuid('tenant_id')
      .notNull()
      .references(() => tenants.id, { onDelete: 'cascade' }),
    name: varchar('name', { length: 200 }).notNull(),
    description: text('description'),
    metric: varchar('metric', { length: 16 }).notNull().default('attendance'),
    /** Cíl (počet lekcí nebo minut). 0 = bez cíle, jen žebříček. */
    goal: integer('goal').notNull().default(0),
    startsAt: timestamp('starts_at', { withTimezone: true }).notNull(),
    endsAt: timestamp('ends_at', { withTimezone: true }).notNull(),
    status: varchar('status', { length: 16 }).notNull().default('active'),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => ({
    tenantIdx: index('challenges_tenant_idx').on(table.tenantId),
  }),
);
export type Challenge = typeof challenges.$inferSelect;

export const challengeParticipants = pgTable(
  'challenge_participants',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    tenantId: uuid('tenant_id')
      .notNull()
      .references(() => tenants.id, { onDelete: 'cascade' }),
    challengeId: uuid('challenge_id')
      .notNull()
      .references(() => challenges.id, { onDelete: 'cascade' }),
    customerId: uuid('customer_id'),
    customerName: varchar('customer_name', { length: 200 }).notNull(),
    customerEmail: varchar('customer_email', { length: 255 }).notNull(),
    joinedAt: timestamp('joined_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => ({
    challengeIdx: index('challenge_participants_challenge_idx').on(table.challengeId),
    uniq: uniqueIndex('challenge_participants_uniq').on(table.challengeId, table.customerEmail),
  }),
);
export type ChallengeParticipant = typeof challengeParticipants.$inferSelect;
