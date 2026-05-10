# 16 — Audit dokumentace: Mezery, Nekonzistence, Připravenost

> Systematická revize všech 15 dokumentů.
> Výsledek: co chybí, co si navzájem odporuje, co musíme rozhodnout před prvním řádkem kódu.

---

## ČÁST A — Co logicky chybí

### A1. Chybí: Onboarding flow pro nového tenanta

Víme jak systém funguje po spuštění. Nevíme jak se tenant dostane od "registrace" do "první rezervace přijata". Tohle je kritická cesta — většina SaaS produktů tady ztrácí zákazníky.

**Co konkrétně chybí:**
- Registrační formulář: co se ptáme? (název, typ business, country, počet zaměstnanců)
- Email verification flow (double opt-in)
- Guided setup wizard: 5 kroků (přidat službu → přidat zaměstnance → nastavit pracovní dobu → nastavit branding → sdílet link)
- Trial aktivace: co je dostupné bez platební karty?
- První booking test: systém by měl provést admina přes "zkus si rezervaci jako zákazník"
- Onboarding e-mailová sekvence (D0, D3, D7, D14)
- "Aha moment" metrika: co je ten moment kdy zákazník pochopí hodnotu?

**Dopad:** Bez tohoto dokument 10 (roadmap) říká "spustit první zákazníky" ale neříká jak.

---

### A2. Chybí: API dokumentace (OpenAPI spec)

Dokument 03 má seznam endpointů ale chybí:
- Request/response schemas (co přesně posíláme a dostáváme)
- Error kódy a jejich formát
- Paginace (jak funguje pro listy)
- Filtering a sorting parametry
- Rate limiting headers
- Webhook payload schemas
- Versioning strategie (co se stane s v1 když vydáme v2)

**Dopad:** Vývojář frontend nemůže začít pracovat bez tohoto. Je to blocker pro fázi 1.

---

### A3. Chybí: Email šablony — obsah a struktura

Dokument 07 a 13e mají `notification_templates` tabulku. Ale chybí:
- Jaké proměnné jsou dostupné v každé šabloně
- Výchozí HTML šablony (aspoň wireframe)
- Transactional vs. marketing email pravidla
- Unsubscribe mechanismus (CAN-SPAM, GDPR)
- Bounce handling (co se stane když email nedojde)
- Email preview pro různé klienty (Gmail, Outlook, Apple Mail)

---

### A4. Chybí: Platební webhook handling

Stripe odesílá webhooks pro desítky událostí. Nevíme jak je zpracováváme:
- `payment_intent.succeeded` → potvrdit rezervaci
- `payment_intent.payment_failed` → co se stane s rezervací?
- `charge.dispute.created` → automatická akce nebo manuální?
- `customer.subscription.deleted` → okamžité ukončení nebo grace period?
- `invoice.payment_failed` pro subscription → kolik retry, pak co?

**Kritické:** Idempotency — webhook může přijít dvakrát. Musíme mít `webhook_events` tabulku s deduplication.

```sql
-- Chybí tabulka:
CREATE TABLE webhook_events (
  id              UUID PRIMARY KEY,
  provider        VARCHAR(20) NOT NULL,  -- 'stripe', 'twilio'
  event_id        VARCHAR(255) NOT NULL UNIQUE,  -- provider's ID
  event_type      VARCHAR(100) NOT NULL,
  payload         JSONB NOT NULL,
  processed       BOOLEAN NOT NULL DEFAULT FALSE,
  processed_at    TIMESTAMPTZ,
  error           TEXT,
  received_at     TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
```

---

### A5. Chybí: Background jobs definice

Systém potřebuje desítky pravidelně běžících jobů. Nikde nejsou vyjmenovány:

