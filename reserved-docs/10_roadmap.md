# 10 — Roadmapa vývoje (v2)

> Přepracováno pro realitu: 2 vývojáři (já + Claude v terminálu).
> Původní roadmapa předpokládala tým 4 lidí a ignorovala
> marketplace, permanentky a race condition.
> Tato verze je konzervativní a realistická.

---

## Realita vývoje

**Tým:** 2 vývojáři (zakladatel + AI-assisted development)
**Tempo:** Senior fullstack vývojář = ~8 story points / týden
**AI-assisted multiplier:** ~1,5–2× pro boilerplate, testy, dokumentaci
**Efektivní kapacita:** ~12–14 story points / týden

**Co to znamená v praxi:**
Komplexní modul jako "permanentky" = 40–60 story points = 3–5 týdnů.
Celý systém = 18–24 měsíců do production-ready s marketplace.
MVP bez série a marketplace = 5–6 měsíců.

---

## Přehled fází

```
Fáze 0: Setup               (týdny 1–3)       ← jsme tady
Fáze 1: MVP Core            (týdny 4–16)       → 3 měsíce
Fáze 2: Pro plán            (týdny 17–32)      → 4 měsíce
Fáze 3: Business plán       (týdny 33–52)      → 5 měsíců
Fáze 4: Marketplace         (týdny 53–72)      → 5 měsíců
Fáze 5: Enterprise & AI     (týdny 73+)        → průběžně
```

---

## FÁZE 0 — Setup (týdny 1–3)

**Cíl:** Vše připraveno, první `git commit` spuštěn.
**Výstup:** Běžící monorepo s DB, API skeleton, CI/CD.

### Týden 1 — Lokální prostředí

- [ ] Windows WSL2 setup (Ubuntu 24)
- [ ] Node.js 22 via nvm
- [ ] pnpm globálně
- [ ] VS Code + WSL extension + doporučené rozšíření
- [ ] GitHub účet + privátní repozitář
- [ ] Git konfigurace (jméno, email, SSH klíč)

### Týden 2 — Monorepo a DB

- [ ] `pnpm create turbo` — inicializace monorepa
- [ ] Adresářová struktura (apps/api, apps/web, apps/widget, apps/portal, packages/db, packages/types, packages/ui)
- [ ] Docker Compose dev (PostgreSQL 16 + Redis 7 + Mailhog)
- [ ] `packages/db` — Drizzle setup + `drizzle.config.ts`
- [ ] První migrace: `tenants`, `branches`, `users` tabulky (konzistentní se 13a)
- [ ] Drizzle seed: 1 test tenant, 1 branch, 1 admin user
- [ ] NestJS skeleton (apps/api) — AppModule, ConfigModule, DatabaseModule
- [ ] Healthcheck endpoint: `GET /health`

### Týden 3 — CI/CD a infrastruktura

- [ ] GitHub Actions: lint + typecheck + test na každém push
- [ ] Hetzner účet — staging server (CX21)
- [ ] Docker Compose production config
- [ ] Deploy script: `git push → GitHub Actions → staging deploy`
- [ ] Sentry setup (error tracking)
- [ ] Environment proměnné (lokální .env + GitHub Secrets)
- [ ] Staging doména (staging.nasedomena.cz)

**Milník fáze 0:** `curl https://staging.nasedomena.cz/health` vrátí 200 OK

---

## FÁZE 1 — MVP Core (týdny 4–16)

**Cíl:** Zákazník může online rezervovat termín. Admin to vidí v kalendáři.
Platby nejsou. Série nejsou. Rules Engine není. Ale je to funkční.

**Kdo zaplatí za toto:** Starter plán zákazníci.
**Launch target:** M3 od startu — 10 platících zákazníků.

### Sprint 1.1 — Auth & Tenant (týdny 4–5)

**Backend:**
- [ ] Tenant registrace: `POST /api/v1/auth/register`
  - Vytvoří tenant + user(owner) + branch(default) + onboarding_checklist
  - Odešle verification email (Postmark)
