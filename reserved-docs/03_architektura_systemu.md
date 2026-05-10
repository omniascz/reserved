# 03 — Architektura systému (v2)

> Přepracováno po dokončení DB schematu (13a–13e), webhook handling (19),
> background jobs (18), marketplace (15) a onboarding flow (17).
> Tento dokument je jediný zdroj pravdy pro technická rozhodnutí.
> Vše co bylo "nebo" je nyní rozhodnuto.

---

## Finální technologický stack

### Proč tyto volby — jednořádkové zdůvodnění každé

| Technologie | Alternativa která prohrála | Proč vyhrálo |
|-------------|---------------------------|--------------|
| Node.js 22 + TypeScript | Python / FastAPI | Jeden jazyk přes celý stack, největší ekosystém pro SaaS |
| NestJS | Express | Strukturované moduly, DI, Guards, Interceptors — bez NestJS bychom to museli sami |
| PostgreSQL 16 | MySQL / MongoDB | JSONB, EXCLUDE constraints, RLS, tstzrange — to jinde není |
| Drizzle ORM | Prisma / TypeORM | Nejblíže SQL, plná TypeScript typesafety, funguje s raw SQL pro složité dotazy |
| Redis 7 | RabbitMQ / SQS | BullMQ na Redisu, zároveň cache a session store — jeden nástroj méně |
| BullMQ | Bull / Bee-Queue | Aktivně vyvíjeno, priority fronty, delay, repeat joby |
| Next.js 14 | Remix / Nuxt | SSR pro SEO rezervačního formuláře, App Router, React Server Components |
| Tailwind CSS | CSS Modules / styled-components | Rychlost vývoje, shadcn/ui komponenty |
| shadcn/ui | MUI / Chakra | Kopírování komponent do projektu, plná kontrola, žádný vendor lock |
| Hetzner Cloud | AWS / GCP | EU datacentra (GDPR), 3× levnější pro stejný výkon, přechod na AWS kdykoliv |
| Cloudflare | AWS CloudFront | DDoS ochrana zdarma, Workers pro edge logiku, R2 pro soubory |
| Stripe | Braintree / Adyen | Stripe Connect pro marketplace, nejlepší DX, webhooks |
| Postmark | SendGrid / SES | Nejlepší doručitelnost pro transakční emaily |
| Twilio | Vonage / MessageBird | Standard pro SMS, dobrá EU podpora |
| Sentry | Datadog / New Relic | Error tracking, performance monitoring, cenově dostupné |

---

## Monorepo struktura

```
/rezervacni-system/               ← root
│
├── apps/
│   ├── api/                      ← NestJS backend (REST API + WebSockets)
│   ├── web/                      ← Next.js admin panel
│   ├── widget/                   ← Next.js embed widget (rezervační formulář)
│   ├── portal/                   ← Next.js zákaznický portál
│   └── workers/                  ← BullMQ worker processes
│
├── packages/
│   ├── db/                       ← Drizzle schema + migrace + seed
│   ├── types/                    ← Sdílené TypeScript typy (DTOs, enums)
│   ├── ui/                       ← Sdílené UI komponenty (shadcn/ui based)
│   ├── rules-engine/             ← Rules Engine evaluátor (sdílený mezi api a workers)
│   └── utils/                    ← Sdílené utility (datum, měna, validace)
│
├── infra/                        ← Terraform + Docker Compose
│   ├── docker-compose.dev.yml
│   ├── docker-compose.prod.yml
│   └── terraform/
│
├── .github/
│   └── workflows/                ← CI/CD pipelines
│
├── pnpm-workspace.yaml
├── turbo.json                    ← Turborepo pro build orchestraci
└── package.json
```

### Proč pnpm + Turborepo

- **pnpm:** symlinky místo kopií node_modules → 3–5× méně diskového prostoru
- **Turborepo:** inteligentní cache buildů — změna v `packages/db` přebuilduje jen `api` a `workers`, ne `web`

---

## Aplikační vrstvy