| Job | Frekvence | Co dělá |
|-----|-----------|---------|
| release_expired_holds | každých 60s | Uvolní expirované slot holds |
| send_reminders | každých 5 min | Pošle připomínky dle nastavení |
| generate_series_bookings | každou noc | Generuje rezervace z permanentek na příštích X dní |
| check_series_expiry | každou noc | Upozorní na expirující série |
| calculate_risk_scores | každou noc | Přepočítá risk score zákazníků |
| sync_google_calendar | každých 15 min | Obousměrný sync kalendáře |
| process_subscription_renewals | každou noc | Stripe billing pro subscriptions |
| send_marketing_emails | každou hodinu | Churn detekce, reaktivační kampaně |
| update_provider_rankings | každou noc | Přepočítá marketplace search rank |
| archive_old_data | jednou týdně | GDPR retention policy |
| generate_invoices | jednou denně | Fakturace za dokončené rezervace |
| payout_providers | dle plánu | Marketplace výplaty |
| invalidate_stale_cache | každých 30 min | Availability cache cleanup |

---

### A6. Chybí: State machine pro každý hlavní objekt

Víme jaké stavy existují (booking_status, series_status atd.) ale nemáme explicitně definované:
- Povolené přechody (z A do B smí jen za podmínky C)
- Kdo může který přechod spustit
- Co se automaticky spustí při přechodu

Příklad který chybí:
```
booking: confirmed → cancelled
  Povolil: customer_self (pokud Rules Engine dovolí)
           admin (vždy)
           system (při payment_failed)
  Spustí:  notification_queue.insert(cancellation_email)
           payment.refund (pokud deposit)
           slot_holds.release (pokud existuje)
           waiting_list.notify (pokud někdo čeká)
           series_session.update_status (pokud je součástí série)
           audit_log.insert
```

---

### A7. Chybí: Tenant billing & subscription management

Dokument 09 má cenové plány ale chybí technická implementace:
- Jak se tenant přihlásí k plánu (Stripe Billing)
- Co se stane po vypršení trial (grace period? okamžité zablokování?)
- Upgrade/downgrade flow (prorátkování, co se stane s daty nad limitem)
- Invoice pro tenanta (ne pro zákazníka tenanta — to máme)
- Dunning management (platba selhala → retry → suspend → cancel)
- Usage-based billing (SMS, extra zaměstnanci nad limit)

```sql
-- Chybí tabulky:
CREATE TABLE tenant_subscriptions (
  id                    UUID PRIMARY KEY,
  tenant_id             UUID NOT NULL REFERENCES tenants(id),
  plan                  plan_type NOT NULL,
  stripe_subscription_id VARCHAR(255) UNIQUE,
  stripe_customer_id    VARCHAR(255),
  status                VARCHAR(20) NOT NULL,
  current_period_start  TIMESTAMPTZ,
  current_period_end    TIMESTAMPTZ,
  cancel_at_period_end  BOOLEAN DEFAULT FALSE,
  cancelled_at          TIMESTAMPTZ,
  trial_end             TIMESTAMPTZ,
  created_at            TIMESTAMPTZ DEFAULT NOW()
);

CREATE TABLE tenant_usage (
  id                    UUID PRIMARY KEY,
  tenant_id             UUID NOT NULL,
  period_month          INTEGER NOT NULL,  -- YYYYMM
  employees_count       INTEGER DEFAULT 0,
  branches_count        INTEGER DEFAULT 0,
  bookings_count        INTEGER DEFAULT 0,
  sms_sent              INTEGER DEFAULT 0,
  api_calls             INTEGER DEFAULT 0,
  storage_mb            INTEGER DEFAULT 0,
  updated_at            TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE(tenant_id, period_month)
);
```

---

### A8. Chybí: Feature flags systém

Dokumenty předpokládají že funkce jsou buď zapnuté nebo ne (dle plánu). Ale v realitě potřebujeme:
- Postupné rollout nových featur (5% tenantů → 20% → 100%)
- A/B testing pro onboarding
- Funkce zapnuté pro konkrétní tenanta (beta přístup)
- Kill switch pro nefunkční feature v produkci

```sql
CREATE TABLE feature_flags (
  id          UUID PRIMARY KEY,
  key         VARCHAR(100) NOT NULL UNIQUE,
  description TEXT,
  enabled_globally BOOLEAN DEFAULT FALSE,
  enabled_for_tenant_ids UUID[],
  enabled_for_plans plan_type[],
  rollout_percent SMALLINT DEFAULT 0,  -- 0-100
  created_at  TIMESTAMPTZ DEFAULT NOW(),
  updated_at  TIMESTAMPTZ DEFAULT NOW()
);
```

