# 14 — Vertikály: Pro co všechno může systém fungovat

> Co rezervujeme je vždy kombinace tří věcí: **čas × entita × zákazník**
> Entita může být člověk (zaměstnanec), prostor (pokoj, místnost), věc (přístroj, auto)
> nebo kombinace všech tří najednou.
> Systém je připraven na všechny kombinace — liší se jen konfigurace, ne architektura.

---

## Jak systém přemýšlí o "co se rezervuje"

V databázi máme tři typy rezervovatelných entit:

```
EMPLOYEE   → konkrétní člověk (kadeřník, terapeut, lektor, doktor)
WORKSPACE  → fyzické místo (pokoj, křeslo, stůl, box, kurt)
RESOURCE   → věc / přístroj / vozidlo (laser, auto, tenisová raketa)
```

Každá rezervace může kombinovat 1–3 typy najednou.
Příklad: **hotelový pokoj s masáží** = WORKSPACE (pokoj) + EMPLOYEE (masér) + čas.

---

## KATEGORIE 1 — Beauty & Wellness

**Kadeřnictví, salóny krásy**
- Co se rezervuje: EMPLOYEE (kadeřník/ka) + volitelně WORKSPACE (křeslo)
- Specifika: permanentky, opakující se střihy, přiřazení ke konkrétnímu zaměstnanci
- Série: zákazník chce vždy Janu, každý 6. týden

**Nehtová studia, manikúra, pedikúra**
- Co se rezervuje: EMPLOYEE + WORKSPACE (místo u stolu)
- Specifika: různé délky služeb (gelové nehty 90 min, lakování 30 min)

**Kosmetické salóny, make-up**
- Co se rezervuje: EMPLOYEE + WORKSPACE (kabina)
- Specifika: přípravný čas, intake formulář (alergie, pleťový typ)

**Masážní a wellness centra**
- Co se rezervuje: EMPLOYEE (masér) + WORKSPACE (masážní box)
- Specifika: couples massage = 2× EMPLOYEE + 1 WORKSPACE; délka variabilní (30/60/90 min)

**Solárium, sauna, vířivka**
- Co se rezervuje: pouze WORKSPACE (kabina, sauna, vana)
- Specifika: bez zaměstnance, přesný čas, cleaning buffer mezi rezervacemi

**Lázeňská centra, spa**
- Co se rezervuje: EMPLOYEE + WORKSPACE + RESOURCE (vodní terapie, přístroje)
- Specifika: balíčkové pobyty (3 procedury v 1 dni), wellness víkendy

**Tetování, piercing**
- Co se rezervuje: EMPLOYEE (umělec)
- Specifika: deposit povinný, dlouhé termíny (2–8 hodin), reference fotky při rezervaci

---

## KATEGORIE 2 — Fitness & Sport

**Fitness centra, posilovny**
- Co se rezervuje: WORKSPACE (stroj, oblast posilovny) nebo jen vstup s kapacitou
- Specifika: hodinové bloky, denní/měsíční permanentky, skupinové lekce

**Skupinové lekce (jóga, pilates, crossfit, zumba)**
- Co se rezervuje: GROUP_SLOT (lekce) s kapacitou
- Specifika: waiting list, séria lekcí, instruktor pevně přiřazen nebo střídání

**Squash, badminton, tenis — kurty**
- Co se rezervuje: WORKSPACE (kurt č. 1, 2, 3)
- Specifika: bez zaměstnance, párové rezervace (2+ zákazníci na 1 kurt), opakující se série

**Plavecký bazén — dráhy**
- Co se rezervuje: WORKSPACE (dráha č. 1–6) nebo vstup s kapacitou
- Specifika: 45minutové bloky, sdílení dráhy (2 plavci na dráhu)

**Golf — greenové časy (tee times)**
- Co se rezervuje: TIME SLOT (čas startu) + WORKSPACE (hřiště / jamky)
- Specifika: skupina 1–4 hráčů, vozíky jako RESOURCE, caddy jako EMPLOYEE

**Bowlingové dráhy**
- Co se rezervuje: WORKSPACE (dráha č. 1–20)
- Specifika: hodinové bloky, skupinové rezervace, obuv jako RESOURCE

**Lezecká centra, bouldering**
- Co se rezervuje: vstup s kapacitou (WORKSPACE = celá stěna/oblast)
- Specifika: instruktor lezení jako EMPLOYEE (volitelně), kurzy jako GROUP_SLOT