- [ ] Email verification: `POST /api/v1/auth/verify-email`
- [ ] Login: `POST /api/v1/auth/login` → JWT + refresh token
- [ ] Refresh: `POST /api/v1/auth/refresh`
- [ ] Logout: `POST /api/v1/auth/logout`
- [ ] TenantMiddleware — tenant resolution ze subdomény
- [ ] AuthGuard, RoleGuard skeleton
- [ ] PostgreSQL RLS policies (tenant izolace)

**DB migrace:**
- [ ] `users` tabulka kompletní (viz 13b)
- [ ] `user_sessions` tabulka
- [ ] `email_verifications` tabulka
- [ ] `onboarding_checklist` tabulka (viz 17)

**Testy:**
- [ ] Unit: JWT service, tenant resolution
- [ ] Integration: register → verify → login → refresh → logout flow

---

### Sprint 1.2 — Tenant nastavení & Onboarding wizard (týdny 6–7)

**Backend:**
- [ ] `GET/PATCH /api/v1/admin/settings` — tenant konfigurace
- [ ] `GET/PATCH /api/v1/admin/branches/{id}` — základní branch info
- [ ] Onboarding checklist auto-update (event-driven)
- [ ] Welcome email sekvence (D0 okamžitě, D1 pokud nedokončen, D3)

**Frontend (apps/web):**
- [ ] Next.js 14 setup (App Router, Tailwind, shadcn/ui)
- [ ] Login stránka
- [ ] Onboarding wizard — 5 kroků (viz doc 17)
  - Krok 1: Základní info (předvyplněno z registrace)
  - Krok 2: První služba (smart defaults dle business_type)
  - Krok 3: Pracovní doba
  - Krok 4: Pozvat tým (přeskočitelné)
  - Krok 5: Platby (přeskočitelné)
- [ ] Dashboard skeleton s setup checklistem

---

### Sprint 1.3 — Services & Employees (týden 8)

**Backend:**
- [ ] `GET/POST/PATCH/DELETE /api/v1/admin/services`
- [ ] `GET/POST/PATCH /api/v1/admin/employees`
- [ ] `GET/PATCH /api/v1/admin/employees/{id}/schedule`
- [ ] `service_categories`, `services`, `employees`, `employee_branches`,
      `employee_working_hours` migrace (viz 13b, 13c)

**Frontend:**
- [ ] Správa služeb — list, create form, edit
- [ ] Správa zaměstnanců — list, create form, edit
- [ ] Nastavení pracovní doby — týdenní grid

---

### Sprint 1.4 — Availability Engine (týdny 9–10)

Nejkomplexnější část MVP — musí být správně od začátku.

**Backend:**
- [ ] `packages/rules-engine` — základní evaluátor (jen display rules)
- [ ] Availability výpočet:
  - Načti `employee_working_hours` pro daný den
  - Odečti existující `bookings` (+ buffer_before/after)
  - Odečti `availability_blocks`
  - Odečti `holidays`
  - Aplikuj slot interval a zaokrouhlení
  - Vrať pole dostupných slotů
- [ ] `availability_cache` tabulka + invalidation trigger
- [ ] `GET /api/v1/public/{slug}/availability` — hlavní public endpoint
- [ ] `slot_holds` tabulka + EXCLUDE constraint (viz 15)
- [ ] `POST /api/v1/public/{slug}/holds` — zamkni slot (10min TTL)
- [ ] BullMQ setup + `release_expired_holds` job (každých 30s)

**Testy:**
- [ ] Unit: availability výpočet s různými kombinacemi
- [ ] Unit: EXCLUDE constraint (souběžné requesty)
- [ ] Integration: hold → booking → cancel → hold uvolněn

---

### Sprint 1.5 — Booking flow (týdny 11–12)

**Backend:**
- [ ] `bookings` + `booking_status_history` migrace (viz 13d)
- [ ] `POST /api/v1/public/{slug}/bookings` — hlavní booking endpoint
  - Ověř hold token (slot_holds)
  - Ověř dostupnost (double check atomicky)
  - INSERT booking (EXCLUDE constraint jako pojistka)
  - UPDATE slot_holds → converted
  - Enqueue confirmation email
  - Audit log