---

### A9. Chybí: Rate limiting definice

Dokument 03 zmiňuje rate limiting ale nespecifikuje:
- Kolik requestů per minute/hour per tenant
- Kolik per IP pro veřejné endpointy
- Jak se projeví překročení (429 s Retry-After headerem)
- Whitelist pro vlastní IP (enterprise)
- Separátní limity pro webhooks vs. API

---

### A10. Chybí: Lokalizace (i18n) implementace

Plánujeme CS, SK, EN, DE, PL. Ale chybí:
- Jak jsou překlady uloženy (DB nebo soubory)
- Pluralizace (1 rezervace, 2 rezervace, 5 rezervací)
- Formáty dat per locale (DD.MM.YYYY vs MM/DD/YYYY)
- RTL support (pokud expandujeme na Blízký východ)
- Překlad notifikačních šablon (každý tenant v jiném jazyce)

---

### A11. Chybí: Search & filtering pro admin

Admin potřebuje v kalendáři a listinch filtrovat. Nikde není definováno:
- Jak funguje search zákazníků (fuzzy search, překlepy)
- Filtering rezervací: dle stavu, zaměstnance, pobočky, data, služby, zdroje
- Sorting ve všech listech
- Uložené filtry / pohledy (admin si uloží "moje dnešní rezervace")
- Export výsledků (CSV, PDF)

---

### A12. Chybí: Marketplace — konkrétní provider journey

Dokument 15 má DB schema ale chybí business flow:
- Jak provider nastaví svůj marketplace profil
- Jak zákazník marketplace prochází a rezervuje
- Co dostane zákazník po marketplace rezervaci vs. přímé rezervaci
- Jak provider vidí marketplace rezervace vs. přímé
- Jak se provize zobrazuje providerovi v reportu
- Dispute resolution workflow krok po kroku

---

## ČÁST B — Nekonzistence mezi dokumenty

### B1. Dokument 03 vs. 13a–13e — Starý datový model

Dokument 03 (architektura) má zjednodušený datový model z rané fáze projektu. Je **nekonzistentní** s detailním schematem v 13a–13e:

| Entita | Doc 03 | Doc 13 | Problém |
|--------|--------|--------|---------|
| users | `role ENUM(owner,manager,employee)` | Separátní `system_role` + `custom_role_id` | Jiný přístup |
| services | `price DECIMAL` | `price INTEGER` (haléře) | Money v DECIMAL je chyba |
| bookings | `user_id` = zaměstnanec | `employee_id` | Jiný název sloupce |
| customers | `name VARCHAR` | `first_name` + `last_name` separátně | Jiná struktura |
| packages | `price DECIMAL` | `price INTEGER` | Opět DECIMAL vs INTEGER |

**Akce:** Dokument 03 musí být přepsán — nebo označen jako "historický, viz 13a–13e".

---

### B2. Roadmap (doc 10) vs. nová komplexita

Roadmapa říká: "Platby ve fázi 2, Rules Engine ve fázi 2."
Ale DB schema (13a–13e) a nové features (marketplace, slot holds, série) jsou výrazně komplexnější než to co roadmapa předpokládala.

**Konkrétní problémy:**
- `slot_holds` (doc 15) musí být ve fázi 1 (MVP) — bez toho double booking
- `marketplace` (doc 15) není v roadmapě vůbec
- `recurring_series` (doc 13d) je enormně složitá entita — fáze 2 je nerealistická
- Permanentky (doc 12) s 60+ scénáři = minimálně 3 měsíce práce samy o sobě

**Akce:** Roadmapa potřebuje aktualizaci po finalizaci feature setu.

---

### B3. Permission system (doc 04) vs. Customer self-service (doc 07)

Dokument 04 definuje `customer_self_service` rule s polem `can_cancel`, `can_reschedule` atd.
Dokument 07 popisuje customer portal s těmito funkcemi.

**Nesoulad:** Nikde není explicitně řečeno jak tyto dvě věci spolupracují v kódu. Kdo volá Rules Engine při zákaznické akci? Jak se vrátí error zákazníkovi srozumitelně?

---

### B4. Packages (doc 08) vs. DB schema (doc 13d)