**Jezdecké školy, koně**
- Co se rezervuje: EMPLOYEE (instruktor) + RESOURCE (konkrétní kůň)
- Specifika: kůň je RESOURCE s vlastní dostupností (může být nemocný, odpočívá)

**Hokej, fotbal, futsal — hřiště a haly**
- Co se rezervuje: WORKSPACE (hřiště, hala)
- Specifika: týmové rezervace (1 zákazník = celý tým), hodinové nebo 90minutové bloky

---

## KATEGORIE 3 — Zdravotnictví & Terapie

**Ordinace lékaře (praktik, specialista)**
- Co se rezervuje: EMPLOYEE (doktor) + WORKSPACE (ordinace)
- Specifika: HIPAA/GDPR přísné, intake formulář, pojišťovna jako platební metoda, různé typy návštěv (nový pacient, kontrola, urgentní)

**Fyzioterapie, rehabilitace**
- Co se rezervuje: EMPLOYEE (fyzioterapeut) + WORKSPACE (kabinet) + RESOURCE (přístroje)
- Specifika: série sezení (permanentka), progresy v kartě pacienta

**Psychologie, psychoterapie, psychiatrie**
- Co se rezervuje: EMPLOYEE (terapeut)
- Specifika: pravidelné týdenní sezení (série), přísná diskrétnost, online i offline

**Zubní ordinace**
- Co se rezervuje: EMPLOYEE (zubař) + WORKSPACE (křeslo) + RESOURCE (RTG přístroj)
- Specifika: různé délky procedur, prerekvizity (RTG před výtahem)

**Nutriční poradna, dietologie**
- Co se rezervuje: EMPLOYEE + volitelně WORKSPACE
- Specifika: séria konzultací, sdílení dat z měření

**Veterinář**
- Co se rezervuje: EMPLOYEE (doktor) + WORKSPACE (ordinace)
- Specifika: zákazník = majitel, pacient = zvíře (extra pole v kartě), různé druhy zvířat

**Optometrie, oční ordinace**
- Co se rezervuje: EMPLOYEE + WORKSPACE + RESOURCE (přístroje na měření)
- Specifika: prerekvizity (kapky do očí = čekání 20 min před vyšetřením)

**Laserová centra (epilace, oční)**
- Co se rezervuje: EMPLOYEE + WORKSPACE + RESOURCE (laser)
- Specifika: certifikace zaměstnance povinná, kontraindikační formulář, série procedur

**Domácí péče, home care**
- Co se rezervuje: EMPLOYEE (sestra, pečovatel) + adresa zákazníka
- Specifika: zaměstnanec cestuje k zákazníkovi, geo-routing, délka jízdy jako buffer

---

## KATEGORIE 4 — Vzdělávání & Koučink

**Jazykové školy, doučování**
- Co se rezervuje: EMPLOYEE (lektor) + volitelně WORKSPACE (učebna)
- Specifika: skupinová i individuální výuka, online i offline, série lekcí, úrovně

**Hudební školy (piano, kytara, zpěv)**
- Co se rezervuje: EMPLOYEE (učitel) + RESOURCE (instrument, studio)
- Specifika: série 1× týdně, dítě jako zákazník (rodič jako plátce)

**Driving school — autoškola**
- Co se rezervuje: EMPLOYEE (instruktor) + RESOURCE (auto)
- Specifika: auto má vlastní dostupnost, žák musí mít splněné prerekvizity (teorie)

**Sportovní trenéři, personal trainer**
- Co se rezervuje: EMPLOYEE (trenér) + WORKSPACE (posilovna nebo venku)
- Specifika: séria tréninků, pokrok v kartě klienta, outdoor = bez workspace

**Life coaching, business koučink**
- Co se rezervuje: EMPLOYEE (kouč)
- Specifika: online (Zoom/Meet), série sezení, přísná diskrétnost

**Letecký výcvik (simulátory, letadla)**
- Co se rezervuje: EMPLOYEE (instruktor) + RESOURCE (letadlo nebo simulátor)
- Specifika: simulátor i letadlo mají vlastní dostupnost a maintenance okna