- [ ] `webhook_events` tabulka (viz 19)
- [ ] Notification queue tabulky + `process_notification_queue` job
- [ ] `GET/POST/PATCH /api/v1/admin/bookings` — admin CRUD
- [ ] `POST /api/v1/admin/bookings/{id}/cancel`
- [ ] `POST /api/v1/admin/bookings/{id}/reschedule`
- [ ] `POST /api/v1/admin/bookings/bulk/reassign`
- [ ] `send_reminders` job (každých 5 minut)

**Frontend widget (apps/widget):**
- [ ] Next.js widget setup
- [ ] Krok 1: Výběr služby
- [ ] Krok 2: Výběr zaměstnance
- [ ] Krok 3: Výběr data a času (countdown timer pro hold)
- [ ] Krok 4: Kontaktní údaje
- [ ] Krok 5: Potvrzení
- [ ] Embed script (`<script data-tenant="xxx">`)

---

### Sprint 1.6 — Admin kalendář (týdny 13–14)

**Frontend:**
- [ ] FullCalendar.js integrace
- [ ] Denní + týdenní pohled
- [ ] Zobrazení rezervací per zaměstnanec
- [ ] Klik na rezervaci → detail panel (zákazník, služba, stav, akce)
- [ ] Klik na volný slot → rychlé vytvoření rezervace
- [ ] Drag & drop reschedule
- [ ] WebSocket setup pro live aktualizace
- [ ] Filtrování: pobočka, zaměstnanec, datum

---

### Sprint 1.7 — Zákazníci & Email (týdny 15–16)

**Backend:**
- [ ] `customers` + `customer_tags` + `customer_notes` migrace (viz 13b)
- [ ] `GET/POST/PATCH /api/v1/admin/customers`
- [ ] `GET /api/v1/admin/customers/{id}/bookings`
- [ ] Full-text search zákazníků (PostgreSQL GIN index)
- [ ] Postmark integrace — všechny transakční šablony:
  - booking_confirmed
  - booking_reminder_24h
  - booking_reminder_2h
  - booking_cancelled
  - booking_rescheduled
  - welcome (tenant onboarding)
  - email_verification

**Frontend:**
- [ ] Zákazníci list + search + filtry
- [ ] Zákazník detail (info, rezervace, poznámky)
- [ ] Rychlé přidání poznámky

**Milník fáze 1:** První platící zákazník přijme první rezervaci přes online formulář.

---

## FÁZE 2 — Pro plán (týdny 17–32)

**Cíl:** Plnohodnotný Pro plán. Platby, SMS, zákaznický portál, Rules Engine v1.
**Launch target:** M7 — 50 platících zákazníků, Starter + Pro plány živé.

### Sprint 2.1 — Stripe platby (týdny 17–19)

- [ ] Stripe integrace — PaymentIntent flow
- [ ] Platba předem při rezervaci (Stripe Elements ve widgetu)
- [ ] Zálohy (procento nebo fixní)
- [ ] `payments` tabulka + `invoices` tabulka migrace (viz 13d)
- [ ] Tenant billing: Stripe Subscription pro SaaS platby
  - Starter, Pro plán
  - Trial → paid flow
  - Grace period logika
- [ ] `POST /webhooks/stripe` — kompletní dle doc 19
  - payment_intent.succeeded
  - payment_intent.payment_failed
  - charge.refunded
  - invoice.paid
  - invoice.payment_failed
  - customer.subscription.deleted
- [ ] `tenant_subscriptions` + `tenant_usage` migrace (viz 16)
- [ ] PlanGuard — blokování funkcí dle plánu
- [ ] Faktury PDF (pdf-lib nebo puppeteer)
- [ ] `process_payment_refund` job

---

### Sprint 2.2 — SMS & notifikace (týdny 20–21)

- [ ] Twilio integrace — SMS odesílání
- [ ] `POST /webhooks/twilio/sms-status` — delivery tracking
- [ ] Konfigurovatelné šablony notifikací (WYSIWYG editor v adminu)
- [ ] Zákazník si nastaví: email/SMS/oboje, jak dlouho před (24h/2h/vlastní)
- [ ] `send_reminders` job — rozšíření o SMS
- [ ] `send_followup_and_review_request` job

---

### Sprint 2.3 — Zákaznický portál v1 (týdny 22–24)