Dokument 08 popisuje "Bundle balíčky: Manikúra + pedikúra + masáž jako jeden balíček."
DB schema v 13d má `bundle_items JSONB` a `require_same_visit BOOLEAN`.

**Nesoulad:** Dokument 08 říká "lze čerpat postupně" ale DB má jen true/false příznak. Chybí: jak systém sleduje který bundle item byl již vyčerpán?

```sql
-- Chybí:
CREATE TABLE customer_package_bundle_items (
  id                    UUID PRIMARY KEY,
  customer_package_id   UUID NOT NULL REFERENCES customer_packages(id),
  service_id            UUID NOT NULL REFERENCES services(id),
  quantity_total        INTEGER NOT NULL,
  quantity_used         INTEGER NOT NULL DEFAULT 0,
  booking_ids           UUID[]  -- které rezervace to vyčerpaly
);
```

---

### B5. Availability cache (doc 13c) vs. Slot holds (doc 15)

Dokument 13c má `availability_cache` s triggery na invalidaci.
Dokument 15 přidává `slot_holds` ale trigger na invalidaci v `release_expired_holds` funkci je neúplný — invaliduje cache jen pro recently expired holds, ne pro nové.

**Nesoulad:** Při vytvoření nového holdu musí také dojít k invalidaci cache pro daný slot (aby se ostatním zákazníkům neukázal jako dostupný).

---

### B6. Enum `cancellation_reason` duplicita

V dokumentu 12 (permanentky) máme `cancellation_reason` enum jako VARCHAR seznam.
V dokumentu 13d máme `cancellation_reason` jako PostgreSQL ENUM TYPE.
V dokumentu 13e máme v audit logu `reason TEXT`.

Tři různá místa, tři různé reprezentace stejné věci.

---

## ČÁST C — Technická rozhodnutí která musíme učinit PŘED vývojem

### C1. ⚠️ KRITICKÉ: Výběr technologického stacku — musí být finální

Dokument 03 nabízí: "Node.js nebo Python — oboje je dobrou volbou."
**Toto musí být rozhodnutí, ne otázka.** Vývojový tým se nemůže rozdělit.

**Doporučení:** Node.js (TypeScript) + NestJS
- Typesafety přes celý stack (TypeScript na BE i FE)
- Největší ekosystém pro SaaS stavbu
- Nejlepší podpora pro Stripe, Twilio, Google integrace
- Snazší hiring v ČR/SK

---

### C2. ⚠️ KRITICKÉ: Jak se generují rezervace z permanentek

Dokument 12 a 13d předpokládají existenci `recurring_series_sessions` pro každou lekci. Ale kdy se generují?

**Varianta A — Eager generation (dopředu):**
Systém každou noc generuje `bookings` pro příštích 60 dní ze všech aktivních sérií.
- Pro: jednoduché dotazy, snadno zobrazit v kalendáři
- Proti: miliony řádků, velké série = velká DB

**Varianta B — Lazy generation (na vyžádání):**
`bookings` se generuje až když zákazník nebo admin otevře kalendář pro daný den.
- Pro: méně dat v DB
- Proti: složitější logika, race conditions

**Varianta C — Hybrid:**
`recurring_series_sessions` (lehký záznam) se generuje dopředu, `bookings` (plný záznam) pouze při konfirmaci.
- Toto je doporučené řešení

**Musí být rozhodnuto před vývojem série modulu.**

---

### C3. ⚠️ KRITICKÉ: Timezone handling strategie

Systém má zákazníky, zaměstnance, pobočky — každý může být v jiném TZ.

**Musíme rozhodnout:**
- Ukládáme vždy UTC a konvertujeme při zobrazení? (doporučeno)
- Nebo ukládáme lokální čas s TZ informací?
- Jak se chová série "každou středu v 15:00" při přechodu na letní čas?
- Má zákazník z Londýna vidět čas v CET nebo BST?

---

### C4. ⚠️ KRITICKÉ: Disponibilita dat po smazání tenant

Pokud tenant zruší účet — co se stane s:
- Daty zákazníků (GDPR: zákazník má právo na výmaz, ale tenant je controller)
- Historickými transakcemi (účetní povinnosti — 10 let archivace)
- Marketplace reviews (veřejné — zůstanou anonymizované?)

