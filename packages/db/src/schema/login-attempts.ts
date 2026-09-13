import { pgTable, uuid, varchar, text, timestamp, index } from 'drizzle-orm/pg-core';
import { tenants } from './tenants.js';
import { users } from './users.js';

// Evidence NEÚSPĚŠNÝCH přihlášení do administrace + podklad pro dočasné
// uzamčení účtu.
//
// ── PROČ VLASTNÍ TABULKA, A NE STÁVAJÍCÍ ───────────────────────────────────
//   - `user_sessions` vzniká až PO úspěšném přihlášení — neúspěch tam nemá kam,
//   - `notifications` je fronta pošty,
//   - `platform_admin_actions` je audit master adminů, mimo tenanta,
//   - a hlavně: pokus je nutné zaznamenat i pro E-MAIL, KTERÝ NEEXISTUJE
//     (překlep, zkoušení adres). Sloupec na `users` to z principu neřeší,
//     protože takový uživatel žádný řádek nemá.
//
// ── PROČ SE ZÁMEK NEUKLÁDÁ JAKO PŘÍZNAK ────────────────────────────────────
// Zámek se POČÍTÁ z těchto řádků (počet nevyřešených pokusů v okně). Kdyby se
// vedle toho ukládal příznak `locked_until` na uživatele, byly by dva zdroje
// pravdy, které se můžou rozejít — a zámek by navíc musel někdo aktivně
// odemykat. Takhle vyprší sám. Stejný princip jako vypočtený stav permanentky.
//
// ── ÚKLID ──────────────────────────────────────────────────────────────────
// Bez úklidu by tabulka rostla donekonečna (útok na jeden účet = tisíce řádků).
// Maže ji poller `auth-cleanup` po 30 dnech — viz apps/workers.

export const loginAttempts = pgTable(
  'login_attempts',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    tenantId: uuid('tenant_id')
      .notNull()
      .references(() => tenants.id, { onDelete: 'cascade' }),
    /**
     * Zadaný e-mail, vždy malými písmeny. NENÍ to cizí klíč — schválně:
     * evidujeme i pokusy na adresy, které v systému neexistují.
     */
    email: varchar('email', { length: 255 }).notNull(),
    /** Vyplněno jen když e-mail odpovídal existujícímu účtu. */
    userId: uuid('user_id').references(() => users.id, { onDelete: 'set null' }),
    /** IP je jen pro audit — zámek se podle ní NEŘÍDÍ, jinak by šel obejít. */
    ipAddress: varchar('ip_address', { length: 45 }),
    userAgent: text('user_agent'),
    /** 'bad_password' | 'unknown_user' | 'inactive_user' */
    reason: varchar('reason', { length: 32 }).notNull().default('bad_password'),
    /**
     * Vyplní se, když pokus přestane počítat do zámku: po úspěšném přihlášení
     * nebo po ručním odemčení. Řádek zůstává kvůli auditu, ale už nezamyká.
     */
    resolvedAt: timestamp('resolved_at', { withTimezone: true }),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => ({
    /** Hlavní dotaz: počet nevyřešených pokusů pro (tenant, e-mail) v okně. */
    lookupIdx: index('login_attempts_lookup_idx').on(
      table.tenantId,
      table.email,
      table.resolvedAt,
      table.createdAt,
    ),
    /** Pro úklid starých záznamů pollerem. */
    cleanupIdx: index('login_attempts_created_idx').on(table.createdAt),
  }),
);

export type LoginAttempt = typeof loginAttempts.$inferSelect;
export type NewLoginAttempt = typeof loginAttempts.$inferInsert;
