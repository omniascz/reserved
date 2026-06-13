# Migrace fitness/EMS domény z Ticketaria do Reserved

> Plán k odsouhlasení. Stav: NÁVRH (2026-06-12). Navazuje na sprint 9.1.
> Není to kopírování souborů — fitness/EMS doména se **staví znovu na základech Reserved**
> (Drizzle ORM, jedna sjednocená DB, RLS), podle Ticketaria jako návrhové předlohy.

---

## Cíl a princip

Složit do Reserved to, co dnes žije jen v `C:\Users\omnia\Documents\ticketarium`
(moduly `fitness-slots`, `ems-booking`, `permanentky`, `group-classes`, `fitness-portal`,
`fitness-reminders`, `pulseup-migration`), aby byl **jeden produkt na jednom místě**.

Vedoucí princip (potvrzený i v `KONSOLIDACE-EMS.md` Ticketaria): **jeden rezervační engine,
různé režimy jen jako konfigurace.** 1:1 trénink, skupinová lekce i EMS = tentýž slot,
liší se jen kapacitou, vazbou (trenér vs. přístroj) a cenou. Žádné paralelní subsystémy.

## Co Reserved UŽ má (nestaví se znovu)

- ✅ `services.capacity` (INTEGER, default 1) — sloupec existuje, jen ho booking logika ignoruje.
- ✅ Permanentky/kredity: `credit-packs`, `time-packs`, `bundle-packs` — 3 typy s consume/refund.
- ✅ Rules engine (`packages/rules-engine`) — eventy on_cancel/on_reschedule, akce.
- ✅ Tvrdé storno/přesun okno (`stornoLimitHours`, `presunLimitHours`).
- ✅ Multi-branch (pobočky, employee↔branch), klientský portál, reminders (email/SMS/WhatsApp).
- ✅ Concurrency: DB GiST EXCLUDE constraint `bookings_no_overlap` (migrace 0007).

Poslední migrace: `0049`. Nové migrace začínají na **`0050`**.

---

## Sprint 10.0 — Skupinové lekce / kapacita >1 🔑 ZÁSAH DO JÁDRA

> **STAV (2026-06-12):** ✅ BACKEND HOTOVÝ A OVĚŘENÝ NA ŽIVÉ DEV DB (data + aplikační vrstva).
> **Datová vrstva:** `class_sessions` tabulka, `bookings.session_id`, partial EXCLUDE
> (1:1 ochrana jen pro session_id IS NULL), UNIQUE(session_id, customer_id), kapacitní
> CHECK, RLS — migrace `0050_class_sessions.sql` aplikována.
> **Aplikační vrstva:** `class-sessions/` — `ClassSessionsService` (create, get, listOpen,
> join /atomicky podmíněným UPDATE/, leave, cancelSession), zod DTO, controller
> `admin/class-sessions`, modul registrovaný v app.module.
> **Ověřeno:** typecheck db+api zelený; 4 e2e testy proti živé DB (naplnění do kapacity +
> odmítnutí, žádné dvojí přihlášení, SOUBĚH 3 lidí o poslední místo → uspěje 1, odhlášení
> uvolní místo); **celá API sada 215 testů zelená — žádná regrese.**
> **FRONTEND HOTOVÝ + OVĚŘENÝ PŘES HTTP (2026-06-12):** veřejné API
> (`GET /public/:slug/class-sessions`, `POST .../:id/join` v PublicController +
> `ClassSessionsService.joinPublic/listOpenPublic`), klient ve widgetu
> (`lib/api.ts`: listClassSessions/joinClassSession), nový krok `ClassSessionStep.tsx`
> a větvení `BookingFlow` (služba s capacity>1 → výběr lekce místo zaměstnance/termínu).
> Ověřeno naživo (API na :4000, dev DB): seznam volných lekcí, join 201, kapacita drží
> (3/3 → SESSION_FULL 400), ALREADY_JOINED (i case-insensitive e-mail, i u plné lekce),
> server po každé chybě žije. Widget + API typecheck zelený; 216 testů API zelených.
> 🐞 **PŘI TOM NALEZENA A OPRAVENA PRE-EXISTING KRITICKÁ CHYBA:** `SentryExceptionFilter`
> u HttpException dělal `throw exception` (re-throw z globálního catch-all filtru), což
> v async pipeline = unhandled rejection → **pád celého API procesu u JAKÉKOLI HTTP chyby**
> (404/400/…). Dosud neodhaleno, protože e2e testy jdou přímo na služby, ne přes HTTP vrstvu.
> Opraveno: filtr teď HttpException korektně formátuje do `{ error: { code, message } }`
> (soubor `apps/api/src/sentry.filter.ts`). Overeno: neexistující slug → 404 + server žije.
> ⏳ ZBÝVÁ (volitelné): admin UI pro vypisování lekcí (dnes přes API/admin endpointy);
> i18n klíče pro pár českých textů v ClassSessionStep (teď hardcoded cs).
> ⚠️ Pozn.: drizzle journal je v repu rozdrifovaný (eviduje do 0045, soubory do 0049,
> `__drizzle_migrations` prázdná → dev DB se nestaví přes journal). 0050 aplikováno
> přímo DDL. Úklid journalu = samostatný úkol mimo tuto migraci.
> ⚠️ Pozn.2: `bookings.customer_id` má v živé DB FK na customers (přidaný pozdější migrací),
> ač to schéma `.ts` nedeklaruje — další drift schéma vs. DB k samostatnému úklidu.