```
┌─────────────────────────────────────────────────────┐
│                    KLIENTI                          │
│  Browser    Mobile    Embed Widget    External API  │
└──────────────────┬──────────────────────────────────┘
                   │ HTTPS
┌──────────────────▼──────────────────────────────────┐
│              CLOUDFLARE (Edge)                      │
│  DDoS ochrana · CDN cache · SSL termination         │
│  Rate limiting (základní) · Bot detection           │
└──────────────────┬──────────────────────────────────┘
                   │
┌──────────────────▼──────────────────────────────────┐
│              LOAD BALANCER (Hetzner LB)             │
│  Health checks · SSL passthrough · Round robin      │
└──────┬───────────────────────────────────┬──────────┘
       │                                   │
┌──────▼──────┐                   ┌────────▼────────┐
│  API Server │ ×2 (active-active)│  API Server     │
│  NestJS     │                   │  NestJS         │
│  Port 3000  │                   │  Port 3000      │
└──────┬──────┘                   └────────┬────────┘
       │                                   │
┌──────▼───────────────────────────────────▼──────────┐
│              REDIS 7 (Hetzner Managed)              │
│  Sessions · BullMQ queues · Availability cache      │
│  Slot holds TTL · Rate limit counters               │
└──────────────────────────────────────────────────────┘
       │
┌──────▼───────────────────────────────────────────────┐
│          POSTGRESQL 16 (Hetzner Managed)            │
│  Primary + 1 Read Replica                           │
│  Row Level Security · Point-in-time recovery        │
│  Automatické zálohy každých 6h                      │
└──────────────────────────────────────────────────────┘
       │
┌──────▼───────────────────────────────────────────────┐
│              WORKER SERVERS ×2                      │
│  BullMQ workers · Background jobs                   │
│  Separátní process od API                           │
└──────────────────────────────────────────────────────┘
       │
┌──────▼───────────────────────────────────────────────┐
│           CLOUDFLARE R2 (Object Storage)            │
│  Fotografie · Faktury PDF · KYC dokumenty           │
│  Šifrované at-rest · CDN distribuce                 │
└──────────────────────────────────────────────────────┘
```

---

## NestJS API — vnitřní struktura

```
apps/api/src/
│
├── main.ts                       ← Bootstrap, Swagger, global pipes
├── app.module.ts                 ← Root modul
│
├── modules/
│   ├── auth/                     ← JWT, refresh tokens, OAuth, 2FA
│   ├── tenants/                  ← Tenant management, billing, onboarding
│   ├── branches/                 ← Pobočky, areas, workspaces, resources
│   ├── users/                    ← Admin users, roles, permissions
│   ├── employees/                ← HR modul, schedules, commissions
│   ├── customers/                ← Customer profiles, groups, notes
│   ├── services/                 ← Služby, kategorie, ceníky
│   ├── availability/             ← Výpočet dostupnosti, slot holds
│   ├── bookings/                 ← Rezervace, status machine, approval
│   ├── series/                   ← Permanentky, sessions, lapse policy
│   ├── packages/                 ← Balíčky, kredity, bundle
│   ├── payments/                 ← Stripe integrace, refundy, invoices
│   ├── rules/                    ← Rules Engine, evaluátor, simulator
│   ├── notifications/            ← Templates, queue, channels
│   ├── reviews/                  ← Hodnocení, moderace
│   ├── marketplace/              ← Provider profiles, listings, disputes
│   ├── webhooks/                 ← Stripe, Twilio, Google, Zoom
│   └── reports/                  ← Analytics, export, dashboard data
│
├── common/
│   ├── guards/                   ← AuthGuard, TenantGuard, RoleGuard
│   ├── interceptors/             ← Logging, Transform, Timeout
│   ├── decorators/               ← @CurrentTenant, @CurrentUser, @Public
│   ├── filters/                  ← Global exception filter
│   ├── middleware/               ← Tenant resolution, Rate limiting
│   └── pipes/                    ← Validation, Transform
│
└── config/                       ← Environment konfigurace
```

---

## Multi-tenant architektura — jak přesně funguje

### Tenant resolution per request

Každý HTTP request prochází `TenantMiddleware` který určí tenant ze tří zdrojů v tomto pořadí:

```typescript
@Injectable()
export class TenantMiddleware implements NestMiddleware {
  async use(req: Request, res: Response, next: NextFunction) {

    let tenantId: string | null = null;

    // 1. Subdoména: salon-jana.nasedomena.cz
    const host = req.hostname;
    const subdomain = host.split('.')[0];
    if (subdomain && subdomain !== 'www' && subdomain !== 'app') {
      const tenant = await this.db.query.tenants.findFirst({
        where: eq(tenants.slug, subdomain),
      });
      tenantId = tenant?.id ?? null;
    }

    // 2. Vlastní doména: rezervace.mojefirma.cz (CNAME na naši IP)
    if (!tenantId) {
      const tenant = await this.db.query.tenants.findFirst({
        where: eq(tenants.custom_domain, host),
      });
      tenantId = tenant?.id ?? null;
    }

    // 3. Header X-Tenant-ID (pro API integrace)
    if (!tenantId) {
      tenantId = req.headers['x-tenant-id'] as string ?? null;
    }

    if (!tenantId) throw new NotFoundException('Tenant not found');

    req['tenantId'] = tenantId;
    await this.db.execute(sql`SET app.tenant_id = ${tenantId}`);

    next();
  }
}
```

### RLS — jak PostgreSQL chrání data

```sql
-- Každý dotaz automaticky filtruje dle tenant_id z session
-- Aplikace NEMUSÍ přidávat WHERE tenant_id = ? do každého dotazu
-- PostgreSQL to přidá automaticky přes RLS policy

-- Příklad: tento dotaz vrátí POUZE zákazníky aktuálního tenanta
SELECT * FROM customers;
-- Interně PostgreSQL přidá: WHERE tenant_id = current_setting('app.tenant_id')::uuid

-- Dvojitá ochrana:
-- 1. RLS policy (databázová úroveň)
-- 2. Drizzle dotazy vždy přidávají .where(eq(table.tenantId, ctx.tenantId))
```

---

## Databázová vrstva — Drizzle ORM

### Proč Drizzle místo Prisma

```typescript
// Prisma — černá skříňka, vlastní query engine (binárka)
const booking = await prisma.booking.findMany({
  where: { tenantId, status: 'confirmed' }
});

// Drizzle — vidíme SQL, plná kontrola, čistý TypeScript
const booking = await db
  .select()
  .from(bookings)
  .where(
    and(
      eq(bookings.tenantId, tenantId),
      eq(bookings.status, 'confirmed'),
      gte(bookings.startsAt, startOfDay),
    )
  )
  .orderBy(bookings.startsAt);

// Drizzle + raw SQL pro složité dotazy (availability engine)
const available = await db.execute(sql`
  SELECT * FROM availability_cache
  WHERE tenant_id = ${tenantId}
    AND date = ${date}
    AND valid_until > NOW()
`);
```

### Schema organizace v packages/db

```
packages/db/
├── src/
│   ├── schema/
│   │   ├── tenants.ts
│   │   ├── branches.ts
│   │   ├── users.ts
│   │   ├── employees.ts
│   │   ├── customers.ts
│   │   ├── services.ts
│   │   ├── bookings.ts
│   │   ├── series.ts
│   │   ├── packages.ts
│   │   ├── payments.ts
│   │   ├── rules.ts
│   │   ├── marketplace.ts
│   │   └── index.ts
│   ├── migrations/
│   ├── seed/
│   └── client.ts
└── drizzle.config.ts
```

---

## API Design

### URL struktura