**Technické kurzy, workshopy**
- Co se rezervuje: GROUP_SLOT (workshop) s kapacitou + WORKSPACE (učebna/lab)
- Specifika: prerekvizity (nutno absolvovat kurz A před kurzem B)

---

## KATEGORIE 5 — Hospitality & Ubytování

**Hotely — pokoje**
- Co se rezervuje: WORKSPACE (pokoj kategorie nebo konkrétní)
- Specifika: multi-day rezervace (check-in/check-out), rate plans (rack/BAR/corporate), OTA integrace, housekeeping buffer, pokoj jako surovina (ne zaměstnanec)

**Hotely — hotelové služby**
- Co se rezervuje: EMPLOYEE (masér, osobní trenér) + WORKSPACE (spa, fitness)
- Specifika: propojení s rezervací pokoje, in-house zákazník

**Apartmány, Airbnb-styl**
- Co se rezervuje: WORKSPACE (apartmán)
- Specifika: klíče, smart lock, cleaning slot mezi rezervacemi jako povinný buffer

**Penziony, chaty, kempy**
- Co se rezervuje: WORKSPACE (bungalov, chata, parkovací místo pro karavan)
- Specifika: sezónní ceny, min/max délka pobytu, extra lůžka jako RESOURCE

**Coworking prostory**
- Co se rezervuje: WORKSPACE (stůl, box, kancelář) + RESOURCE (projektor, tiskárna)
- Specifika: hodinové / denní / měsíční plány, přístupové kódy, sdílení v reálném čase

**Meeting rooms, konferenční sály**
- Co se rezervuje: WORKSPACE (sál, zasedačka) + RESOURCE (technika, catering)
- Specifika: firemní zákazníci, fakturace, kapacita, layout (divadlo/školní/banket)

**Glamping, treehousy, lodě**
- Co se rezervuje: WORKSPACE (konkrétní glamping unit)
- Specifika: sezónnost, extrémní, minimální délka pobytu

---

## KATEGORIE 6 — Automotive & Doprava

**Autoservisy**
- Co se rezervuje: EMPLOYEE (mechanik) + WORKSPACE (stánek) + RESOURCE (zvedák, diagnostika)
- Specifika: auto zákazníka je "pacient" (SPZ, VIN v kartě), odhadovaná délka práce, náhradní vozidlo jako RESOURCE

**Autoumývárny, detailing**
- Co se rezervuje: WORKSPACE (box) + volitelně EMPLOYEE
- Specifika: různé délky (mytí 30 min, full detailing 8 hodin), venkovní vs. krytý

**Půjčovny aut**
- Co se rezervuje: RESOURCE (konkrétní auto nebo kategorie)
- Specifika: multi-day, kauce, pojistka, stav vozidla při převzetí/vrácení, klíčový box

**Půjčovny kol, skútrů, e-koloběžek**
- Co se rezervuje: RESOURCE (konkrétní kus nebo kategorie)
- Specifika: hodinové/denní, GPS tracking, stav baterie

**Taxislužby, chauffeur**
- Co se rezervuje: EMPLOYEE (řidič) + RESOURCE (auto)
- Specifika: časové i trasové rezervace, pickup/dropoff lokace, vzdálenostní cena

**Parkovací místa**
- Co se rezervuje: WORKSPACE (parkovací místo č. 12)
- Specifika: hodinové, denní, měsíční; licence plate recognition; bez zaměstnance

**Přeprava (lodě, vrtulníky, soukromé lety)**
- Co se rezervuje: RESOURCE (loď, vrtulník) + EMPLOYEE (pilot, kapitán)
- Specifika: kapacita cestujících, počasí jako blokátor, safety checklist

---

## KATEGORIE 7 — Kultura & Entertainment

**Únikové místnosti (escape rooms)**
- Co se rezervuje: WORKSPACE (konkrétní room) + GROUP_SLOT
- Specifika: celá skupina = 1 rezervace (2–6 lidí), reset čas 30 min po každé hře

**Paintball, laser game, VR arcade**
- Co se rezervuje: WORKSPACE (aréna) + GROUP_SLOT
- Specifika: skupinové, vybavení jako RESOURCE, různé délky her

**Divadla, kina, koncertní sály**
- Co se rezervuje: WORKSPACE (konkrétní sedadlo na seat mapě)
- Specifika: toto je ticketing, ne scheduling — blíže Eventbrite než Reservio

