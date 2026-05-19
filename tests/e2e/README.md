# Reserved — E2E Smoke Testy

Tento balíček obsahuje **end-to-end testy kritické cesty** pro Reserved API.
Cíl: rychlý health check celého systému před nasazením do produkce.

## Co testy ověřují

1. **Health endpointy** — `/health` (liveness) + `/health/ready` (readiness s DB)
2. **Registrace tenanta** — nový tenant + owner přes `POST /auth/register`
3. **Duplicita slugu** — server vrátí 409, pokud slug existuje
4. **Vytvoření služby** — autentizovaný admin endpoint `POST /admin/services`
5. **Veřejný widget** — anonymous read přes `GET /public/:slug/services`

## Spuštění

```bash
# 1. Spustit API
pnpm --filter @reserved/api dev

# 2. V druhém terminálu spustit E2E
pnpm --filter @reserved/e2e test
```

## Konfigurace

| Env proměnná | Default                        | Účel             |
| ------------ | ------------------------------ | ---------------- |
| `API_URL`    | `http://localhost:4000/api/v1` | Base URL pro API |

Pro test proti staging serveru:

```bash
API_URL=https://api-staging.reserved.cz/api/v1 pnpm --filter @reserved/e2e test
```

## Side effects

Každý běh vytvoří **nový tenant** se slugem `e2e-<timestamp>-<rand>` a emailem
`e2e-<timestamp>-<rand>@e2e.local`. Tenanti zůstávají v DB.

Pro produkční smoke testy doporučujeme buď:

- Periodické čištění DB záznamů s slugem `e2e-*`
- Master admin sotf-delete přes `/platform/tenants/:id`

## CI integrace

Test se spouští v GitHub Actions před každým mergem do `main`
(viz `.github/workflows/e2e-smoke.yml`).