```
Veřejné (bez autentizace):
GET  /api/v1/public/{slug}/services
GET  /api/v1/public/{slug}/availability?date=2026-04-10&service_id=xxx
GET  /api/v1/public/{slug}/employees
POST /api/v1/public/{slug}/holds              ← zamkni slot (slot_holds)
POST /api/v1/public/{slug}/bookings           ← vytvoř rezervaci
GET  /api/v1/public/{slug}/bookings/{token}   ← guest tracking
POST /api/v1/public/{slug}/verify-coupon

Zákaznický portál (/api/v1/customer/...):
POST /api/v1/customer/auth/login
POST /api/v1/customer/auth/magic-link
GET  /api/v1/customer/bookings
GET  /api/v1/customer/bookings/{id}
POST /api/v1/customer/bookings/{id}/cancel
POST /api/v1/customer/bookings/{id}/reschedule
POST /api/v1/customer/bookings/{id}/request-change
GET  /api/v1/customer/series
POST /api/v1/customer/series/{id}/pause
POST /api/v1/customer/series/{id}/gift-slot
GET  /api/v1/customer/packages
GET  /api/v1/customer/profile
PATCH /api/v1/customer/profile
GET  /api/v1/customer/invoices
GET  /api/v1/customer/waiting-list

Admin panel (/api/v1/admin/...):
POST /api/v1/admin/auth/login
POST /api/v1/admin/auth/refresh

/api/v1/admin/bookings
  GET    /
  POST   /
  GET    /{id}
  PATCH  /{id}
  POST   /{id}/cancel
  POST   /{id}/reschedule
  POST   /{id}/complete
  POST   /{id}/no-show
  POST   /bulk/reassign
  POST   /bulk/cancel

/api/v1/admin/series
  GET    /
  POST   /
  GET    /{id}
  PATCH  /{id}
  POST   /{id}/pause
  POST   /{id}/resume
  POST   /{id}/terminate
  GET    /{id}/sessions
  PATCH  /{id}/sessions/{sessionId}

/api/v1/admin/customers
  GET    /                          ← full-text search, filtry, tagy
  POST   /
  GET    /{id}
  PATCH  /{id}
  DELETE /{id}                      ← soft delete / GDPR
  GET    /{id}/bookings
  GET    /{id}/series
  GET    /{id}/packages
  POST   /{id}/tags
  DELETE /{id}/tags/{tag}
  POST   /{id}/notes
  POST   /{id}/assign-package

/api/v1/admin/employees
  GET    /
  POST   /
  GET    /{id}
  PATCH  /{id}
  GET    /{id}/schedule
  PATCH  /{id}/schedule
  POST   /{id}/exceptions
  GET    /{id}/performance
  GET    /{id}/commissions

/api/v1/admin/services
  GET    /
  POST   /
  GET    /{id}
  PATCH  /{id}
  DELETE /{id}

/api/v1/admin/packages
  GET    /
  POST   /
  GET    /{id}
  PATCH  /{id}

/api/v1/admin/rules
  GET    /
  POST   /
  PATCH  /{id}
  DELETE /{id}
  POST   /simulate                  ← simulátor pravidel

/api/v1/admin/branches
  GET    /
  POST   /
  PATCH  /{id}

/api/v1/admin/reports
  GET    /revenue
  GET    /bookings
  GET    /customers
  GET    /employees
  GET    /series
  POST   /export

/api/v1/admin/approval-requests
  GET    /
  POST   /{id}/approve
  POST   /{id}/reject

/api/v1/admin/settings
  GET    /
  PATCH  /
  GET    /integrations
  POST   /integrations/{provider}/connect
  DELETE /integrations/{provider}

Webhooks (příchozí — viz doc 19):
POST /webhooks/stripe
POST /webhooks/twilio/sms-status
POST /webhooks/google-calendar/{channelId}
POST /webhooks/zoom

Marketplace (/api/v1/marketplace/...):
GET  /api/v1/marketplace/search
GET  /api/v1/marketplace/categories
GET  /api/v1/marketplace/{slug}
GET  /api/v1/marketplace/{slug}/availability
POST /api/v1/marketplace/{slug}/bookings

Provider admin (/api/v1/provider/...):
GET  /api/v1/provider/profile
PATCH /api/v1/provider/profile
GET  /api/v1/provider/listings
POST /api/v1/provider/listings
GET  /api/v1/provider/payouts
GET  /api/v1/provider/disputes

Platform admin (/api/v1/platform/...):
GET  /api/v1/platform/tenants
GET  /api/v1/platform/providers
POST /api/v1/platform/providers/{id}/approve
GET  /api/v1/platform/disputes
```

### Request / Response formát

```typescript
// Standardní response envelope
interface ApiResponse<T> {
  data: T;
  meta?: {
    page: number;
    per_page: number;
    total: number;
    total_pages: number;
    cursor?: string;
  };
}

// Error response
interface ApiError {
  error: {
    code: string;        // 'SLOT_UNAVAILABLE', 'RULE_VIOLATION', 'PLAN_LIMIT'
    message: string;     // Human-readable, lokalizované
    details?: unknown;
    rule_id?: string;    // Pokud je chyba z Rules Engine
    alternatives?: SlotAlternative[];  // Pro SLOT_UNAVAILABLE
  };
}

// Paginace — cursor-based pro velké listy
GET /api/v1/admin/bookings?cursor=xxx&limit=50&sort=starts_at:asc
GET /api/v1/admin/customers?q=novak&tags=vip&limit=20
```