**Muzea, galerie (time-slotted entry)**
- Co se rezervuje: GROUP_SLOT (vstup v časovém pásmu) s kapacitou
- Specifika: bez konkrétního místa, jen kapacita vstupu za hodinu

**Photo studia**
- Co se rezervuje: WORKSPACE (studio) + volitelně EMPLOYEE (fotograf)
- Specifika: cleaning/setup buffer, vybavení (pozadí, osvětlení) jako RESOURCE

**Nahrávací studia**
- Co se rezervuje: WORKSPACE (studio A, B) + RESOURCE (mikrofony, mixér)
- Specifika: hodinové bloky, záloha povinná, technický inženýr jako volitelný EMPLOYEE

---

## KATEGORIE 8 — Profesionální služby & B2B

**Právníci, notáři**
- Co se rezervuje: EMPLOYEE (advokát)
- Specifika: délka konzultace variabilní, online i offline, faktura po každé schůzce

**Účetní, daňoví poradci**
- Co se rezervuje: EMPLOYEE
- Specifika: sezónní špičky (daňové přiznání), blocking pro daňové sezóny

**Finanční poradci, pojišťovací agenti**
- Co se rezervuje: EMPLOYEE
- Specifika: série konzultací, CRM napojení

**Realitní makléři — prohlídky**
- Co se rezervuje: EMPLOYEE (makléř) + WORKSPACE (nemovitost = speciální workspace)
- Specifika: nemovitost je dočasně v inventáři (dokud se neprodá), overlap management

**HR konzultanti, headhunteři — pohovory**
- Co se rezervuje: EMPLOYEE + WORKSPACE (meeting room)
- Specifika: kandidát jako zákazník, panel pohovory (více interviewerů = více EMPLOYEE)

**IT consulting, development agentury**
- Co se rezervuje: EMPLOYEE (konzultant, vývojář)
- Specifika: projekty jako série, fakturace per hodinu

---

## KATEGORIE 9 — Státní správa & Veřejný sektor

**Úřady (pasy, ŘP, sociálka)**
- Co se rezervuje: WORKSPACE (přepážka č. 3) nebo EMPLOYEE (úředník)
- Specifika: bez platby, potvrzení e-mailem/SMS, řízení front, kapacita

**Soudní stání, notářské zápisy**
- Co se rezervuje: EMPLOYEE (soudce, notář) + WORKSPACE (síň)
- Specifika: přísná pravidla, povinná identifikace

**Zdravotní pojišťovny — screeningy**
- Co se rezervuje: WORKSPACE (mobilní screening bus) + EMPLOYEE (technik)
- Specifika: pojišťovna jako plátce, zákazník = pojištěnec

**Veřejné sportoviště (basketbalové kurty, fotbalová hřiště)**
- Co se rezervuje: WORKSPACE
- Specifika: bez platby nebo nominální poplatek, identita přes občanský průkaz

---

## KATEGORIE 10 — Zvláštní entity (co systém umí rezervovat mimo lidi)

Toto je klíčová sekce — systém může rezervovat **cokoliv co má dostupnost v čase**.

| Entita | Typ | Příklady |
|--------|-----|---------|
| Člověk | EMPLOYEE | Kadeřník, doktor, lektor, trenér, řidič |
| Místnost | WORKSPACE | Ordinace, masážní box, kurt, sál |
| Konkrétní místo | WORKSPACE | Křeslo č. 3, stůl č. 12, parkovací místo |
| Přístroj / zařízení | RESOURCE | Laser, MRI, solárium, projektor |
| Vozidlo | RESOURCE | Auto, lodě, vrtulník, kolo |
| Zvíře | RESOURCE | Kůň (jezdecká škola), terapeutický pes |
| Pokoj / apartmán | WORKSPACE | Hotelový pokoj, chata, apartmán |
| Venkovní prostor | WORKSPACE | Zahradní terasa, glamping parcel |
| Sedadlo | WORKSPACE | Sedadlo v divadle (seat map) |
| Dráha | WORKSPACE | Bazénová dráha, bowlingová dráha |
| Slot s kapacitou | GROUP_SLOT | Vstup do muzea v 10:00, skupinová lekce |
| Online meeting | VIRTUAL | Zoom/Meet link vygenerovaný automaticky |
| Kombinace | COMPOUND | Pokoj + raňajky + masáž (hotel package) |

---