- [ ] `apps/portal` Next.js setup
- [ ] Magic link login (bez hesla — jednodušší UX)
- [ ] Email + heslo login (volitelné)
- [ ] Moje rezervace — list, detail, akce
- [ ] Storno (s fixními pravidly — bez Rules Engine)
- [ ] Přesun (s fixními pravidly)
- [ ] Správa profilu
- [ ] Notifikační preference
- [ ] Zákaznické přihlášení ve widgetu (prefill údajů)

---

### Sprint 2.4 — Multi-pobočka (týdny 25–26)

- [ ] Vytvoření druhé pobočky v adminu
- [ ] `areas`, `workspaces`, `resources` migrace (viz 13a)
- [ ] Sdílení zaměstnanců mezi pobočkami
- [ ] Výběr pobočky ve widgetu
- [ ] Konsolidovaný dashboard (přes pobočky)
- [ ] Lokální přepis nastavení per pobočka

---

### Sprint 2.5 — Rules Engine v1 (týdny 27–29)

- [ ] `rules` tabulka migrace + indexy (viz 13a)
- [ ] `rule_evaluations` tabulka
- [ ] Evaluátor v `packages/rules-engine`:
  - Cancellation rules
  - Reschedule rules
  - Booking limit rules
- [ ] Admin UI pro správu pravidel — list, create, edit
- [ ] Simulátor pravidel (zadej zákazníka + akci → vidíš výsledek)
- [ ] Zákaznický portál — akce dle pravidel (ne fixní)
- [ ] `approval_requests` tabulka + flow (viz 13d)

---

### Sprint 2.6 — Skupinové lekce + Balíčky v1 (týdny 30–32)

- [ ] `group_slots` migrace (viz 13d)
- [ ] Vytvoření skupinové lekce (kapacita, cena, opakování)
- [ ] Rezervace místa zákazníkem
- [ ] Waiting list pro skupinové lekce
- [ ] `packages` + `customer_packages` + `package_credit_transactions` migrace
- [ ] Kreditní balíčky (základní)
- [ ] Dárkové poukazy (generování + uplatnění kódem)
- [ ] `notify_waiting_list` job
- [ ] Zákaznický portál — sekce Moje balíčky

**Milník fáze 2:** Pro plán živý, platby fungují, zákaznický portál spuštěn.

---

## FÁZE 3 — Business plán (týdny 33–52)

**Cíl:** Permanentky, plný HR, pokročilé balíčky, integrace.
**Launch target:** M13 — 200 zákazníků, Business plán živý.

### Sprint 3.1 — Light HR modul (týdny 33–36)

- [ ] Employee profil — kompletní (dokumenty, certifikace, interní poznámky)
- [ ] `employee_schedule_exceptions` migrace + schválení workflow
- [ ] Žádosti o dovolenou → manažer schválí → booking blokování
- [ ] `commission_schemas` + `employee_commissions` migrace
- [ ] Výkonnostní dashboard per zaměstnanec
- [ ] `generate_commission_reports` job (1. den měsíce)
- [ ] `check_series_health` job

---

### Sprint 3.2 — Permanentky / Série (týdny 37–45)

Největší modul. 9 týdnů. Nelze zkrátit bez kompromisů.

- [ ] `recurring_series` + `recurring_series_sessions` migrace (viz 13d)
- [ ] Vytvoření série v adminu:
  - Výběr zákazníka, služby, zaměstnance, frekvence, čas
  - Billing model (per_session, prepaid_block, monthly_sub)
  - Lapse policy per typ události (cancel, pause, business_cancel, holiday)
  - Limity (max free cancels, max reschedules, max pauses)
- [ ] `generate_series_bookings` job (nočně, 60 dní dopředu)
- [ ] Zákaznický portál — správa série:
  - Zobrazení série a sessionů
  - Zrušení jedné lekce (dle pravidel + počítadlo)
  - Přesun lekce (dle strategie — end_of_series, adjacent...)
  - Požadavek na pauzu (approval flow)
  - Darování slotu (gift_slot)
- [ ] Admin — kompletní série management:
  - Pauza serie (s datem návratu)
  - Ukončení série (s finančním vypořádáním)
  - Hromadné přeřazení (nemocný zaměstnanec)
  - Bulk cascade reassign