### Autentizace — JWT flow

```
1. Login → POST /auth/login { email, password }
   ← { access_token (15min JWT), refresh_token (30 dní, httpOnly cookie) }

2. Každý request → Authorization: Bearer {access_token}
   API ověří podpis + expiraci + tenant_id

3. Access token expiroval → POST /auth/refresh
   Server ověří refresh_token cookie
   ← { nový access_token, rotovaný refresh_token }

4. Logout → POST /auth/logout
   Server revokuje refresh_token (DELETE z user_sessions)

JWT payload:
{
  sub: user_id,
  tenant_id: uuid,
  role: 'owner' | 'manager' | 'employee' | 'receptionist',
  custom_role_id: uuid | null,
  branch_ids: uuid[],
  exp: timestamp,
  iat: timestamp
}
```

### Rate limiting

```
Cloudflare (globálně per IP):
  100 requestů / 10 sekund

API per tenant (Redis counter):
  Starter:    500 req/min
  Pro:       2 000 req/min
  Business:  5 000 req/min
  Enterprise: custom SLA

Specifické endpointy:
  POST /public/*/bookings:    20 / min per IP
  POST /public/*/holds:       30 / min per IP
  POST /auth/login:            5 / min per IP (brute force)
  POST /webhooks/*:          neomezeno (mají vlastní auth)

Response headers při 429:
  X-RateLimit-Limit: 2000
  X-RateLimit-Remaining: 0
  Retry-After: 42
```

---

## Bezpečnost

### Vrstvy

```
Vrstva 1: Cloudflare
  DDoS ochrana · Bot detection · Turnstile CAPTCHA na booking formuláři

Vrstva 2: API middleware
  JWT validace · Tenant resolution · Rate limiting per tenant

Vrstva 3: NestJS Guards (per endpoint)
  AuthGuard     → je přihlášen?
  TenantGuard   → patří resource tomuto tenantovi?
  RoleGuard     → má roli pro tuto akci?
  PermissionGuard → má custom role toto oprávnění?
  PlanGuard     → je feature dostupná na jeho plánu?

Vrstva 4: PostgreSQL RLS
  Pojistka — i kdyby Guards selhaly, DB nevrátí cizí data
```

### OWASP Top 10

| Riziko | Řešení |
|--------|--------|
| SQL Injection | Drizzle parametrizované dotazy — žádná string concatenation |
| Broken Auth | JWT rotation, httpOnly cookie, TOTP 2FA |
| Sensitive Data Exposure | TLS 1.3, AES-256 at-rest, žádná PII v logách |
| Broken Access Control | RLS + Guards na každém endpointu |
| Security Misconfiguration | Terraform IaC, žádné ruční změny na serverech |
| XSS | Next.js CSP headers, React automatický escape |
| Insecure Deserialization | Zod validace všech vstupů |
| Known Vulnerabilities | Dependabot automatické security PR |

### Vstupní validace — Zod everywhere

```typescript
// Každý DTO má Zod schema — validace před zpracováním
const CreateBookingSchema = z.object({
  service_id:   z.string().uuid(),
  employee_id:  z.string().uuid().optional(),
  starts_at:    z.string().datetime(),
  customer: z.object({
    name:  z.string().min(2).max(100),
    email: z.string().email(),
    phone: z.string().regex(/^\+?[\d\s\-()]{7,20}$/),
  }),
  notes:       z.string().max(1000).optional(),
  hold_token:  z.string().length(64),  // povinné — slot musí být zamčen
});
```

---

## Frontend — čtyři Next.js aplikace