**Cíl (lidsky):** umožnit, aby na jeden čas k jednomu trenérovi chodilo víc lidí
(skupinová lekce s kapacitou). Dnes Reserved umí jen 1:1 (kadeřník–zákazník).

**Proč je to první a nejcitlivější:** v databázi je pravidlo
`bookings_no_overlap` (migrace `0007_rls_bookings_exclude.sql`):

```
EXCLUDE USING gist (employee_id WITH =, tstzrange(buffer_starts_at, buffer_ends_at) WITH &&)
WHERE (status NOT IN ('cancelled','no_show'))
```

= „jeden zaměstnanec nesmí mít dvě překrývající se rezervace". Pro 1:1 ideální,
ale **skupinové lekci to přímo brání** (druhý účastník by se stejným trenérem ve stejný čas kolidoval).

**Co se mění v Reserved:**

1. **Nová tabulka `class_sessions`** (= vypsaná instance skupinové lekce; předloha = `fitness.slots`):
   - `id, tenant_id, branch_id, service_id, employee_id, starts_at, ends_at, buffer_starts_at, buffer_ends_at`
   - `capacity INT` (snapshot ze `services.capacity` při vypsání)
   - `booked_count INT DEFAULT 0` + `CHECK (booked_count >= 0 AND booked_count <= capacity)`
   - `status` ('open' | 'cancelled' | 'completed')
   - Soubor: `packages/db/src/schema/class-sessions.ts`
2. **`bookings.session_id`** — nový nullable FK na `class_sessions`.
   - `NULL` = klasická 1:1 rezervace (dnešní chování beze změny).
   - vyplněné = účastník skupinové lekce.
   - `UNIQUE (session_id, customer_id)` — klient se nemůže přihlásit dvakrát.
3. **Úprava EXCLUDE constraintu** (nová migrace `0050`): pravidlo se **omezí jen na 1:1**:
   ```
   WHERE (status NOT IN ('cancelled','no_show') AND session_id IS NULL)
   ```
   → 1:1 zůstává chráněné, účastníci skupiny už nekolidují. Kapacitu hlídá `class_sessions`.
4. **Kapacita atomicky:** přihlášení do lekce běží v transakci se `SELECT ... FOR UPDATE`
   na řádku session → kontrola `booked_count < capacity` → insert booking + inkrement.
   (Stejný princip jako dnešní `23P01` obrana, jen na úrovni session.)
