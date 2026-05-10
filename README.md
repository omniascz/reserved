# Reserved

Multi-tenant booking SaaS platforma. Multi-pobočka, white-label, Rules Engine.

## Stack

NestJS · Next.js 14 · PostgreSQL 16 + Drizzle · Redis 7 + BullMQ · pnpm + Turborepo

## Quickstart

```bash
# 1. Instalace
pnpm install

# 2. Spustit infrastructure
docker compose -f docker-compose.dev.yml up -d

# 3. .env.local
cp .env.example .env.local
# vygeneruj JWT_SECRET: node -e "console.log(require('crypto').randomBytes(64).toString('hex'))"

# 4. DB migrace
pnpm db:migrate
pnpm db:seed

# 5. Dev
pnpm dev
```

API běží na `http://localhost:3001`, healthcheck na `GET /health`.

Mailhog (zachycené emaily): http://localhost:8025

## Struktura

| Cesta | Účel |
|---|---|
| `apps/api` | NestJS backend (REST + WebSockets) |
| `apps/web` | Admin panel |
| `apps/widget` | Embeddable booking widget |
| `apps/portal` | Zákaznický portál |
| `apps/workers` | BullMQ background jobs |
| `packages/db` | Drizzle schema + migrace + seed |
| `packages/types` | Sdílené typy |
| `packages/ui` | Sdílené UI komponenty |
| `packages/rules-engine` | Rules evaluátor |
| `packages/utils` | Sdílené helpery |

## Konvence

Viz `CLAUDE.md` — single source of truth pro engineering pravidla.

## Roadmap

Sprint 1.1 → 4.4 dle `reserved-docs/10_roadmap.md`. Aktuálně: **Fáze 0 — Setup**.