```
1. apps/web — Admin panel
   URL: app.nasedomena.cz
   Auth: JWT admin users
   Klíčové obrazovky:
     /dashboard     ← přehled dne, KPIs
     /calendar      ← FullCalendar.js, drag & drop, WebSocket live
     /bookings      ← list, detail, bulk operace
     /customers     ← CRM, tagy, skupiny, poznámky
     /employees     ← HR modul, směny, výkon, provize
     /series        ← správa permanentek
     /services      ← katalog služeb a ceníky
     /packages      ← balíčky a bundle
     /rules         ← Rules Engine vizuální konfigurátor
     /reports       ← analytika, export
     /settings      ← branding, integrace, plán

2. apps/widget — Rezervační formulář
   URL: tenant.nasedomena.cz nebo embed na cizím webu
   Auth: žádná (veřejné)
   Embed:
     <script src="https://nasedomena.cz/widget.js"
             data-tenant="salon-jana"
             data-service="uuid">
     </script>
   Kroky:
     1. Výběr služby (pokud není předvyplněna)
     2. Výběr zaměstnance (nebo "kdokoli")
     3. Výběr data → POST /holds (zamkni slot)
     4. Kontaktní údaje + intake form
     5. Platba (Stripe Elements — pokud vyžadována)
     6. Potvrzení + add to calendar

3. apps/portal — Zákaznický portál
   URL: tenant.nasedomena.cz/muj-ucet
   Auth: customer JWT (magic link nebo heslo)
   Sekce: rezervace, série, balíčky, platby, profil, notifikace

4. apps/marketplace — Discovery
   URL: nasedomena.cz/najdi
   Auth: žádná pro browsing, customer JWT pro booking
   Sekce: search (geo + kategorie + dostupnost), profil providera, booking
```

### Real-time kalendář (WebSocket)

```typescript
// Více adminů na jedné pobočce vidí změny okamžitě
// NestJS Gateway + Socket.io

// Přihlášení k odběru při otevření kalendáře
socket.emit('subscribe:calendar', { tenantId, branchId, date });

// Server emituje při každé změně
socket.to(`calendar:${tenantId}:${branchId}:${date}`)
  .emit('booking:updated', { bookingId, changes });

// Client handler — optimistický update v React Query
socket.on('booking:updated', ({ bookingId, changes }) => {
  queryClient.setQueryData(['bookings', { date }], (old) =>
    updateBookingInList(old, { bookingId, ...changes })
  );
});
```

---

## Infrastruktura — Hetzner

### Produkční konfigurace (start)

```
2× CX31 (2 vCPU, 8GB RAM)  — API servery       ~24 EUR/měs
1× CX21 (2 vCPU, 4GB RAM)  — Worker servery    ~10 EUR/měs
1× Managed PostgreSQL       — Primary + replica ~25 EUR/měs
1× Managed Redis            — Cache + queues    ~15 EUR/měs
1× Load Balancer                                ~6 EUR/měs
Cloudflare R2 (10GB)                            ~0.15 EUR/měs
──────────────────────────────────────────────────────────
Celkem:                                         ~80 EUR/měs

Staging: ~35 EUR/měs (1 server + managed DB + Redis)
```

### Škálování

```
Do 1 000 tenantů:    Současná konfigurace
1 000–10 000:        + Read replica, větší API servery (CX41)
10 000+:             Horizontální škálování, PgBouncer, přechod AWS
```

### Docker Compose pro development

```yaml
# infra/docker-compose.dev.yml
version: '3.9'
services:
  postgres:
    image: postgres:16-alpine
    environment:
      POSTGRES_DB: reservations_dev
      POSTGRES_USER: dev
      POSTGRES_PASSWORD: dev
    ports: ["5432:5432"]
    volumes:
      - postgres_data:/var/lib/postgresql/data

  redis:
    image: redis:7-alpine
    ports: ["6379:6379"]
    command: redis-server --appendonly yes
    volumes:
      - redis_data:/data

  mailhog:
    image: mailhog/mailhog
    ports:
      - "1025:1025"   # SMTP pro lokální emaily
      - "8025:8025"   # Web UI — zachycené emaily

volumes:
  postgres_data:
  redis_data:
```

---

## CI/CD Pipeline

```yaml
# .github/workflows/ci.yml
on: [push, pull_request]

jobs:
  test:
    services:
      postgres: { image: postgres:16 }
      redis:    { image: redis:7 }
    steps:
      - pnpm install
      - pnpm db:migrate:test
      - pnpm test               ← unit testy
      - pnpm test:integration   ← API e2e testy
      - pnpm lint
      - pnpm typecheck

  deploy-staging:
    if: branch == 'develop'
    needs: test
    steps: ./scripts/deploy.sh staging

  deploy-production:
    if: branch == 'main'
    needs: test
    environment: production     ← vyžaduje manuální approval
    steps: ./scripts/deploy.sh production
```

### Database migrace — bezpečný postup