---

### C5. Rozhodnutí: Monorepo nebo separátní repozitáře

```
Varianta A — Monorepo (doporučeno pro start):
/apps
  /api          -- NestJS backend
  /web          -- Next.js admin
  /booking-widget  -- embeddable widget
  /customer-portal -- zákaznický portál
/packages
  /db           -- Prisma schema + migrations
  /types        -- sdílené TypeScript typy
  /ui           -- sdílené UI komponenty

Varianta B — Separátní repozitáře:
  api-repo, web-repo, widget-repo — složitější CI/CD, jednodušší ownership
```

---

### C6. Rozhodnutí: ORM nebo raw SQL

Schema je napsáno jako raw SQL. V aplikaci:

- **Prisma** — nejlepší DX, typesafety, ale slabé pro komplexní dotazy a JSONB
- **Drizzle** — lightweight, blíže SQL, dobrá TypeScript podpora
- **TypeORM** — zralý, ale verbose
- **Raw SQL + pgTyped** — maximální kontrola, více boilerplate

Doporučení: **Drizzle** pro jednoduché CRUD + raw SQL pro komplexní dotazy (availability engine, rules evaluation).

---

### C7. Rozhodnutí: Jak implementovat Rules Engine v kódu

Dokument 04 má Rules Engine navržen jako DB záznamy + evaluátor. Ale jak evaluátor funguje?

```typescript
// Varianta A — Interpreter (podmínky z DB se vyhodnocují v runtime)
async function evaluateRule(rule: Rule, context: BookingContext): Promise<RuleResult> {
  for (const condition of rule.conditions) {
    const value = await getContextValue(context, condition.field);
    if (!evaluate(value, condition.op, condition.value)) return { matched: false };
  }
  return { matched: true, action: rule.action, config: rule.config };
}

// Varianta B — Code-based rules (pravidla jsou TypeScript funkce, DB jen konfiguruje)
const RULE_EVALUATORS: Record<RuleType, RuleEvaluator> = {
  'cancellation': new CancellationRuleEvaluator(),
  'reschedule': new RescheduleRuleEvaluator(),
  ...
};
```

Varianta A je flexibilnější ale pomalejší a složitější na debugging.
Varianta B je rychlejší, testovatelná ale nové typy pravidel vyžadují deploy.

**Doporučení: Hybridní** — Evaluator je v kódu (Varianta B), ale config přichází z DB. Nový typ pravidla = nový evaluator v kódu + nová konfigurace v DB.

---

## ČÁST D — Co chybí jako samostatné dokumenty

Níže jsou témata která vůbec nemáme pokrytá a jsou blokerem pro vývoj:

### D1. CHYBÍ: UX/UI specifikace

Máme features a DB ale nemáme:
- Sitemap (přehled všech obrazovek)
- User flows (jak zákazník projde rezervací krok po kroku — screeny)
- Admin flows (jak admin spravuje zákazníka)
- Design system (barvy, typografie, komponenty)
- Wireframes klíčových obrazovek

**Bez tohoto frontend vývojář nemůže začít.**

### D2. CHYBÍ: Testovací strategie

- Unit testy: které moduly? (Rules Engine určitě, availability engine určitě)
- Integration testy: API endpointy
- E2E testy: kompletní booking flow (Playwright/Cypress)
- Load testing: kolik souběžných rezervací systém zvládne
- Security testing: SQL injection, XSS, CSRF, IDOR

### D3. CHYBÍ: Deployment & DevOps plán

- CI/CD pipeline (GitHub Actions nebo GitLab CI)
- Prostředí: local → staging → production
- Database migrations workflow (jak se provádí schema změny bez downtime)
- Rollback strategie
- Monitoring: co jsou klíčové metriky? (p99 latence, error rate, queue depth)
- Alerting: kdo dostane SMS při výpadku?
- Disaster recovery: RTO a RPO (jak rychle se zotavíme a kolik dat smíme ztratit)

### D4. CHYBÍ: Bezpečnostní model — detailně

