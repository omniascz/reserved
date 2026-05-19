# Production Deploy Checklist

Tento dokument je **závazný checklist** před prvním produkčním nasazením
Reserved a před každým majoritním release. Cílem je nezapomenout na žádný
krok, který by mohl vést k výpadku, ztrátě dat nebo bezpečnostnímu incidentu.

> **Použití:** Před deployem projdi všechny sekce shora dolů. Pokud něco
> nemůžeš ověřit, NEVYPOUŠTĚJ a vrať se do staging.

---

## 1. Infrastruktura

### 1.1 Databáze

- [ ] **Production PostgreSQL** je vytvořená (Neon / Supabase / Railway / self-hosted)
- [ ] **Verze**: PostgreSQL ≥ 15 (RLS + JSON funkce)
- [ ] **Connection pooler** je nakonfigurovaný (PgBouncer / Supabase Pooler / Neon)
- [ ] **Automatické zálohy**: minimálně denní, retention ≥ 7 dní
- [ ] **Point-in-time recovery (PITR)** je zapnutý
- [ ] **Read replica** (volitelně pro reporty)
- [ ] DB connection string nepoužívá `postgres` superuser — vyrobit `app_user` se sníženými právy
- [ ] **RLS policies** nasazené (`packages/db/drizzle/0000_*` až poslední)
- [ ] **Migrace** spuštěné: `pnpm db:migrate` proti produkční DB
- [ ] **Plans table** seedovaná: `pnpm db:seed` (definice planů Reserved)

### 1.2 Redis (notifications + slot holds)

- [ ] **Redis instance** je dostupná (Upstash / Railway / self-hosted)
- [ ] **REDIS_URL** v env apps/workers
- [ ] **TLS/SSL** zapnut (Upstash default)
- [ ] **Persistence** zapnutý (AOF nebo RDB — workers data nesmí zmizet)

### 1.3 Email (SMTP)

- [ ] **SMTP provider** vybraný a nakonfigurovaný (Resend / SendGrid / Postmark / Mailgun)
- [ ] **SMTP_HOST**, **SMTP_PORT**, **SMTP_USER**, **SMTP_PASS** v env
- [ ] **SPF + DKIM + DMARC** záznamy v DNS pro `reserved.cz` (a custom domény tenantů)
- [ ] **From address** ověřena: `noreply@reserved.cz`
- [ ] Test email odeslán a doručen do schránky **bez spam folderu**

### 1.4 SMS (BulkGate)

- [ ] **BULKGATE_APPLICATION_ID** + **BULKGATE_APPLICATION_TOKEN** v env
- [ ] **Sender** ID schválené (kratky kód nebo alphanumeric)
- [ ] Test SMS na české číslo proběhla

### 1.5 Stripe (platform billing)

- [ ] **Stripe účet** přepnut z TEST na LIVE
- [ ] **STRIPE_SECRET_KEY** (live: `sk_live_…`) v env
- [ ] **STRIPE_WEBHOOK_SECRET** (live, ne test!) v env
- [ ] **Plans** v Stripe nakonfigurované: Starter, Professional, Business (3 prices)
- [ ] **Stripe webhook** namířený na `https://api.reserved.cz/api/v1/platform/webhooks/stripe`
- [ ] Webhook events: `customer.subscription.*`, `invoice.payment_succeeded`, `invoice.payment_failed`
- [ ] **Tax** nastavení (DPH 21 % pro CZ, reverse charge pro EU B2B)

---

## 2. Secrets a env proměnné

### 2.1 Backend (apps/api)

```
NODE_ENV=production
API_PORT=4000
APP_URL=https://app.reserved.cz

DATABASE_APP_URL=postgresql://app_user:***@host/reserved
DATABASE_ADMIN_URL=postgresql://admin:***@host/reserved

JWT_SECRET=<64+ hex znaků, generuj přes `openssl rand -hex 32`>
JWT_ACCESS_EXPIRES_IN=900       # 15 min
JWT_REFRESH_EXPIRES_IN=2592000  # 30 dní

REDIS_URL=rediss://default:***@host:6379

SMTP_HOST=smtp.resend.com
SMTP_PORT=465
SMTP_USER=resend
SMTP_PASS=***
SMTP_FROM=noreply@reserved.cz

BULKGATE_APPLICATION_ID=***
BULKGATE_APPLICATION_TOKEN=***

STRIPE_SECRET_KEY=sk_live_***
STRIPE_WEBHOOK_SECRET=whsec_***

SENTRY_DSN=https://***@sentry.io/***
GIT_SHA=<aktuální commit SHA — z CI>
```

- [ ] Žádné `***` nejsou hardcodované — všechno přes secrets manager (Vercel Env / Railway Secrets / 1Password)
- [ ] `.env` soubory NEJSOU v gitu (`.gitignore` ověřit)

### 2.2 Frontend apps (apps/master, web, portal, widget, marketing)

```
NEXT_PUBLIC_API_URL=https://api.reserved.cz/api/v1
NEXT_PUBLIC_APP_URL=https://app.reserved.cz
SENTRY_DSN=https://***@sentry.io/***   # server-side init
NEXT_PUBLIC_SENTRY_DSN=...             # client-side init (volitelně, jiný DSN)
```

- [ ] **NEXT_PUBLIC_** prefix jen pro hodnoty, které mohou být public (URLs, ne API klíče)

---

## 3. DNS a SSL

- [ ] **A/AAAA záznamy** pro:
  - `reserved.cz` → marketing
  - `app.reserved.cz` → tenant admin (apps/web)
  - `portal.reserved.cz` → customer portal (apps/portal)
  - `api.reserved.cz` → backend (apps/api)
  - `master.reserved.cz` → platform admin (apps/master)
  - `widget.reserved.cz` → embed widget (apps/widget)