- [ ] Lapse policy evaluátor — 5 typů událostí × 4 politiky
- [ ] `check_series_health` job — expiry, no-show threshold, auto-renewal
- [ ] `process_series_renewal` job
- [ ] Rules Engine rozšíření — `series_policy` typ pravidla
- [ ] Zákaznický portál — Moje permanentky (přehled, kredity, expirace)

---

### Sprint 3.3 — Pokročilé balíčky & Integrace (týdny 46–49)

- [ ] Bundle balíčky + `customer_package_bundle_items` tabulka
- [ ] Časové balíčky (neomezeno po dobu X)
- [ ] Subscription balíčky (auto-renewal přes Stripe)
- [ ] B2B / firemní balíčky
- [ ] `corporate_accounts` + `corporate_account_members` migrace
- [ ] Podmíněná viditelnost balíčků
- [ ] Google Kalendář obousměrný sync
- [ ] `sync_google_calendar` job + push webhook handler
- [ ] Zoom / Meet automatické linky
- [ ] Zapier / Make webhook connector
- [ ] `feature_flags` tabulka + systém (viz 16)

---

### Sprint 3.4 — Rules Engine v2 & Reporty (týdny 50–52)

- [ ] Visibility rules (podmíněná viditelnost slotů)
- [ ] Display rules (prioritní strategie, slot interval)
- [ ] No-show rules (automatický poplatek)
- [ ] Payment policy rules
- [ ] `calculate_risk_scores` job
- [ ] Churn detection + reaktivační emaily (`churn_detection` job)
- [ ] Revenue reporting dashboard
- [ ] Export (CSV + PDF) per zaměstnanec, pobočka, období
- [ ] `gdpr_data_retention` job

**Milník fáze 3:** Business plán živý, permanentky v produkci.

---

## FÁZE 4 — Marketplace (týdny 53–72)

**Cíl:** Spustit marketplace, první providerská rezervace.
**Launch target:** M18 — 50 providerů na marketplace, první marketplace revenue.

### Sprint 4.1 — Provider infrastruktura (týdny 53–57)

- [ ] `marketplace_providers`, `marketplace_categories` migrace (viz 15)
- [ ] `provider_applications` + `kyc_documents` migrace
- [ ] Provider onboarding flow (admin schvaluje)
- [ ] Stripe Connect setup — Express accounts
- [ ] `provider_payment_accounts` migrace
- [ ] `commission_rules` migrace
- [ ] `marketplace_transactions` + `provider_payouts` migrace
- [ ] `POST /webhooks/stripe` — Connect eventy (account.updated, transfer.failed)
- [ ] `process_marketplace_payouts` job

---

### Sprint 4.2 — Marketplace frontend (týdny 58–63)

- [ ] `marketplace_listings` migrace
- [ ] Provider profil stránka (veřejná)
- [ ] Marketplace search (kategorie + geo + dostupnost)
- [ ] PostgreSQL full-text search + GiST geo index
- [ ] `marketplace_search_log` migrace
- [ ] Booking přes marketplace (Stripe Connect split payment)
- [ ] Provider dashboard — marketplace rezervace, výplaty, reporting
- [ ] Veřejné reviews (viditelné na marketplace)
- [ ] `update_marketplace_rankings` job + `calculate_provider_rank()` funkce

---

### Sprint 4.3 — Disputes & Safety (týdny 64–67)

- [ ] `marketplace_disputes` migrace (viz 15)
- [ ] Dispute flow — zákazník otevře, provider odpoví, platforma rozhodne
- [ ] Platform admin pro správu disputes
- [ ] `charge.dispute.created` webhook handling
- [ ] Automatické zadržení payoutu při dispute

---

### Sprint 4.4 — Marketplace growth tools (týdny 68–72)

- [ ] Marketplace boost (placený ranking)
- [ ] Provider analytics (views, CTR, conversion)
- [ ] Featured provider program
- [ ] `review_helpful_votes` migrace
- [ ] SEO optimalizace marketplace stránek (Next.js SSR, structured data)
- [ ] Sitemap generování (pro Google indexaci)

**Milník fáze 4:** Marketplace v produkci, první Stripe Connect payout proběhl.