5. **Dostupnost se větví** (`apps/api/src/availability`): pro `capacity = 1` beze změny
   (počítaná dostupnost). Pro `capacity > 1` = „vypsané lekce s volnými místy" (čtení `class_sessions`).
6. **API + admin UI:** vypsat lekci (`POST /admin/class-sessions`), seznam s obsazeností,
   zrušit lekci (uvolní všechny účastníky). Veřejné: přihlásit/odhlásit z lekce.

**Reference v Ticketariu:** `fitness-slots/migrations/140_fitness_slots.sql`
(`slots` + `slot_participants` + `waitlist`), `entitlement-booking.service.ts` (atomická dráha).

**Riziko:** mění se ostře sledovaný constraint. Mitigace: 1:1 větev se nedotkne (testy musí projít beze změny),
nová větev má vlastní testy včetně souběhu (2 přihlášení na poslední místo → jen 1 uspěje).

**Hotovo když:** migrace `0050` proběhne na živé DB; 1:1 testy zelené; nový test souběhu zelený;
ručně vypsaná lekce kapacity 3 → 4. přihlášení odmítnuto; přečtený řádek `class_sessions` má `booked_count = 3`.

---

## Sprint 10.1 — Archetypy služeb

> **STAV (2026-06-13):** ✅ HOTOVO A OVĚŘENO NAŽIVO PŘES HTTP.
> Backend: `services.archetype` (migrace `0051_service_archetype.sql` aplikována),
> katalog `apps/api/src/services/archetypes.ts` (5 archetypů + `resolveCapacity`),
> DTO `archetype` + `capacity` volitelná, create/update ukládá archetyp a odvozuje
> kapacitu, endpoint `GET /admin/services/archetypes`. Frontend: selektor typu služby
> v `apps/web/src/app/services/page.tsx` (výběr archetypu předvyplní kapacitu) + web API klient.
> Ověřeno (přihlášen jako admin@demo.local): katalog vrací 5 archetypů; vytvoření
> `skupinova_lekce` bez kapacity → capacity 12; `osobni_1_1` → capacity 1 (ověřeno v DB).
> 7 unit testů archetypů zelených; **223 testů API zelených**; db+api+web typecheck zelený.

**Cíl (lidsky):** ať provozovatel nevybírá „kapacita / snap-to-grid", ale rovnou typ:
_Osobní 1:1 / Skupinová lekce / Volný trenér / EMS přístroj / Hybridní blok_.

**Co se mění:**

- `services.archetype` (nový sloupec, enum) + odvozená konfigurace (kapacita, sdílení, cenová politika).
- Mapovací vrstva archetyp → konfigurace (`packages/types` nebo `apps/api/src/services`).
- Admin UI: výběr archetypu při zakládání služby, override jen toho, co chce změnit.

**Reference:** `fitness-slots/src/lib/archetypes.ts` (5 archetypů + `configFromArchetype`).

**Riziko:** nízké, je to konfigurační vrstva nad jádrem z 10.0.

**Hotovo když:** založení služby přes archetyp `skupinova_lekce` nastaví `capacity > 1`;
`osobni_1_1` se chová jako dnešní 1:1; pokryto testy.

---

## Sprint 10.2 — EMS režim (přístroj místo trenéra)

> **STAV (2026-06-13):** ✅ BACKEND HOTOVÝ A OVĚŘENÝ NAŽIVO PŘES HTTP.
> Data: tabulka `resources` (přístroje), `class_sessions.resource_id`, EXCLUDE
> `class_sessions_resource_no_overlap` (stejný přístroj nesmí mít 2 překrývající se
> otevřené lekce) — migrace `0052_resources_ems.sql` aplikována.
> Backend: `apps/api/src/resources/` (ResourcesService CRUD + `admin/resources` API),
> `ClassSessionsService.create` umí EMS = capacity-1 lekce na přístroji (bez trenéra),
> validuje přístroj, mapuje kolizi přístroje na `MACHINE_TAKEN`. `resourceTypes` reexport v @reserved/db.
> Ověřeno (admin@demo.local): EMS služba (archetyp ems_pristrojovy → cap 1) → přístroj →
> lekce na přístroji → join 201 → druhý join SESSION_FULL → druhá lekce na stejný přístroj/čas
> MACHINE_TAKEN; server žije. 6 e2e testů (vč. zámku přístroje), 223+ testů API zelených, typecheck zelený.
> ⏳ ZBÝVÁ (volitelné): admin UI pro správu přístrojů + vypsání EMS lekce; day-swap = sprint 10.3.

