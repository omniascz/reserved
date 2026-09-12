# Reserved

Multi-tenant rezervační SaaS platforma. Multi-pobočka, white-label, Rules Engine.

## Stack

NestJS 10 · Next.js 14 · Expo (mobilní app) · PostgreSQL 16 + Drizzle · pnpm + Turborepo · Vitest

Fronty a joby běží přes tabulky v Postgresu a pollery v `apps/workers` — **Redis se nepoužívá**.
Engineering pravidla: [`CLAUDE.md`](CLAUDE.md).

## Porty (lokálně)

| Služba                   | Port / URL                                                           |
| ------------------------ | -------------------------------------------------------------------- |
| API                      | http://localhost:4010 (health `/api/v1/health`, Swagger `/api-docs`) |
| master (admin platformy) | http://localhost:4001                                                |
| web (admin tenanta)      | http://localhost:4002                                                |
| portal (zákazník)        | http://localhost:4003                                                |
| widget                   | http://localhost:4004                                                |
| marketing                | http://localhost:4005                                                |
| tenant-site (mini-web)   | http://localhost:4006                                                |
| Postgres (docker)        | localhost:5433 — DB `reserved_dev` a `reserved_test`                 |
| Mailhog (docker)         | SMTP 1026, UI http://localhost:8026                                  |

## Lokální spuštění od nuly

Požadavky: Node ≥ 22, pnpm 10.33 (`corepack enable`), Docker.

```bash
# 1. Závislosti
pnpm install

# 2. Infrastruktura: Postgres 16 (port 5433) + Mailhog.
#    Při prvním startu volume se vytvoří i testovací DB reserved_test.
docker compose -f docker-compose.dev.yml up -d

# 3. Env soubory ze šablon (JWT_SECRET v apps/api/.env změň na náhodný řetězec ≥ 32 znaků)
cp .env.example apps/api/.env
cp apps/workers/.env.example apps/workers/.env
for a in web portal widget master marketing tenant-site; do cp apps/$a/.env.example apps/$a/.env.local; done

# 4. Databáze — prázdná DB → všech 85 migrací jedním příkazem, pak demo data.
#    DB skripty čtou DATABASE_URL z prostředí (nastav jednou za terminál):
export DATABASE_URL=postgresql://dev:dev@localhost:5433/reserved_dev
#    PowerShell: $env:DATABASE_URL = "postgresql://dev:dev@localhost:5433/reserved_dev"
pnpm db:migrate
pnpm db:seed          # tenant "demo", admin admin@demo.local / admin123

# volitelné další seedy
pnpm --filter @reserved/db exec tsx src/seed-demo-customer.ts   # zákazník portálu jan@demo.local / heslo123
pnpm --filter @reserved/db exec tsx src/seed-platform-plans.ts  # tarify Reserved
pnpm --filter @reserved/db exec tsx src/seed-platform-admin.ts  # master admin (PLATFORM_ADMIN_* env)

# 5. Vývoj — API + workers + všechny frontendy
pnpm dev
```

Admin tenanta běží na http://localhost:4002 (v dev režimu se automaticky přihlásí demo admin).
Při volání API mimo aplikace pošli hlavičku `X-Tenant-ID: demo` (localhost neumí subdomény).

## Testy

Testy nikdy nesahají na `reserved_dev` — používají samostatnou DB `reserved_test`.

```bash
# jednou: migrace testovací DB
DATABASE_URL=postgresql://dev:dev@localhost:5433/reserved_test pnpm db:migrate

# terminál 1: API napojené na testovací DB
#   (některé testy volají běžící API na http://localhost:4010)
cd apps/api
DATABASE_URL=postgresql://dev:dev@localhost:5433/reserved_test \
DATABASE_APP_URL=postgresql://app_user:app@localhost:5433/reserved_test pnpm dev

# terminál 2: všechny testy (unit, DB-integrační, tests/e2e)
pnpm test
```

PowerShell: proměnné nastav přes `$env:DATABASE_URL = "..."` a `$env:DATABASE_APP_URL = "..."`
před `pnpm dev`. Výchozí hodnoty v testech už míří na `localhost:5433/reserved_test` a API
`http://localhost:4010/api/v1`; přes `DATABASE_URL` / `API_URL` je lze přepsat.

## CI

GitHub Actions na push do `main` a na každý PR do `main`:

- **CI** (`.github/workflows/ci.yml`): install → typecheck → build → migrace prázdné DB →
  start API → testy všech balíčků kromě e2e.
- **E2E Smoke** (`.github/workflows/e2e-smoke.yml`): migrace → start API → `tests/e2e`.

## Migrace

- SQL migrace: `packages/db/drizzle/*.sql`, pořadí určuje `drizzle/meta/_journal.json`.
- `pnpm db:migrate` = drizzle migrator (běží v jedné transakci; při chybě se nic nezapíše).
- Nová migrace musí mít záznam v journalu — jinak ji `db:migrate` nespustí.

## Struktura

| Cesta                       | Účel                                                        |
| --------------------------- | ----------------------------------------------------------- |
| `apps/api`                  | NestJS backend (REST, `/api/v1`)                            |
| `apps/web`                  | Admin tenanta                                               |
| `apps/portal`               | Zákaznický portál (PWA)                                     |
| `apps/widget`               | Vkládací rezervační widget + `public/embed.js`              |
| `apps/master`               | Admin provozovatele platformy                               |
| `apps/marketing`            | Veřejný web (CS/EN)                                         |
| `apps/tenant-site`          | Mini-web tenanta na vlastní doméně                          |
| `apps/mobile`               | Klientská mobilní app (Expo) — viz její README              |
| `apps/workers`              | Pollery nad Postgresem (notifikace, slot holdy, narozeniny) |
| `packages/db`               | Drizzle schema + migrace + seedy                            |
| `packages/rls-multitenancy` | Tenant kontext pro RLS                                      |
| `packages/rules-engine`     | Rules evaluátor                                             |
| `packages/types`            | Sdílené typy                                                |
| `packages/utils`            | Sdílené helpery                                             |
| `packages/ui`               | (zatím prázdný)                                             |
| `tests/e2e`                 | Full-stack E2E testy proti běžícímu API                     |
| `wordpress-plugin`          | WordPress plugin s widgetem                                 |

## Známá omezení

- ESLint není nakonfigurovaný (`pnpm lint` neprojde) — v CI se lint nespouští.
- Balíčky `@reserved/*` se konzumují jako sestavený `dist`, takže před vývojem musí být
  jednou sestavené. `pnpm dev` i `pnpm test` to řeší samy (turbo staví závislosti předem);
  po ruční změně balíčku spusť `pnpm build --filter=@reserved/<balíček>`.
- Produkční běh API: `pnpm --filter @reserved/api build && pnpm --filter @reserved/api start`
  (= `node dist/main.js`, čistý Node bez `tsx`).