- [ ] **Wildcard** `*.reserved.cz` pro tenant subdomény (`<slug>.reserved.cz`)
- [ ] **SSL certifikáty** vystavené (Let's Encrypt / Cloudflare / Vercel auto)
- [ ] **HTTPS redirect** na všech subdoménách
- [ ] **HSTS header** s `max-age=31536000; includeSubDomains; preload`

---

## 4. Bezpečnost

- [ ] **JWT_SECRET** je 64+ znaků, generován kryptograficky (`openssl rand -hex 32`)
- [ ] **CORS** v `apps/api/src/main.ts` omezen na produkční doménu (ne `origin: true`)
- [ ] **Rate limiting** nakonfigurovaný v `ThrottlerModule` (60/min + 5000/h default)
- [ ] **Helmet middleware** aktivní (CSP, X-Frame-Options, atd.)
- [ ] **DB user** `app_user` má jen `SELECT/INSERT/UPDATE/DELETE` na tabulky tenantů, žádné `DROP`/`CREATE`
- [ ] **Stripe webhook signature** verifikace zapnutá
- [ ] **Logy** neobsahují PII (emails, jména) — projít `console.log` v kódu
- [ ] **Sentry beforeSend** sanitizuje tokens z URL (viz `apps/api/src/sentry.ts`)

---

## 5. Monitorování

- [ ] **Sentry projekt** vytvořen pro každou app (api, master, web, portal, widget, marketing)
- [ ] **SENTRY_DSN** v env pro každou app
- [ ] **Uptime monitor** (UptimeRobot / BetterStack):
  - `https://api.reserved.cz/api/v1/health` — liveness (každou 1 min)
  - `https://api.reserved.cz/api/v1/health/ready` — readiness (každých 5 min)
  - `https://reserved.cz` — marketing
- [ ] **Alerts** nastavené:
  - Sentry: email na 1. error v produkci
  - Uptime: SMS/email po 3 minutách downtime
- [ ] **Logs**: agregace přes Vercel Logs / Railway Logs / Logtail

---

## 6. Workers (apps/workers)

- [ ] **Workers process** běží jako separátní deployment (ne v apps/api kontejneru)
- [ ] **Notification poller** běží: zpracovává `notifications` table
- [ ] **Slot holds expiration** worker běží: maže expirované holds
- [ ] **Restart policy**: `always` (Railway / systemd)
- [ ] **Healthcheck**: workers logují každých 5 min "heartbeat"

---

## 7. CI/CD

- [ ] **GitHub Actions** workflow `e2e-smoke.yml` aktivní (viz `.github/workflows/`)
- [ ] **Branch protection** na `main`: vyžaduje passing CI + 1 review
- [ ] **Deploy** spouštěn jen z `main` (ne z feature branches)
- [ ] **Rollback strategie**: Vercel/Railway umožňuje 1-click revert na předchozí deploy
- [ ] **Migrace** spouštěné automaticky před deploy API (pre-deploy hook)

---

## 8. Compliance (GDPR, CZ legislativa)

- [ ] **Zpracovatelská smlouva** s každým subdodavatelem (Stripe, BulkGate, SMTP provider, DB hosting, Sentry)
- [ ] **Zásady ochrany osobních údajů** publikované na `/gdpr`
- [ ] **VOP** (všeobecné obchodní podmínky) publikované na `/podminky`
- [ ] **Cookie consent banner** na marketing webu (CookieFirst / Cookiebot / custom)
- [ ] **Data export** endpoint pro klienty (GDPR Article 20) — `/admin/gdpr/export`
- [ ] **Data erasure** endpoint pro klienty (GDPR Article 17) — `/admin/gdpr/delete-customer`
- [ ] **Audit log** zapnut: zaznamenává approval citlivých akcí (delete, GDPR requests)

---

## 9. Provozní

- [ ] **status.reserved.cz** stránka funguje (BetterStack Status / Atlassian Statuspage)
- [ ] **Documentation**: README, ARCHITECTURE.md aktuální
- [ ] **On-call rotace** definovaná (alespoň 1 pohotovostní kontakt)
- [ ] **Incident response playbook** napsaný
- [ ] **Backup restore** procvičený alespoň jednou (zkusit obnovit z včerejší zálohy do staging DB)

---

## 10. První produkční deploy

Po splnění všech bodů 1–9:

1. [ ] **Code freeze** — žádné nové merges do main
2. [ ] **Final E2E smoke test** proti staging
3. [ ] **Migrace** proti produkční DB (mimo špičku, ideálně mezi 2–5 ráno)
4. [ ] **Deploy backend** (apps/api + apps/workers)
5. [ ] **Smoke test produkce**: `API_URL=https://api.reserved.cz/api/v1 pnpm --filter @reserved/e2e test`
6. [ ] **Deploy frontend apps** (master, web, portal, widget, marketing)
7. [ ] **Manuální test**: registrace → vytvoření služby → veřejný booking
8. [ ] **Sledování Sentry + uptime** první 30 minut
9. [ ] **Oznámení** týmu o úspěšném deployi

---

## Když něco selže

- **DB migrace selhala**: PITR restore na čas před migrací, pak debug
- **API nestartuje**: rollback předchozího deployu, zkontroluj env vars
- **5xx errors po deployi**: rollback, Sentry pro identifikaci, fix v dev
- **Workers nepracují**: zkontroluj REDIS_URL, restart workers process
- **Customer reports problem**: zkontroluj impersonation v master adminu, pak Sentry trace

Pro každý incident sepsat **post-mortem** do `reserved-docs/incidents/` se sekcemi:
- Co se stalo
- Kdo to detekoval (alert / customer)
- Časová osa
- Root cause
- Fix
- Co změníme, aby se to nestalo znovu