**Cíl (lidsky):** EMS trénink = jeden klient na přístroj, pevná délka, řízeno permanentkou.

**Co se mění:**

- EMS = `class_sessions` s `capacity = 1` navázaná na **zdroj/přístroj** místo trenéra.
  → potřeba lehký koncept „resource" (přístroj) — nový sloupec/tabulka `resources`
  (pobočka, název, typ) a volitelná vazba `class_sessions.resource_id`.
- „Day-swap" (přesun v rámci pravidel) řeší rules engine z 10.3.

**Reference:** `ems-booking/migrations/073_ems_booking.sql`, `ems-booking/src/services/*`,
`KONSOLIDACE-EMS.md` (EMS = capacity-1 slot, bez speciální větve — držet se toho).

**Riziko:** střední — zavádí „resource". Držet minimalisticky (přístroj jako pojmenovaný zdroj).

**Hotovo když:** EMS služba vytvoří capacity-1 session na konkrétní přístroj;
dva klienti na stejný přístroj/čas → druhý odmítnut; čerpání permanentky ověřeno.

---

## Sprint 10.3 — Jemnější storno pravidla, kompenzace, doladění permanentek

> **STAV (2026-06-13):** ⏳ ČÁSTEČNĚ — opraveny konkrétní reálné chyby v peněžní cestě
> (ověřeno na živé DB), zbytek (cancellation cascade, kompenzace) je větší a zbývá.
> ✅ HOTOVO + OVĚŘENO: 1) **double-spend kreditů** — `CreditPacksService.deductForBooking`
> a `deductPenalty` teď používají `SELECT ... FOR UPDATE` (row-lock), takže dvě souběžné
> rezervace nestrhnou stejný kredit dvakrát (test: 2 rezervace naráz o 1 kredit → uspěje 1,
> zůstatek 0, nikdy −1). 2) **refund neoživí expirovaný balíček** —
> `refundForBooking` re-aktivuje na 'active' jen neexpirovaný balíček (test: expirovaný
> zůstane used_up, kredit se vrátí do evidence). Soubor: `apps/api/src/credit-packs/credit-packs.service.ts`. 3) **max počet přesunů** — `BookingRules.maxReschedules` (settings, 0 = bez limitu),
> portál (`portal-me.service.ts reschedule`) počítá předchozí přesuny z historie
> (`metadata->>'action'='rescheduled'`) a po limitu vrátí `RESCHEDULE_LIMIT_REACHED`.
> Reschedule beztak nikdy znovu nestrhává kredit (jen mění čas) → „nikdy nový odečet" platí.
> 14 credit-packs + 3 reschedule-limit testy, **229 testů API zelených**.
> ⏳ ZBÝVÁ: rules-engine cancellation cascade (out-of-window penalizace/return-to-permanentka
> konfigurace), kompenzace jako samostatný nárok, reálný
> `charge_storno_fee` (dnes stub v `apps/api/src/rules/action-handlers.ts`), admin override
> out-of-window s auditem. Reference: Ticketarium fitness-slots/lib/{cancellation,compensation}.ts.

**Cíl (lidsky):** storno/přesun s návratem vstupu do permanentky, kompenzace (náhrady),
admin override s auditem — nad rámec dnešního tvrdého okna.

**Co se mění:**

- Rozšířit rules engine o návrat vstupu do permanentky (`return-to-permanentka` in/out window)
  a `evaluateReschedule` (max přesunů, nikdy nová deduce kreditu).