Dokument 03 zmiňuje bezpečnost povrchně. Chybí:
- Threat model (kdo jsou útočníci a co chtějí)
- OWASP Top 10 jak je řešíme každou z nich
- Penetrační testovací plán
- Incident response plán
- Dependency scanning (automatická kontrola CVE)

### D5. CHYBÍ: GDPR implementační plán

Máme GDPR zmiňováno ale chybí:
- Data flow diagram (kde která data tečou, kdo je processor, kdo controller)
- Záznamy o zpracování (povinnost ze zákona)
- Privacy policy template
- Cookie policy
- Postup při Data Breach (72h notifikace ÚOOÚ)
- Postup při žádosti o výmaz (krok po kroku)

---

## ČÁST E — Závěrečné hodnocení: Jsme připraveni začít?

### Stav po dokumentaci

| Oblast | Stav | Poznámka |
|--------|------|---------|
| Vize a trh | ✅ Kompletní | |
| Feature list | ✅ Kompletní | |
| DB schema | ✅ Kompletní | Drobné nekonzistence opravit |
| Rules Engine | ✅ Navržen | Implementace v kódu nevyřešena |
| Permanentky / série | ✅ Kompletní | Nejdetailnější část |
| Booking flows | ✅ Kompletní | |
| Marketplace | ✅ DB schema | Business flow chybí |
| Race condition | ✅ Vyřešeno | slot_holds + EXCLUDE |
| Vertikály | ✅ Pokryto | |
| Technický stack | ⚠️ Nerozhodnut | Musí být finální |
| API spec | ❌ Chybí | Blocker pro frontend |
| UX/Wireframes | ❌ Chybí | Blocker pro frontend |
| Onboarding flow | ❌ Chybí | Kritické pro produkt |
| Background jobs | ❌ Chybí | Nutné před vývojem |
| Webhook handling | ❌ Chybí | Nutné pro platby |
| Testovací strategie | ❌ Chybí | |
| DevOps plán | ❌ Chybí | |
| GDPR detailně | ❌ Chybí | |
| Tenant billing | ❌ Chybí | Nutné pro monetizaci |
| Feature flags | ❌ Chybí | Nutné pro rollout |
| Roadmapa | ⚠️ Zastaralá | Nereflek. marketplace a série |

---

### Co musíte udělat PŘED prvním řádkem kódu

**Týden 1 — Rozhodnutí (bez nich nelze začít):**
1. Finalizovat tech stack (Node.js + TypeScript — ano/ne)
2. Rozhodnout generování sérií (Varianta C — hybrid)
3. Rozhodnout timezone strategii (UTC everywhere)
4. Finalizovat monorepo strukturu
5. Opravit nekonzistence v DB schematech (doc 03 vs 13a–13e)

**Týden 2–4 — Chybějící dokumenty (paralelně s přípravou prostředí):**
1. OpenAPI spec pro klíčové endpointy (aspoň booking flow)
2. Wireframes: rezervační formulář + admin kalendář + zákaznický portál
3. Background jobs kompletní seznam s frekvencemi
4. Webhook handling dokument (Stripe events → naše akce)
5. Onboarding flow zákazníka (tenant registrace → první rezervace)

**Měsíc 2 — Než jdeme do produkce:**
1. Testovací strategie
2. CI/CD pipeline
3. GDPR implementační plán
4. Tenant billing (Stripe Billing integrace)
5. Aktualizovat roadmapu

---

### Realistický odhad: Kdy je MVP skutečně hotové?

Původní roadmapa říká 6 měsíců. Po analýze dokumentace:

- **Fáze 0 (příprava):** 3 týdny místo 2 měsíců (díky hotové dokumentaci)
- **Fáze 1 (MVP bez plateb, bez série):** 3–4 měsíce (2 vývojáři)
- **Fáze 1.5 (slot holds + základní platby):** +1 měsíc
- **První plnohodnotný produkt (série + rules engine + customer portal):** 10–12 měsíců od startu

Série permanentek jsou samy o sobě 3+ měsíce práce pokud to má být robustní.

Marketplace je další 4–6 měsíců nad tím.

**Realistický celkový odhad:** 18–24 měsíců do plnohodnotného produktu s marketplace při 3–4 vývojářích.