```
Pravidlo: každá migrace musí být backwards compatible.

Přejmenování sloupce = DVĚ migrace:
  Deploy 1: přidat nový sloupec, kopírovat data, aktualizovat kód
  Deploy 2: smazat starý sloupec (až ověříme že nic neprasknulo)

Nikdy: ALTER COLUMN s typem, DROP COLUMN, RENAME COLUMN v jednom deployi
```

---

## Monitoring

```
Sentry:
  Error rate per endpoint    (cíl: < 0.1 %)
  p99 latence                (cíl: < 500ms)
  Počet WebSocket connections

Hetzner + custom metrics:
  CPU, RAM, disk per server
  PostgreSQL: connections, slow queries (> 100ms), cache hit rate
  Redis: memory, evicted keys, BullMQ queue depth per fronta

Alerting — kdy dostaneme zprávu:
  Error rate > 1 %                → okamžitě
  p99 latence > 2s               → okamžitě
  BullMQ dead letter queue > 0  → okamžitě
  PostgreSQL connections > 80 % → okamžitě
  Disk > 70 %                   → okamžitě
  Webhook failed 3×             → okamžitě
  Job neběžel > 2× interval     → okamžitě
```

---

## Environment proměnné (kompletní)

```bash
NODE_ENV=production

# Database
DATABASE_URL=postgresql://user:pass@host:5432/db
DATABASE_POOL_MIN=2
DATABASE_POOL_MAX=10

# Redis
REDIS_URL=redis://host:6379

# JWT
JWT_SECRET=...256bit_random...
JWT_ACCESS_EXPIRY=15m
JWT_REFRESH_EXPIRY=30d

# Stripe
STRIPE_SECRET_KEY=sk_live_...
STRIPE_WEBHOOK_SECRET=whsec_...
STRIPE_CONNECT_CLIENT_ID=ca_...

# Email (Postmark)
POSTMARK_SERVER_TOKEN=...
EMAIL_FROM=noreply@nasedomena.cz
EMAIL_FROM_NAME=Rezervační systém

# SMS (Twilio)
TWILIO_ACCOUNT_SID=AC...
TWILIO_AUTH_TOKEN=...
TWILIO_FROM_NUMBER=+420...

# Storage (Cloudflare R2)
R2_ACCOUNT_ID=...
R2_ACCESS_KEY_ID=...
R2_SECRET_ACCESS_KEY=...
R2_BUCKET_NAME=reservations-prod
R2_PUBLIC_URL=https://files.nasedomena.cz

# Zoom
ZOOM_CLIENT_ID=...
ZOOM_CLIENT_SECRET=...
ZOOM_WEBHOOK_SECRET_TOKEN=...

# App
APP_URL=https://app.nasedomena.cz
MARKETPLACE_URL=https://nasedomena.cz

# Monitoring
SENTRY_DSN=https://...@sentry.io/...
```

---

## Co se změnilo oproti v1

| Oblast | v1 (původní) | v2 (aktuální) |
|--------|-------------|---------------|
| Tech stack | "Node.js nebo Python" | Node.js + TypeScript — finální |
| ORM | Nespecifikováno | Drizzle ORM — finální |
| Infrastruktura | "AWS nebo GCP nebo Hetzner" | Hetzner — finální, cena ~80 EUR/měs |
| Datový model | `price DECIMAL`, `user_id`, `name` | `price INTEGER`, `employee_id`, `first_name`+`last_name` |
| API endpointy | 15 základních | 60+ kompletně zdokumentováno |
| Monorepo | Nezmíněno | pnpm + Turborepo, 4 Next.js apps |
| Real-time | Nezmíněno | WebSocket Gateway, live kalendář |
| Race condition | Neřešeno | slot_holds + EXCLUDE constraint |
| Background jobs | Nezmíněno | 21 jobů, BullMQ, 4 fronty (doc 18) |
| Webhooks | Povrchně | Kompletní pro Stripe/Twilio/Google/Zoom (doc 19) |
| Marketplace | Nezmíněno | Stripe Connect, KYC, disputes (doc 15) |
| Onboarding | Nezmíněno | Wizard, drip emaily, checklist (doc 17) |
| CI/CD | Obecně | GitHub Actions, blue-green deploy |
| Monitoring | "Sentry nebo Datadog" | Sentry — finální, kompletní alerting |
