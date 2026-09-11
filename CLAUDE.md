# Reserved — engineering konvence

> Tento dokument je single source of truth pro Claude Code asistenta a tebe.
> Pravidla NEMĚNIT bez vědomé diskuze. Když se nějakému pravidlu vyhneš, vysvětli proč v PR.

---

## Stack (pevně rozhodnuto)

- **Runtime:** Node.js ≥ 22, TypeScript 5.7, ESM only
- **Backend:** NestJS 10 (REST, prefix `/api/v1`) — žádné WebSockety
- **Frontend:** Next.js 14 (App Router) — 6 apps: `web` (admin), `portal` (zákazník), `widget` (embed),
  `master` (provozovatel platformy), `marketing` (veřejný web), `tenant-site` (mini-web tenanta);
  mobilní app `apps/mobile` (Expo / React Native)
- **DB:** PostgreSQL 16 + Drizzle ORM (žádná Prisma), migrace přes drizzle journal (`pnpm db:migrate`)
- **Fronty/joby:** tabulky v Postgresu + pollery v `apps/workers` — **žádný Redis ani BullMQ**
- **Monorepo:** pnpm workspaces + Turborepo
- **Validace:** Zod na všech HTTP request handlerech (strict)
- **Testy:** Vitest — unit, DB-integrační (DB `reserved_test`) a full-stack E2E proti běžícímu API
  (`tests/e2e`). Žádný Playwright.

## Lokální porty

API 4010 · master 4001 · web 4002 · portal 4003 · widget 4004 · marketing 4005 · tenant-site 4006 ·
Postgres 5433 (DB `reserved_dev` + `reserved_test`) · Mailhog SMTP 1026 / UI 8026

## Železná pravidla

### Peníze

- **Halíře jako INTEGER**, nikdy float, nikdy `parseFloat`. 1 Kč = 100 haléřů.
- Pokud uvidíš `parseFloat(amount)` → bug. Použij `parseInt(amount, 10)`.
- DPH se počítá v **basis points** (21 % = 2100), ne v procentech přímo.

### SQL

- **Drizzle parametrizované dotazy** — žádný string concat, žádný template literal s daty.
- Když potřebuješ raw SQL, použij Drizzle `sql` helper (`sql` from `drizzle-orm`), ne `db.execute(stringConcat)`.
- **EXCLUDE constraint** na overlapping bookings — DB-úrovni double-book ochrana.

### Tenant izolace

- **VŽDY** přes `withTenantContext(db, ctx, fn)` z `@reserved/rls-multitenancy`.
- **Žádné lokální noop stuby** — viz V6 z review ticketarium/tixly. Pokud najdeš stub, nahraď.
- Defensive layer: i tak přidej `AND tenant_id = $N` do mutating queries.

### Validace vstupu

- **Zod schema** pro každý route handler s `await request.json()`.
- Šablona: `const Schema = z.object({...}); const data = Schema.parse(await req.json());`
- ESLint pravidlo: `no-unvalidated-json` (přidáme — ESLint zatím v repu není nakonfigurovaný).

### Naming

- Soubory: kebab-case (`booking-availability.service.ts`)
- TS identifikátory: camelCase pro funkce/proměnné, PascalCase pro typy/třídy
- DB sloupce: snake_case (`tenant_id`, `created_at`, `price_hellers`)
- Drizzle column aliases v `RETURNING`: `"tenantId"` (kebab → camel mapping)

### Money columns

- Vše s cenou končí na `_hellers` (CZK) nebo `_cents` (EUR/USD)
- Měna jako separátní sloupec (`currency CHAR(3)`), nikdy hardcoded `'CZK'`

### Error handling

- Custom error třídy per modul (`SlotError`, `BeautyError`, `BillingError`)
- Error code je enum string: `'SLOT_FULL' | 'HOLD_EXPIRED' | ...`
- `try/catch` jen tam, kde děláš kompenzační akci. `catch {}` = zakázáno.

### Time

- Vše v UTC v DB (`TIMESTAMPTZ`)
- Konverze na local time v UI vrstvě, ne v API
- `Date` v TS, nikdy `dayjs`/`moment`/`luxon` v core domain (jen v UI)

### Testy

- **Min. 1 test soubor per modul** ihned po napsání
- Race conditions, money math, tenant boundaries → integration testy
- Mock DB jen pro pure logic, jinak Postgres v Docker testovací DB

### Commits

- Conventional commits: `feat:`, `fix:`, `chore:`, `refactor:`, `test:`, `docs:`
- Každý commit funkční (CI green) — žádné WIP commity v `main`
- Pre-commit hook: format (prettier přes lint-staged) + typecheck + gitleaks (pokud je nainstalovaný);
  commit-msg: commitlint (header max. 100 znaků)

### Bezpečnost

- `.env*` v `.gitignore`, secrets v GitHub Secrets / Vercel env
- Pre-commit `gitleaks` scan
- `process.env.X` čteno jen v `config/` modulech, ne rozesetě po kódu
- Validace env při startu (Zod schema pro `process.env`)

---

## Struktura

```
reserved/
├── apps/
│   ├── api/          NestJS API (REST)
│   ├── web/          Admin panel (Next.js)
│   ├── portal/       Customer portal (Next.js, PWA)
│   ├── widget/       Embed booking widget (Next.js) + public/embed.js
│   ├── master/       Admin provozovatele platformy (Next.js)
│   ├── marketing/    Veřejný web (Next.js, CS/EN)
│   ├── tenant-site/  Mini-web tenanta (Next.js)
│   ├── mobile/       Klientská mobilní app (Expo)
│   └── workers/      Pollery nad Postgresem (notifikace, slot holdy, narozeniny)
├── packages/
│   ├── db/           Drizzle schema + migrations + seed
│   ├── rls-multitenancy/ Tenant kontext (RLS)
│   ├── types/        Shared DTOs, enums, branded types
│   ├── ui/           (zatím prázdný)
│   ├── rules-engine/ Rules evaluator
│   └── utils/        Shared helpers
├── tests/e2e/        Full-stack E2E testy proti běžícímu API
├── docker-compose.dev.yml  Postgres 16 (5433) + Mailhog
├── turbo.json
├── pnpm-workspace.yaml
└── tsconfig.base.json
```

## Extrakce z ticketarium / tixly

Když přenášíš modul z `ticketarium` nebo `tixly`:

1. **Code review řádek po řádku** před commitem
2. **Komentář na začátku souboru:** `// Adapted from tixly/<module>@<commit-sha> on YYYY-MM-DD`
3. **Adaptace:** Next.js `route.ts` → NestJS controller (mechanický překlad logiky služby)
4. **Schema check:** každá tabulka, kterou modul používá, musí být v `packages/db/schema/`
5. **withTenantContext audit:** žádné noop stuby, vše přes `@reserved/rls-multitenancy`
6. **Zod audit:** každý JSON request handler má Zod schema
7. **Test minimum:** ≥1 test soubor per přenesený modul, race conditions explicit

## Roadmap status

Aktuální fáze viz `reserved-docs/10_roadmap.md` (cílový blueprint).
Sprint trackováno přes GitHub Projects nebo TaskCreate.
