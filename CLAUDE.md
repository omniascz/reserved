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

## Schéma a migrace

**Zdroj pravdy o struktuře DB jsou SQL migrace** (`packages/db/drizzle/*.sql`), ne `schema/*.ts`.
Drizzle schéma a jeho snapshot popisují jen tu část, kterou drizzle umí vyjádřit.

`schema/*.ts` + baseline snapshot (`drizzle/meta/0084_snapshot.json`) obsahují sloupce, cizí klíče,
CHECK omezení, unikátní i částečné indexy. **Snapshot NEobsahuje:**

- **9 indexů patřících k EXCLUDE omezením** (`bookings_no_overlap`, `slot_holds_no_overlap`,
  `class_sessions_employee_no_overlap`, `class_sessions_resource_no_overlap`,
  `booking_resources_no_overlap`, `stays_no_overlap`, `logistics_jobs_vehicle_no_overlap`,
  `logistics_jobs_driver_no_overlap`, `table_reservation_tables_no_overlap`)
- **9 EXCLUDE omezení** samotných — ochrana proti dvojí rezervaci na úrovni DB
  (v migracích je 10 příkazů `EXCLUDE USING`, protože `bookings_no_overlap` migrace 0050 zahodí
  a vytvoří znovu jako částečný)
- **95 RLS politik** + `ENABLE/FORCE ROW LEVEL SECURITY` — izolace tenantů
- **SQL funkce `app.current_role_or_null()` a `app.current_tenant_id_or_null()`**, na kterých RLS stojí
- granty pro roli `app_user`

⚠️ **Tyhle věci žijí JEN v SQL migracích. Když někdo vygeneruje schéma podle snapshotu (např.
`drizzle-kit push` nebo „přegenerování od nuly"), tiše zmizí** — DB pak vypadá funkčně, ale
přijde o ochranu proti dvojí rezervaci i o izolaci tenantů. Nové takové objekty proto vždy
přidávej ruční SQL migrací.

**Unikátní částečné indexy vynucují byznys pravidla a nesmí zmizet:**

| Index                                    | Pravidlo                                        |
| ---------------------------------------- | ----------------------------------------------- |
| `bookings_session_customer_uniq`         | klient se do jedné lekce nepřihlásí dvakrát     |
| `bookings_session_spot_uniq`             | jedno místo v sále může mít jen jeden klient    |
| `class_session_waitlist_uniq`            | jeden e-mail je v pořadníku lekce nejvýš jednou |
| `reviews_booking_uniq`                   | jedna recenze na rezervaci                      |
| `loyalty_transactions_earn_booking_uniq` | body za rezervaci se připíšou jen jednou        |

Provozní pravidla:

- `drizzle-kit generate` musí hlásit **„No schema changes"**. Když něco vygeneruje, rozešlo se
  `schema/*.ts` se snapshotem — zkontroluj to, než cokoli commitneš.
- Nová migrace = SQL soubor + záznam v `drizzle/meta/_journal.json` (jinak ji `db:migrate` nespustí).
  ⚠️ **87 cizích klíčů má názvy vygenerované Postgresem (`*_fkey`), ne drizzle konvenci**
  (`*_tenant_id_tenants_id_fk`). Vznikly tím, že migrace zapisují `REFERENCES` přímo u sloupce.
  **Definice jsou správné** — odkazy, `ON DELETE` i cílové tabulky sedí; liší se jen jména.

Drizzle o těch jmenech neví, takže vygenerovaná migrace nad těmito tabulkami může chtít cizí
klíče **zahodit a vytvořit znovu pod jiným jménem**. Takové přejmenování je zbytečné, při běhu
drží zámky a u velkých tabulek může znamenat odstávku.

**Nikdy nespouštěj vygenerovanou migraci bez přečtení SQL.** Když obsahuje `DROP CONSTRAINT`
nebo `ADD CONSTRAINT` u cizího klíče, který se věcně nemění, příslušné příkazy z migrace smaž
(nebo FK pojmenuj ve `schema/*.ts` přes `foreignKey({ name: '…' })` tak, aby odpovídal DB).

## Lokální porty

API 4010 · master 4001 · web 4002 · portal 4003 · widget 4004 · marketing 4005 · tenant-site 4006 ·
Postgres 5433 (DB `reserved_dev` + `reserved_test`) · Mailhog SMTP 1026 / UI 8026

### PAST: `pnpm dev` po ukončení nechává běžet potomka

Ukončení `pnpm dev` (Ctrl+C, TaskStop, i kill systému při nedostatku paměti) zabije jen wrapper —
podřízený `tsx watch` (API) nebo `next dev` (frontendy) **běží dál**, drží port a drží paměť.
Projeví se to dvěma způsoby, které svádějí na špatnou stopu: nový start spadne na obsazeném portu,
nebo port naopak odpovídá, přestože „server neběží".

**Před spuštěním stacku vždy zkontroluj a zabij osiřelé procesy:**

```powershell
# co drží porty Reserved
Get-CimInstance Win32_Process -Filter "Name='node.exe'" |
  Where-Object { $_.CommandLine -like "*Code\reserved*" } |
  Select-Object ProcessId, @{n='MB';e={[math]::Round($_.WorkingSetSize/1MB)}}, CommandLine

# zabít je
Get-CimInstance Win32_Process -Filter "Name='node.exe'" |
  Where-Object { $_.CommandLine -like "*Code\reserved*" } |
  ForEach-Object { Stop-Process -Id $_.ProcessId -Force }
```

Reálný dopad (2026-09-13): šest osiřelých procesů drželo 407 MB a systém při 0,8 GB volné paměti
odstřelil všechny tři dev servery. Po úklidu byly volné 2 GB. Celý stack potřebuje ~1,2 GB
(Postgres + Mailhog 59 MB, API ~60 MB, každý Next dev server ~360–460 MB), takže **frontendy
pouštěj po jednom** — admin testy potřebují jen web (4002), widget test jen widget (4004).

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

**PAST: e2e testy musí mít TUTÉŽ databázi jako běžící API.** Skripty v `packages/db`
(`db:migrate`, `db:seed`) ani e2e testy si `.env` nenačítají — `DATABASE_URL` berou čistě
z prostředí procesu (v CI ji dodává workflow). Lokálně ji tedy musíš předat sám:

```bash
export $(grep -E '^DATABASE_URL=' apps/api/.env | xargs)
pnpm db:migrate && pnpm db:seed
pnpm turbo run test
```

Bez ní spadne rovnou `DATABASE_URL is not set`. **Horší je předat ji špatně:** e2e testy si
tenanta zakládají přes HTTP (`/auth/register`), tedy v DB běžícího API, ale některé věci
(magic-link token) zapisují přímo SQL spojením. Když každá půlka míří jinam, tenant vznikne
v jedné DB a odkaz na něj ve druhé → `violates foreign key constraint
"customer_magic_links_tenant_id_tenants_id_fk"`. Vypadá to jako regrese v kódu, ale je to
jen rozpojená databáze.

Playwright testy obrazovek (`tests/ui`) jedou samostatně přes `pnpm test:ui` a do `turbo run test`
**se schválně nechytají** — balíček nemá script `test`.

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