## Co systém NEUMÍ (bez rozšíření)

Tyto use-cases jsou mimo současnou architekturu nebo vyžadují specializovaný modul:

**Letecké letenky / GDS**
Vyžaduje napojení na Amadeus/Sabre/Travelport. Inventář sedadel je v GDS, ne v naší DB.

**E-commerce s fyzickým produktem**
Rezervace + e-shop se zásobami. Vyžaduje inventory management (Shopify-styl warehouse).

**Ticketing s číslovanými sedadly (divadla, stadiony)**
Seat mapa + real-time lock při výběru (race condition) vyžaduje specializované ticketing řešení.

**Sdílená ekonomika (Uber, Airbnb marketplace)**
Náš systém je B2C pro jednoho provozovatele, ne marketplace s tisíci poskytovateli.

**Hazardní hry, sázkové kanceláře**
Regulatorní požadavky jsou mimo scope.

---

## Matice: Co naše DB schema zvládne dnes

| Use-case | Employee | Workspace | Resource | Group Slot | Series | Multi-day | Notes |
|----------|----------|-----------|----------|------------|--------|-----------|-------|
| Kadeřnictví | ✓ | ✓ | — | — | ✓ | — | |
| Masáže/spa | ✓ | ✓ | ✓ | — | ✓ | — | |
| Fitness lekce | ✓ | — | — | ✓ | ✓ | — | |
| Kurt/dráha | — | ✓ | — | — | ✓ | — | |
| Hotel pokoj | — | ✓ | — | — | — | ✓ | check-in/out |
| Hotel + spa | ✓ | ✓ | ✓ | — | — | ✓ | compound |
| Autoservis | ✓ | ✓ | ✓ | — | — | — | |
| Půjčovna aut | — | — | ✓ | — | — | ✓ | |
| Doktor | ✓ | ✓ | ✓ | — | ✓ | — | HIPAA flag |
| Fyzioterapie | ✓ | ✓ | ✓ | — | ✓ | — | |
| Lektor | ✓ | ✓ | — | ✓ | ✓ | — | |
| Coworking | — | ✓ | ✓ | — | ✓ | ✓ | |
| Escape room | — | ✓ | — | ✓ | — | — | |
| Photo studio | ✓ | ✓ | ✓ | — | — | — | |
| Jezdecká škola | ✓ | — | ✓ | — | ✓ | — | kůň=resource |
| Autoškola | ✓ | — | ✓ | — | ✓ | — | auto=resource |
| Parking | — | ✓ | — | — | ✓ | ✓ | |
| Muzeum vstup | — | — | — | ✓ | — | — | kapacita |
| Úřad | ✓ | ✓ | — | — | — | — | bez platby |

---

## Tři klíčové konfigurace pro nové vertikály

**Konfigurace A: "Jen prostor, bez člověka"**
*(solária, kurty, parkoviště, pokoje)*
```
employee_required = false
workspace_required = true
resource_required = false
booking_unit = "workspace"
price_model = "per_hour" nebo "per_night"
cleaning_buffer_minutes = 30
```

**Konfigurace B: "Jen člověk, bez prostoru"**
*(online poradci, online koučové, online lékaři)*
```
employee_required = true
workspace_required = false
online_meeting_provider = "zoom"
meeting_link_auto_generate = true
timezone_aware = true   -- zákazník v jiném TZ
```

**Konfigurace C: "Věc s vlastní dostupností"**
*(půjčovny, jezdecké školy, autoservisy)*
```
resource_required = true
resource_has_own_schedule = true
resource_maintenance_buffer = true
resource_quantity > 1   -- více kusů stejné kategorie
customer_can_choose_specific = false   -- nebo true (konkrétní kůň)
```

---

## Co je potřeba přidat do DB pro nové vertikály

### Pro hotely (multi-day rezervace)