---

## FÁZE 5 — Enterprise & AI (týdny 73+)

Průběžně dle poptávky a revenue.

### Enterprise (prioritizovat dle prvního enterprise zájemce)

- [ ] White-label — vlastní doména, branding, login stránka
- [ ] SSO (SAML 2.0 / Azure AD)
- [ ] Vlastní role s granulárními oprávněními
- [ ] Dedikovaná read replica per enterprise tenant
- [ ] SLA monitoring + automatická kompenzace
- [ ] DPA template + GDPR audit podpora

### AI funkce (po M24)

- [ ] No-show prediction model (historická data → ML skóre)
- [ ] Smart scheduling optimizer (minimize gaps AI)
- [ ] Natural language booking (LLM integration)
- [ ] Predictive churn (30 dní před odchodem)

### Nové kanály

- [ ] WhatsApp Business API pro notifikace
- [ ] Instagram Book Now button (Meta API)
- [ ] Mobilní aplikace iOS + Android (React Native nebo Expo)

---

## Rizika a jak je řídíme

| Riziko | Pravděpodobnost | Dopad | Mitigace |
|--------|----------------|-------|---------|
| Série modul trvá déle než 9 týdnů | Vysoká | Střední | Buffer 2 týdny v plánu, možnost launch bez nejkomplexnějších scénářů |
| Stripe Connect schválení trvá | Střední | Vysoký | Požádat o Stripe account co nejdříve (fáze 0) |
| První zákazníci chtějí funkce mimo scope | Vysoká | Střední | "Roadmap" odpověď, ne custom development |
| RLS bug — únik dat mezi tenanty | Nízká | Kritický | Automatizované RLS testy od fáze 1 |
| Double booking v produkci | Nízká | Vysoký | EXCLUDE constraint + slot_holds — dvojitá ochrana |
| Churn před Product-Market Fit | Střední | Vysoký | NPS každé 3 měsíce, osobní rozhovor s každým churnem |

---

## Co NENÍ v roadmapě (a proč)

**Letenky:** GDS integrace, viz doc 14 — mimo scope navždy

**Nativní mobile app (iOS/Android):** Fáze 5 nejdříve — PWA widget stačí pro M1–M18

**Vlastní SMS brána:** Twilio stačí, vlastní brána = regulatorní nightmare

**Self-hosted varianta:** Multi-tenant SaaS je naše architektura, self-hosted = jiný produkt

**Offline mode:** Komplexita vs. benefit — zákazníci mají internet, salóny mají WiFi

---

## Technický dluh — plánované refaktory

| Oblast | Kdy | Proč |
|--------|-----|------|
| Availability engine | Po fázi 3 | Přidat ML scoring pro minimize_gaps strategii |
| Notification system | Po fázi 2 | Přidat push notifikace (Firebase FCM) |
| Reporting | Po fázi 3 | Read replica pro těžké analytické dotazy |
| Search | Po fázi 4 | Elasticsearch pokud PostgreSQL FTS nestačí |
| Mobile | Fáze 5 | React Native / Expo nad existujícím API |

---

## Definice "hotovo" pro každou fázi

**Fáze 1 hotová když:**
- Zákazník se zaregistruje, nastaví systém, sdílí link, přijme rezervaci — vše bez naší asistence
- 10 platících zákazníků (Starter plán)
- Žádný kritický bug v produkci po 2 týdnech

**Fáze 2 hotová když:**
- Platba kartou funguje end-to-end včetně refundu
- Zákaznický portál — zákazník zruší a přesune termín sám
- 50 platících zákazníků, Pro plán živý

**Fáze 3 hotová když:**
- Zákazník má aktivní permanentku s prepaid blokem
- Zaměstnanec onemocní, admin hromadně přeřadí rezervace
- 200 zákazníků, Business plán živý

**Fáze 4 hotová když:**
- Provider přijme první rezervaci přes marketplace
- Stripe Connect payout proběhl úspěšně
- 50 providerů na marketplace

**Systém jako celek hotový když:**
- MRR > 1 000 000 Kč
- Churn < 2 %
- NPS > 50
- Žádný P0 bug po dobu 30 dní