- Dotáhnout `charge_storno_fee` (dnes stub) → reálná penalizace.
- Přidat row-lock do deduct kreditu (dnešní riziko double-spend při souběhu).
- Kompenzace jako samostatný nárok (limit, notice, proof).
- Admin override out-of-window → vyžaduje oprávnění + zápis do audit logu.

**Reference:** `fitness-slots/src/lib/{cancellation,config,compensation}.ts`,
`rules-engine/seeds/pulseup-ems-rules.sql`.

**Riziko:** střední — dotýká se peněz/kreditů. Vše idempotentní + testy na refund/dvojí refund.

**Hotovo když:** storno v okně vrátí vstup do permanentky; mimo okno dle configu;
override zapíše audit; souběžný deduct neukradne kredit dvakrát (test).

---

## Sprint 10.4 — Migrátor z PulseUp (až nakonec)

> **STAV (2026-06-13):** ✅ HOTOVO A OVĚŘENO (jádro: pobočky, klienti, služby, rezervace).
> Modul `packages/db/src/pulseup-import.ts` (`importPulseUp(sql, {tenantId, data, dryRun})`) +
> CLI `pulseup-import-cli.ts` (`pnpm --filter @reserved/db db:import-pulseup <tenantId> <export.json> [--dry-run]`).
> Vlastnosti: deterministická UUID (v5 z pulseup id → idempotentní re-import), FK-aware pořadí
> (branches→customers→services→bookings), mapování stavů CZ→EN (potvrzeno→confirmed, zruseno→cancelled,
> nedostavil_se→no_show…), dry-run (spočítá, nic nezapíše). 5 e2e testů (import+ověření řádků,
> mapování stavů, idempotence, dry-run). ⏳ ZBÝVÁ (rozšíření): import permanentek/kreditů a plateb.

**Cíl (lidsky):** převést existujícího fitness klienta z PulseUpu (pobočky, klienti,
permanentky, sloty, rezervace, platby) do Reserved.

**Co se mění:**

- CLI migrátor (`scripts/` nebo `apps/workers`): deterministické mapování ID, dry-run,
  FK-aware pořadí, mapování stavů CZ→EN.

**Reference:** `pulseup-migration/src/index.ts` a `migrate-*.ts` — hotová logika k přepsání
na schéma Reserved.

**Riziko:** nízké pro produkt (offline nástroj), vysoké pro data → povinný dry-run + shadow běh.

**Hotovo když:** dry-run na vzorku PulseUp dat projde bez chyb; namigrovaná rezervace
sedí na zdroj (přečtený řádek = původní záznam).

---

## Pořadí a závislosti

```
10.0 (jádro: kapacita) ──► 10.1 (archetypy) ──► 10.2 (EMS) ──► 10.3 (pravidla) ──► 10.4 (migrátor)
```

10.0 je povinný základ pro vše. 10.1–10.3 lze dle potřeby prohodit, ale 10.2 staví na 10.0.
10.4 dává smysl až těsně před sháněním prvních klientů (žádní zatím nejsou).

## Full-stack e2e test (2026-06-13)

Pořádný e2e test celého fitness flow proti běžícímu API: `tests/e2e/src/fitness-flow.spec.ts`
(10 testů). Pokrývá registrace tenanta → archetypy (10.1) → skupinová lekce + veřejné
přihlášení + kapacita + duplicita (10.0) → EMS služba + přístroj + EMS lekce + zámek přístroje (10.2).
Spuštění: API běží na :4000, pak `pnpm --filter @reserved/e2e exec vitest run src/fitness-flow.spec.ts`.

## Ověřování (per CLAUDE.md)

Každý sprint je „hotový" teprve po: migrace proběhla na živé DB → `rtk vitest run` zelené
→ ruční scénář projet a **přečtený zpět skutečný řádek** v DB. Žádné „mělo by fungovat".

## Co zůstává v Ticketariu

Nemaže se — slouží jako **referenční předloha** (679 testů, hotová doménová logika).
Z něj se „opisuje" návrh, ne soubory. Po dokončení 10.4 je fitness/EMS plně v Reserved.