```sql
-- Přidat do bookings:
ALTER TABLE bookings ADD COLUMN check_in_date  DATE;
ALTER TABLE bookings ADD COLUMN check_out_date DATE;
ALTER TABLE bookings ADD COLUMN nights_count   INTEGER 
  GENERATED ALWAYS AS (check_out_date - check_in_date) STORED;

-- Rate plans (hotelové ceníky jsou složitější než servisní)
CREATE TABLE rate_plans (
  id            UUID PRIMARY KEY,
  tenant_id     UUID NOT NULL,
  name          VARCHAR(100),   -- 'Rack Rate', 'BAR', 'Corporate', 'Package'
  workspace_id  UUID,           -- NULL = platí pro všechny pokoje
  price_per_night INTEGER NOT NULL,
  min_nights    INTEGER DEFAULT 1,
  max_nights    INTEGER,
  conditions    JSONB
  -- breakfast_included, refundable, advance_purchase, ...
);

-- Workspace pro hotely má extra atributy
ALTER TABLE workspaces ADD COLUMN floor         INTEGER;
ALTER TABLE workspaces ADD COLUMN view_type     VARCHAR(50);  -- 'sea','garden','city'
ALTER TABLE workspaces ADD COLUMN bed_config    VARCHAR(50);  -- 'king','twin','double'
ALTER TABLE workspaces ADD COLUMN max_occupancy INTEGER;
ALTER TABLE workspaces ADD COLUMN smoking       BOOLEAN DEFAULT FALSE;
```

### Pro vozidla / půjčovny

```sql
-- Resource pro vozidla
ALTER TABLE resources ADD COLUMN license_plate VARCHAR(20);
ALTER TABLE resources ADD COLUMN vin           VARCHAR(17);
ALTER TABLE resources ADD COLUMN year          SMALLINT;
ALTER TABLE resources ADD COLUMN mileage       INTEGER;
ALTER TABLE resources ADD COLUMN fuel_type     VARCHAR(20);
ALTER TABLE resources ADD COLUMN insurance_expires DATE;
ALTER TABLE resources ADD COLUMN last_service_date DATE;

-- Stav vozidla při předání
CREATE TABLE resource_condition_logs (
  id            UUID PRIMARY KEY,
  resource_id   UUID NOT NULL,
  booking_id    UUID,
  condition_type VARCHAR(10),   -- 'pickup', 'return'
  mileage       INTEGER,
  fuel_level    SMALLINT,       -- 0-100 %
  damage_notes  TEXT,
  photos        TEXT[],         -- S3 URLs
  signed_by     UUID,
  logged_at     TIMESTAMPTZ DEFAULT NOW()
);
```

### Pro zdravotnictví (HIPAA/GDPR enhanced)

```sql
-- Citlivé zdravotní záznamy (šifrované at-rest)
CREATE TABLE medical_records (
  id            UUID PRIMARY KEY,
  tenant_id     UUID NOT NULL,
  customer_id   UUID NOT NULL,
  booking_id    UUID,
  
  record_type   VARCHAR(30),  -- 'diagnosis','prescription','note','lab_result'
  content       TEXT,         -- šifrováno PGP klíčem tenant
  encrypted     BOOLEAN DEFAULT TRUE,
  
  created_by    UUID NOT NULL,
  created_at    TIMESTAMPTZ DEFAULT NOW(),
  
  -- Přístup loguje se vždy
  access_log    JSONB DEFAULT '[]'
);

-- Pojišťovny jako platební metoda
CREATE TABLE insurance_providers (
  id            UUID PRIMARY KEY,
  tenant_id     UUID NOT NULL,
  name          VARCHAR(100),
  code          VARCHAR(20),
  billing_config JSONB
);

ALTER TABLE customers ADD COLUMN insurance_id   UUID REFERENCES insurance_providers(id);
ALTER TABLE customers ADD COLUMN insurance_number VARCHAR(50);
```

### Pro seat-map (divadla, stadiony, bazény)

```sql
-- Fyzická mapa sedadel/míst
CREATE TABLE seat_maps (
  id            UUID PRIMARY KEY,
  workspace_id  UUID NOT NULL,   -- sál, bazén, hřiště
  layout        JSONB NOT NULL   -- SVG nebo grid koordináty
);

CREATE TABLE seats (
  id            UUID PRIMARY KEY,
  seat_map_id   UUID NOT NULL,
  code          VARCHAR(20),     -- 'A12', 'řada 3 místo 7'
  row_label     VARCHAR(10),
  seat_number   INTEGER,
  category      VARCHAR(30),     -- 'VIP', 'standard', 'wheelchair'
  x_pos         INTEGER,         -- pro vizualizaci
  y_pos         INTEGER,
  is_active     BOOLEAN DEFAULT TRUE
);

-- Seat se stává WORKSPACE s workspace_id = seat.id
```
