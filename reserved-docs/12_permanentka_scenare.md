# 12 — Permanentka: Kompletní scénáře & Edge Cases

> Systematická analýza všech možných stavů, akcí a výjimek pro opakující se rezervace.
> Cíl: být připraven na každý scénář před tím, než ho systém musí řešit za provozu.

---

## Základní datový model série (rozšířený)

```
RecurringSeries
  id                    UUID
  tenant_id             UUID
  customer_id           UUID
  service_id            UUID
  employee_id           UUID (nullable — "kdokoli")
  branch_id             UUID
  resource_ids          UUID[]          -- místnost, přístroj
  
  -- Recurrence pravidla
  recurrence_type       ENUM(daily, weekly, biweekly, monthly, custom)
  recurrence_day        VARCHAR         -- "wednesday"
  recurrence_time       TIME            -- 15:00
  recurrence_interval   INTEGER         -- každý X týdnů
  
  -- Životní cyklus série
  series_start_date     DATE
  series_end_date       DATE (nullable) -- null = nekonečná
  series_status         ENUM(active, paused, suspended, terminated, completed)
  
  -- Počítadla
  free_cancels_total    INTEGER DEFAULT 2
  free_cancels_used     INTEGER DEFAULT 0
  reschedules_total     INTEGER DEFAULT 3
  reschedules_used      INTEGER DEFAULT 0
  pauses_total          INTEGER DEFAULT 2  -- kolikrát smí série pauznout za rok
  pauses_used           INTEGER DEFAULT 0
  
  -- Přiřazování (sharing / splitting)
  shareable             BOOLEAN DEFAULT false
  shared_slots          JSONB[]         -- kdo kdy "zdědil" slot
  
  -- Finanční
  price_per_session     DECIMAL
  billing_type          ENUM(per_session, monthly, prepaid_block)
  prepaid_sessions_total INTEGER
  prepaid_sessions_used  INTEGER
  prepaid_sessions_remaining INTEGER
  
  -- Meta
  notes                 TEXT
  internal_notes        TEXT
  created_by            UUID
  created_at            TIMESTAMP
  updated_at            TIMESTAMP

RecurringBooking (jednotlivá lekce v sérii)
  id                    UUID
  series_id             UUID FK RecurringSeries
  booking_id            UUID FK Bookings   -- odkaz na konkrétní rezervaci
  sequence_number       INTEGER            -- pořadí v sérii (1, 2, 3…)
  original_date         DATE               -- plánovaný datum (i po přesunu)
  actual_date           DATE               -- skutečný datum
  status                ENUM(scheduled, completed, cancelled_free, cancelled_paid,
                              rescheduled_out, rescheduled_in, paused, skipped,
                              gifted, substituted, no_show, pending_makeup)
  substituted_for       UUID nullable      -- cizí zákazník dostal tento slot
  makeup_for            UUID nullable      -- tento slot je náhrada za jiný
  cancellation_reason   ENUM(...)
  notes                 TEXT
```

---

## SKUPINA 1 — Pauzy v sérii

### 1.01 Jednorázová pauza (jedna lekce)
Zákazník ví předem, že příští středu nemůže.

**Varianty:**
- a) Lekce se prostě přeskočí (slot se uvolní, zákazník neplatí)
- b) Lekce se přeskočí ale zákazník platí (závazek v permanentce)
- c) Lekce se přesune na konec série (slot se zachová, jen jinde)
- d) Slot se nabídne náhradníkovi z waiting listu

**Systémové požadavky:**
- Označit RecurringBooking.status = `skipped` nebo `paused`
- Série musí vědět, zda přeskočená lekce „propadá" nebo se „přidává na konec"
- Odpověď závisí na billing_type: prepaid_block → lekce se nepropadá, přidá se; per_session → propadá

---

### 1.02 Blokovaná pauza (více po sobě jdoucích lekcí)
Zákazník odjíždí na 3 týdny.

**Varianty:**
- a) Série se pozastaví na přesné datum rozmezí (série_start_pause, série_end_pause)
- b) Po návratu pokračuje přesně kde skončila (stejný den v týdnu)
- c) Lekce za dobu pauzy propadají (per_session billing)
- d) Lekce za dobu pauzy se přidají na konec série (prepaid)
- e) Zákazník zaplatí "maintenance fee" za pauzu (místo drží obsazené)
- f) Zákazník zruší permanentku, po návratu si rezervuje novou

**Edge cases:**
- Co když zaměstnanec mezitím odejde? → série musí mít fallback employee
- Co když se zaplní kapacita a zákazník se po pauze nemůže vrátit na svůj slot? → priority reinstatement
- Co když pauza trvá déle než plánovaná série? → série se prodloužuje nebo ukončuje

**Počítadlo pauz:**
- Systém musí hlídat: zákazník smí pauzovat max. X týdnů za rok
- Po překročení limitu: pauza se přemění na ukončení série

---

### 1.03 Nucená pauza (nemoc zákazníka)
Zákazník je nemocný, nevěděl dopředu, zrušil ve 13:00 na dnešní 15:00 slot.

**Varianty:**
- a) Systém to vyhodnotí jako "pozdní storno" → poplatek
- b) Zákazník doloží omluvenku → systém přepíše na "force majeure cancel" → bez poplatku
- c) Admin manuálně přepíše status na výjimku
- d) Série má konfiguraci "první nemoc za rok bez poplatku"

**Dokladování:**
- Možnost přiložit PDF/foto (nemocenský lístek)
- Admin workflow: schválit/zamítnout omluvenku
- Audit trail: kdo schválil, kdy, proč

---

### 1.04 Nucená pauza (nemoc poskytovatele / zaměstnance)
Jana je nemocná. Zákazník má u ní permanentku na středu.

**Varianty:**
- a) Slot se zruší, zákazník neplatí (business cancel)
- b) Slot se nabídne náhradnímu zaměstnanci (stejná dovednost)
- c) Zákazník si vybere: náhradník nebo přesun na konec série
- d) Zákazník odmítne náhradníka → přesun na konec série bez využití reschedule počítadla

**Klíčové:** Tato událost NESMÍ jít z počítadla zákazníka (free_cancels, reschedules). Je to business cancel. Systém musí rozlišit, kdo inicioval storno.

**Dopad na billing:**
- Zákazník nemá platit za lekci, která se neuskutečnila vinou poskytovatele
- Pokud má předplacený blok: lekce se musí přidat zpět na konec série

---

### 1.05 Technická pauza (zavřeno, svátek, rekonstrukce)
Provozovna je zavřená na státní svátek nebo renovaci.

**Varianty:**
- a) Admin hromadně uzavře rozsah dat → série se automaticky přeskočí
- b) Zákazníci dostanou notifikaci X dní předem
- c) Lekce se buď propadnou nebo přesunou na konec (dle konfigurace série)
- d) Zákazník si může vybrat individuálně

**Hromadný dopad:**
- Série 50 zákazníků × státní svátek = 50 individuálních rozhodnutí
- Systém musí zvládnout batch operaci: "pro všechny série v tuto středu: přesuň na konec"

---

### 1.06 Pauza série vs. pauza jedné lekce — rozlišení

```
PauseType:
  SINGLE_SESSION  → přeskočení jedné lekce (status: skipped)
  DATE_RANGE      → přeskočení rozsahu (series_status: paused + date range)
  INDEFINITE      → pauza na neurčito (series_status: paused, no end date)
  FORCED_BUSINESS → pauza z důvodu poskytovatele (nesmí jít z počítadla)
  FORCE_MAJEURE   → nemoc, nouzová situace (výjimka z poplatku)
```

---

## SKUPINA 2 — Přesuny v sérii

### 2.01 Přesun na konec série (základní)
Zákazník chce přesunout středu 15.1. na konec série.

**Co systém musí udělat:**
1. Zjistit datum poslední rezervace v sérii
2. Přidat nový slot s +1 interval (za poslední)
3. Ověřit dostupnost zaměstnance v novém termínu
4. Pokud nedostupný: nabídnout nejbližší dostupný slot po posledním
5. Označit původní slot jako `rescheduled_out`
6. Nový slot označit jako `rescheduled_in` s `makeup_for = původní slot`
7. Odečíst 1 z reschedules_used
8. Notifikovat zákazníka i zaměstnance

**Edge cases:**
- Série je nekonečná (series_end_date = null) → nový slot se prostě přidá za aktuálně poslední
- Zákazník přesune 3× → posledních 5 lekcí v sérii jsou 2 původní + 3 náhradní
- Pořadí náhradních lekcí musí být jasně označeno

---

### 2.02 Přesun na konkrétní datum (mimo konec série)
Zákazník chce lekci z 15.1. přesunout na 22.1. (příští středu, ne na konec).

**Varianty:**
- a) Povoleno — zákazník si vybere libovolný slot
- b) Povoleno jen pokud je dostupný slot v stejném týdnu
- c) Povoleno jen na sousední slot (adjacent)
- d) Zakázáno — pouze přesun na konec série

**Pravidlo konfigurace:**
```jsonc
"reschedule_strategy": "end_of_series" | "any_available" | "adjacent_only" | "same_week_only"
```

---

### 2.03 Přesun série jako celku (shift série)
Zákazník přechází z večerního času na dopolední: každou středu 10:00 místo 15:00.

**Varianty:**
- a) Admin změní čas pro všechny budoucí lekce série (bulk update)
- b) Admin změní od konkrétní lekce (split série: část A = starý čas, část B = nový čas)
- c) Zákazník požádá, admin schválí
- d) Zákazník smí požádat max. X× za rok

**Systémové požadavky:**
- Bulk update budoucích lekcí: update všech RecurringBooking kde actual_date > today
- Historie: zobrazit, že série měla změnu (kdy, kdo, z čeho na co)
- Notifikace: zákazník i zaměstnanec dostane nový rozvrh

---

### 2.04 Přesun serie na jiného zaměstnance
Jana odchází z firmy. Zákazník má permanentku u Jany.

**Varianty:**
- a) Admin přeřadí sérii na Petru (+ souhlas zákazníka)
- b) Zákazník si vybere náhradníka ze seznamu dostupných
- c) Zákazník odmítne náhradníka → série se ukončí (a jak se vypořádají předplacené lekce?)
- d) Série se zmrazí do té doby, než se Jana vrátí (nebo do X dnů, pak se ukončí)

**Speciální případ:** Zákazník chce jen Janu, nikdo jiný nepřipadá v úvahu. Co systém nabídne?
- Upozornění že Jana je nedostupná + datum návratu (pokud je znám)
- Pauza série na dobu určitou
- Ukončení série s refundem nevyčerpaných lekcí

---

### 2.05 Přesun na jinou pobočku
Zákazník se přestěhoval, chce pokračovat sérii v jiné pobočce.

**Varianty:**
- a) Stejný zaměstnanec v jiné pobočce (pokud tam pracuje)
- b) Jiný zaměstnanec, jiná pobočka (zákazník vybere)
- c) Cena v nové pobočce je jiná → jak se to vypořádá s předplaceným blokem?
- d) Nová pobočka nemá daný slot k dispozici → zákazník si vybere jiný čas

**Finanční dopad:**
- Předplacený blok z pobočky A → credit se přenese do pobočky B
- Pokud je cena vyšší v B: zákazník doplatí rozdíl
- Pokud je nižší: dostane kredit nebo refund

---

### 2.06 Přesun na jinou službu
Zákazník chce z hodinové masáže přejít na 90minutovou masáž.

- a) Série se ukončí, vytvoří se nová série
- b) Série se modifikuje od konkrétní lekce (split)
- c) Cena: rozdíl se doplatí nebo odečte z kreditu
- d) Délka se změní → může kolidovat s dalšími rezervacemi zaměstnance po daném čase

---

## SKUPINA 3 — Sdílení a půlení slotu (Sharing/Gifting)

### 3.01 Dočasné darování lekce (jednorázové)
Zákazník nemůže přijít, chce dát svůj slot kamarádce.

**Varianty:**
- a) Zákazník zašle jméno a e-mail náhradníka → admin schválí → náhradník dostane pozvánku
- b) Zákazník sdílí odkaz → náhradník si sám rezervuje (ověřuje se, že slot není obsazený)
- c) Zákazník si vybere ze svých "oblíbených" kontaktů v portálu
- d) Náhradník musí být registrovaný zákazník systému
- e) Náhradník může být kdokoli (bez registrace)

**Finanční dopad:**
- Lekce se zákazníkovi z permanentky neodečte (daroval slot, ne lekci)
- Náhradník buď platí nebo ne (dle konfigurace série)
- Pokud náhradník platí → kdo dostane platbu? (zákazník nebo podnik?)

**Systémové požadavky:**
```
RecurringBooking.status = "gifted"
RecurringBooking.substituted_for = náhradník customer_id
Původní zákazník: lekce se neodečte z prepaid_sessions_used
Náhradník: vytvoří se jednorázová rezervace s odkazem na sérii
```

---

### 3.02 Trvalé darování lekcí (série přechází na jiného)
Zákazník ukončuje permanentku, zbývají mu 4 lekce. Chce je "převést" na manžela.

**Varianty:**
- a) Série se ukončí zákazníkovi, vytvoří se nová série pro manžela od aktuálního data
- b) Zbývající lekce se přenesou jako kredit na manžela (ne jako série, ale jako volné lekce)
- c) Nelze — série je vázána na konkrétního zákazníka
- d) Přenos schvaluje admin (s potvrzením obou stran)

**Podmínky:**
- Přenos smí proběhnout jen na zákazníka, který je v systému
- Cena série musí být kompatibilní (nebo se doplatí rozdíl)
- Zaměstnanec musí souhlasit (nebo je přiřazení "kdokoli")

---

### 3.03 Půlení slotu — dvě osoby, jeden slot (Couples/Duo)
Zákaznice přivede partnerku, obě chtějí sdílet jeden slot (třeba párová masáž nebo jen přítomnost).

**Varianty:**
- a) Slot je definován jako "2 osoby" od začátku → oba jsou zaregistrovaní → obě dostanou potvrzení
- b) Primární zákazník přidá "guest" jméno bez registrace
- c) Oba platí separátně (split billing)
- d) Jeden platí, druhý jen doprovodí
- e) Zákazník přidá druhou osobu jen na konkrétní lekci, ne na celou sérii

**Systémové požadavky:**
- Serie má `participant_type: solo | duo | group`
- Každý účastník má vlastní profil a vlastní komunikaci
- Cancellation policy se vztahuje na všechny nebo jen na primárního zákazníka

---

### 3.04 Půlení slotu — dva zákazníci střídají se
Dvě zákaznice se střídají: jedna přijde každý lichý týden, druhá každý sudý.

**Varianty:**
- a) Admin vytvoří dvě série se vzájemně se vylučujícími daty
- b) Systém to nativně neumí — admin to řeší ručně
- c) Speciální typ série: `alternating`, kde se definují dva zákazníci a interval střídání

**Edge case:** Co když jedna zákaznice zruší svůj týden → může si vzít týden té druhé? Nebo se slot uvolní?

---

### 3.05 Skupinová permanentka (3–10 lidí, jeden slot)
Firemní lekce jógy: 8 zaměstnanců každý pátek 12:00.

**Varianty:**
- a) Jeden "organizer" drží sérii, ostatní jsou jen účastníci
- b) Každý má vlastní sérii na stejný slot (8× RecurringSeries na stejný čas)
- c) Hybridní: jedna GroupSerie, více zákazníků

**Storno skupinové série:**
- Organizátor zruší → všichni jsou odhlášeni → kdo dostane notifikaci?
- Jeden účastník zruší → slot pro ostatní zůstává
- Počítadla: jsou individuální nebo sdílená?

---

### 3.06 Náhradní zákazník z waiting listu
Zákazník zruší lekci v sérii → slot se uvolní → systém ho nabídne waiting listu.

**Varianty:**
- a) Nabídne se prvnímu v pořadí → X minut timeout → pak dalšímu
- b) Nabídne se zákazníkovi, který čeká na celoroční sérii (priority pro zákazníky chtějící permanentku)
- c) Nabídne se jen jako jednorázová lekce (ne jako vstup do série)
- d) Zákazník z waiting listu "vstoupí" do série od tohoto momentu

**Klíčová otázka:** Pokud náhradník přijde z waiting listu → jak se to promítne do série původního zákazníka? Lekce mu stále propadá nebo dostane kredit?

---

## SKUPINA 4 — Ukončení série

### 4.01 Zákazník chce ukončit permanentku
Standardní scénář.

**Varianty:**
- a) Okamžité ukončení (dnešní datum) → co se stane s budoucími lekce?
- b) Ukončení k definovanému datu ("poslední lekce 30.3.")
- c) Ukončení po X dalších lekcích ("ještě 3 lekce a pak konec")
- d) Ukončení po uplynutí předplaceného bloku (přirozený konec)

**Finanční vypořádání:**
- Prepaid model: zákazník má zaplaceno 10 lekcí, využil 7 → 3 lekce zpět (refund nebo kredit)
- Per-session model: zákazník neplatí dopředu → ukončení bez finančního dopadu
- Membership model: zákazník platí měsíčně → ukončení na konci billing period nebo ihned s prorátkováním

---

### 4.02 Firma ukončuje sérii (z provozních důvodů)
Zaměstnanec odchází, kapacita se ruší, provozovna zavírá.

**Varianty:**
- a) Okamžité ukončení → zákazník dostane notifikaci + refund zbývajících lekcí
- b) S výpovědní dobou (X dní) → zákazník má čas si najít alternativu
- c) Nabídka migrace na jiného zaměstnance nebo pobočku

**Hromadný dopad:**
- 30 zákazníků s permanentkou → 30 ukončení → 30 finančních vypořádání
- Systém musí batch zpracovat: ukončit série, vypočítat refundy, notifikovat

---

### 4.03 Zákazník opakovaně porušuje pravidla → série se zablokuje
Zákazník 5× nedorazil bez omluvy.

**Varianty:**
- a) Systém automaticky suspenduje sérii po X no-shows
- b) Admin ručně suspenduje
- c) Zákazník musí zaplatit dlužné poplatky před reaktivací
- d) Série se ukončí (ne jen suspenduje)

**Stavový přechod:**
```
series_status: active → suspended (no-show threshold)
suspended → active (po zaplacení / admin approval)
suspended → terminated (po X dnech bez reakce)
```

---

### 4.04 Série vyprší automaticky (konec předplaceného bloku)
Zákazník koupil 10 lekcí. Využil 10. Co teď?

**Varianty:**
- a) Systém automaticky nabídne prodloužení/nákup dalšího bloku
- b) Serie se ukončí a zákazník musí ručně obnovit
- c) Série pokračuje s automatickým strhnutím platby (subscription mode)
- d) X dní před koncem dostane zákazník upozornění

**Auto-renewal flow:**
- Zákazník schválil auto-renewal → platba se strhne → série pokračuje
- Zákazník neschválil → upozornění X dní před koncem → pokud neobnoví, série se ukončí po poslední lekci

---

### 4.05 Série vyprší datumem (seasonal)
Zákazník má permanentku "do konce sezóny" (září–červen).

**Varianty:**
- a) Série se ukončí k definovanému datu (series_end_date)
- b) Pokud zbývají nevyužité prepaid lekce → přesunou se do příští sezóny nebo refund
- c) Admin nastavuje "sezónní skupiny" a hromadně obnovuje všechny série v sezóně

---

### 4.06 Smrt nebo trvalá nezpůsobilost zákazníka
Extrémní hraniční případ.

**Varianty:**
- a) Admin manuálně ukončí sérii s důvodem "force majeure"
- b) Zbývající lekce se refundují nebo převedou na rodinného příslušníka
- c) Série se zachová v archivním stavu (pro reporting)

---

## SKUPINA 5 — Finanční scénáře série

### 5.01 Změna ceny uprostřed série
Admin zdraží masáže od 1. dubna.

**Varianty:**
- a) Zákazník s předplaceným blokem: platí původní cenu (locked-in pricing)
- b) Zákazník platí per-session: od 1. dubna platí novou cenu
- c) Zákazník dostane upozornění 30 dní předem
- d) Zákazník smí ukončit sérii bez poplatku pokud nesouhlasí se zdražením

**Systémové požadavky:**
- Serie musí mít `price_locked_until` nebo odkaz na `price_version`
- Při změně ceníku: rozlišit, které série mají locked-in cenu

---

### 5.02 Zákazník nezaplatil (po splatnosti)
Zákazník platí měsíčně, ale platba selhala.

**Varianty:**
- a) Retry platby X× (1 den, 3 dny, 7 dní) → pak suspendovat sérii
- b) Série pokračuje ale zákazník vidí upozornění na dluh
- c) Série se okamžitě zastaví → zákazník nemůže přijít na příští lekci
- d) Admin může manuálně označit jako "payment pending" a série pokračuje

**Stavový přechod:**
```
payment_status: paid → failed → retry_1 → retry_2 → overdue → suspended
```

---

### 5.03 Zákazník chce platit jinak
Zákazník přechází z per-session na prepaid block.

**Varianty:**
- a) Jednoduché přepnutí billing_type od příštího cyklu
- b) Zákazník koupí blok, série přejde na prepaid mode
- c) Zbývající "dluhy" per-session se zúčtují, pak přechod

---

### 5.04 Zákazník chce částečný refund za nevyužité lekce
Ukončuje sérii v polovině, zaplatil předem 10 lekcí, využil 6.

**Varianty:**
- a) Plný refund za 4 nevyužité lekce
- b) Refund minus "cancellation fee za sérii" (např. 1 lekce jako poplatek)
- c) Žádný refund — podmínky permanentky jsou "no refund"
- d) Kredit na účtu (ne peněžní refund) — použitelný na jiné služby
- e) Kredit převoditelný na jinou osobu

**Výpočet refundu:**
```
refund = (prepaid_sessions_total - prepaid_sessions_used) × price_per_session
       - cancellation_fee_series
       - sessions_used_for_cancelled_free (zpětná fakturace?)
```

---

### 5.05 Kreditní lekce (přidání bonusové lekce)
Admin přidá zákazníkovi lekci navíc jako omluvu nebo věrnostní odměnu.

**Varianty:**
- a) Lekce se přidá na konec série (+1 sequence_number)
- b) Lekce se přidá jako bonus kredit (použitelný kdykoli)
- c) Lekce má expirace datum (must use by)
- d) Lekce je označena jako "complimentary" v reportech

---

### 5.06 Série jako součást balíčku/členství
Zákazník má měsíční členství, v ceně je 4 lekce/měsíc.

**Varianty:**
- a) Lekce série "čerpají" z membership credits
- b) Pokud zákazník zruší membership → co se stane se sériemi v rámci členství?
- c) Zákazník využil jen 2 ze 4 lekcí tento měsíc → zbývající 2 se převádí nebo propadají?
- d) Upgrade membership → série dostane více lekcí/měsíc

---

## SKUPINA 6 — Zákaznické výjimky a speciální práva

### 6.01 VIP zákazník má jiná pravidla
VIP zákazník může zrušit kdykoli bez poplatku, neomezený počet přesunů.

**Varianty:**
- a) VIP tag → série dědí VIP pravidla automaticky
- b) Admin manuálně přepíše počítadla na "unlimited" pro konkrétní sérii
- c) VIP pravidla jsou definovány v Rules Engine jako customer_group scope

---

### 6.02 Zákazník má výjimku sjednanou ústně
Zákaznice má domluveno, že smí vždy zrušit den předem bez poplatku.

**Varianty:**
- a) Admin přepíše pravidla konkrétní série (series-level override)
- b) Výjimka je zaznamenaná jako interní poznámka (pro auditní trail)
- c) Výjimka má datum expirace
- d) Výjimka se schvaluje každý rok (renewal of exception)

---

### 6.03 Zákazník zapomněl, kolik zrušení mu zbývá
Zákazník tvrdí, že zrušil jen jednou, systém říká dvakrát.

**Varianty:**
- a) Zákazník vidí v portálu historii všech svých akcí v sérii
- b) Admin má audit trail každého zrušení (kdo, kdy, z jakého důvodu, stav počítadla)
- c) Spor: admin může manuálně obnovit jedno zrušení zpět na free

---

### 6.04 Zákazník chce "freeze" jedno konkrétní místo v sérii navždy
"Vždy chci středu 15:00, nikdy to nechci ztrácet."

**Varianty:**
- a) Series má příznak `priority_slot: true` → po uplynutí se automaticky obnovuje
- b) Admin může garantovat slot na X let dopředu (sérii generuje s dalekou series_end_date)
- c) Pokud zaměstnanec odejde → zákazník má priority na ekvivalentní slot u náhradníka

---

## SKUPINA 7 — Zaměstnanecké scénáře série

### 7.01 Zaměstnanec mění pracovní dobu
Jana pracuje nově jen do 14:00. Zákazník má sérii na 15:00.

**Varianty:**
- a) Systém automaticky detekuje konflikt → upozorní admina + zákazníka
- b) Zákazník dostane nabídku: jiný čas u Jany nebo jiný zaměstnanec ve 15:00
- c) Pokud zákazník neodpoví do X dní → série se automaticky přeřadí dle preference

---

### 7.02 Zaměstnanec odchází z firmy
Jana dává výpověď k 31. březnu.

**Varianty:**
- a) Všechny série po 31.3. jsou automaticky orphaned → admin musí přeřadit
- b) Systém automaticky oznámí zákazníkům + nabídne výběr náhradníka
- c) Zákazník smí ukončit sérii bez poplatku (přerušení ze strany firmy)
- d) Jana může "doporučit" svého nástupce zákazníkům

**Batch operation:**
- Admin vidí: "Jana má 15 aktivních sérií. Co se stane s nimi od 1.4.?"
- Hromadné přeřazení na jednoho nebo více zaměstnanců
- Individuální notifikace každému zákazníkovi

---

### 7.03 Zaměstnanec přibere dovednost
Jana se vyškolila na novou techniku. Zákazníci mohou upgradovat sérii.

**Varianty:**
- a) Systém upozorní zákazníky Jany, že je nová služba dostupná
- b) Zákazník může upgrade série (nová služba, jiná cena)
- c) Upgrade od konkrétní lekce

---

### 7.04 Zaměstnanec mění pobočku
Jana přechází do pobočky B. Zákazníci mají sérii v pobočce A.

**Varianty:**
- a) Zákazník může "následovat" Janu do pobočky B (přesun série)
- b) Zákazník zůstane v pobočce A a dostane nového zaměstnance
- c) Jana pracuje v obou pobočkách (různé dny) → zákazník si vybere

---

### 7.05 Zaměstnanec má vlastní dovolenou v sezoně
Jana bere každý rok v srpnu 3 týdny. Permanentky na srpen se musí přeřídit.

**Varianty:**
- a) Jana předem nastaví absence → systém automaticky generuje série bez srpen. termínů
- b) Zákazníci jsou upozorněni začátkem července
- c) Série mají automaticky "summer break" konfiguraci
- d) Srpen. lekce se přidají na konec série (prodloužení)

---

## SKUPINA 8 — Systémové a provozní scénáře

### 8.01 Zákazník vytvoří duplicitní sérii
Zákazník si náhodně rezervuje dvě série na stejný čas (nebo velmi blízký).

**Varianty:**
- a) Systém detekuje konflikt a odmítne druhou sérii
- b) Systém upozorní zákazníka, ale dovolí pokračovat
- c) Admin vidí zákazníky s duplicitními sériemi v reportu

---

### 8.02 Změna letního/zimního času
Hodiny se posunou. Série "středy 15:00" — je to 15:00 místního času nebo UTC?

**Systémové požadavky:**
- Série musí ukládat čas v lokálním timezone zákazníka/pobočky
- Při přechodu na letní/zimní čas: zákazník chce pokračovat ve "14:00 místního" → to je jiný UTC čas

---

### 8.03 Zákazník mění časové pásmo (přestěhování do jiné země)
Zákazník se přestěhoval do Londýna, chce online lekce na "středu 15:00 London time".

**Varianty:**
- a) Série se aktualizuje na nový timezone zákazníka
- b) Zaměstnanec pracuje v CZ → lekce musí být v průniku dostupnosti obou timezone
- c) Systém zobrazuje zákazníkovi čas v jeho timezone, zaměstnanci v jeho

---

### 8.04 Technický výpadek systému v době lekce
Zákazník přijde, systém je down. Lekce se nemůže "odšrtnout" jako completed.

**Varianty:**
- a) Offline mode: zaměstnanec si uloží lokálně, systém se synchronizuje po obnovení
- b) Lekce se označí manuálně po obnovení
- c) Lekce se nezapočítá do completed (prepaid: zákazník netlačí, podnik prohrává)

---

### 8.05 Integrita série po importu dat
Zákazník přechází z jiného systému. Historie jeho série (využité lekce, počítadla) se musí importovat.

**Požadavky:**
- Import: series_start_date, sessions_completed, free_cancels_used, reschedules_used
- Validace: počet completed + remaining musí odpovídat prepaid_total
- Při neshodě: admin musí ručně odsouhlasit

---

### 8.06 Archivace série
Série skončila (přirozeně nebo ukončením). Co se stane s daty?

**Varianty:**
- a) Série se archivuje (read-only, dostupná v historii zákazníka)
- b) Zákazník vidí archivované série v portálu (kolik lekcí absolvoval za rok)
- c) Admin vidí archivované série v reportech (retention, LTV)
- d) Po X letech se série smaže (GDPR retention policy)

---

## SKUPINA 9 — Notifikační scénáře série

### 9.01 Kdy systém pošle notifikaci automaticky

| Událost | Zákazník | Zaměstnanec | Admin |
|---------|----------|-------------|-------|
| Série vytvořena | Potvrzení + rozvrh | Nová permanentka | Info |
| Lekce zrušena (zákazník) | Potvrzení storna | Upozornění | Dashboard |
| Lekce zrušena (zaměstnanec) | Upozornění + náhrada | — | Info |
| Lekce přesunuta | Nový termín | Nový termín | Dashboard |
| Série pauzována | Potvrzení pauzy + datum návratu | Info | Dashboard |
| Série obnovena | Potvrzení + příští termín | Info | Dashboard |
| Série ukončena | Potvrzení + billing | Info | Report |
| Blížící se konec bloku | X dní před: "Zbývají 2 lekce" | — | Dashboard |
| No-show | Šablona dle nastavení | — | Report |
| Blok lekce od zaměstnance | Upozornění + náhrada | — | Dashboard |
| Změna ceny | 30 dní předem | — | — |
| Změna zaměstnance | Nový zaměstnanec + souhlas | Nová klientka | Admin |
| Zbývá poslední lekce | Obnova/ukončení? | — | Dashboard |

---

### 9.02 Notifikace s akcí (actionable)
Některé notifikace by měly obsahovat tlačítka pro přímou akci bez přihlášení:

- "Série Jany expiruje za 5 lekcí. [Obnovit nyní] [Ukončit sérii]"
- "Váš slot ve středu byl uvolněn. Chcete ho darovat nebo přesunout? [Darovat] [Přesunout na konec]"
- "Jana je nemocná. Chcete náhradníka nebo přesun na konec série? [Petra 15:00] [Přesunout]"

---

## SKUPINA 10 — Reportingové scénáře série

### 10.01 Co admin musí vidět v reportech

- Aktivní série: počet, celková hodnota předplacených lekcí (liability)
- Série blízko expirace (< 3 lekce zbývají)
- Série s dluhem (platba selhala)
- Série s vysokým počtem zrušení/přesunů (rizikový zákazník)
- Zákazníci bez aktivní série (churned) za posledních 90 dní
- Průměrná délka série (kolik lekcí průměrně zákazník absolvuje)
- Retention rate sérií: % zákazníků, kteří sérii obnovili
- Revenue z sérií vs. jednorázové rezervace
- Nejvytíženější časové sloty série (pro capacity planning)
- Sloty, kde série > X měsíců (super loajální zákazníci)

---

## SKUPINA 11 — Edge cases hodné zvláštní pozornosti

### 11.01 Série napříč rokem — zákazník chce "totéž příští rok"
Série vypršela 30.6. Zákazník chce "znovu od září, stejný čas, stejný zaměstnanec."

**Řešení:**
- Quick renewal: admin klikne "Obnovit sérii" → vytvoří kopii série od nového data
- Zákazník dostane předplnění formuláře ze staré série
- Systém ověří, zda je slot u zaměstnance volný

---

### 11.02 Zákazník chce přidat druhou sérii (dvakrát týdně)
Zákazník má středu 15:00, chce přidat pátek 10:00.

**Systémové požadavky:**
- Zákazník smí mít více aktivních sérií najednou
- Počítadla (free_cancels, reschedules) jsou per-série, ne per-zákazník
- Billing: každá série má vlastní cenový plán

---

### 11.03 "Sdílená" série (firma platí, zaměstnanec chodí)
Firma platí za lekce angličtiny zaměstnancům. Každý týden chodí jiný zaměstnanec.

**Varianty:**
- a) Firma je "owner" série, seznam účastníků se mění každý týden
- b) Firma přiřadí konkrétní termíny konkrétním lidem dopředu
- c) Firma vydá kredity zaměstnancům → každý si sám rezervuje
- d) Série je anonymní (walk-in pro libovolného zaměstnance firmy)

---

### 11.04 Série koliduje se svátkem jiné země
Zákazník je z Německa, výuka probíhá online, český svátek způsobí výpadek.

**Řešení:**
- Série musí respektovat timezone a holiday calendar pobočky (poskytovatele), ne zákazníka
- Zákazník je upozorněn: "Lekce [datum] je zrušena z důvodu svátku v ČR"
- Konfigurace: která holiday calendar se použije (branch nebo tenant)

---

### 11.05 Zákazník chce historii své permanentky ke stažení
"Kolik jsem tu byl za 3 roky? Kolikrát jsem přišel, kolikrát zrušil?"

**Výstup:**
- Export PDF: Zákaznická karta série se sumářem
- Export CSV: každá lekce s datem, statusem, zaměstnancem, cenou
- Použití: pro vlastní účetnictví, zdravotní záznamy, nebo jen nostalgie

---

### 11.06 Série s různými zaměstnanci pro různé týdny
Zákazník chce střetat se střídavě s Janou a Petrou (každý sudý/lichý týden).

**Systémové požadavky:**
- Série má `employee_schedule: [{week: "odd", employee_id: Jana}, {week: "even", employee_id: Petra}]`
- Každá pracuje jinak → dostupnost se musí ověřovat separátně
- Storno/přesun od zákazníka: který zaměstnanec je "aktivní" pro danou lekci?

---

### 11.07 Zákazník chce sérii, ale s podmínkou ("jen pokud Jana")
"Budu chodit, ale jen pokud mi bude k dispozici Jana. Jinak ne."

**Systémové požadavky:**
- Serie má `employee_required: strict` → pokud Jana není dostupná, slot se přeskočí (ne přeřadí)
- Zákazník dostane notifikaci: "Vaše lekce [datum] byla přeskočena — Jana není k dispozici"
- Lekce se ze série odpočítá nebo ne? (závisí na billing_type)

---

## Souhrn: Co systém MUSÍ umět

### Stavový model RecurringBooking.status (kompletní)
```
scheduled           → naplánováno, čeká
completed           → proběhlo, zaplaceno
cancelled_free      → zrušeno zákazníkem, bez poplatku (v limitu)
cancelled_paid      → zrušeno zákazníkem, s poplatkem
cancelled_business  → zrušeno poskytovatelem (nesmí jít z počítadla)
cancelled_force_maj → zrušeno z důvodu vyšší moci (výjimka z poplatku)
rescheduled_out     → přesunuto pryč z tohoto slotu
rescheduled_in      → náhradní lekce přijatá do série
paused_customer     → přeskočeno zákazníkem (pauza)
paused_business     → přeskočeno provozovnou
skipped_holiday     → přeskočeno kvůli svátku
gifted              → slot darován jinému zákazníkovi
substituted         → zákazník přijal náhradníka (darování opačně)
no_show             → zákazník nedorazil
pending_makeup      → čeká na náhradní lekci (po business cancel)
expired             → propadlo (nevyužitý prepaid slot po expiraci)
```

### Initiator enum (kdo spustil akci)
```
CUSTOMER_SELF        → zákazník sám přes portál
CUSTOMER_REQUEST     → zákazník požádal, admin schválil
ADMIN_MANUAL         → admin ručně bez žádosti zákazníka
EMPLOYEE_MANUAL      → zaměstnanec ručně
SYSTEM_AUTO          → automatická akce systému (threshold, expiry)
SYSTEM_RULE          → Rules Engine automaticky
THIRD_PARTY          → přes API / integraci
```

### Reason enum pro cancellation / reschedule
```
CUSTOMER_NO_SHOW
CUSTOMER_ILLNESS
CUSTOMER_PERSONAL
CUSTOMER_TRAVEL
CUSTOMER_NO_REASON
EMPLOYEE_ILLNESS
EMPLOYEE_VACATION
EMPLOYEE_LEFT_COMPANY
BUSINESS_HOLIDAY
BUSINESS_CLOSED
BUSINESS_OPERATIONAL
TECHNICAL_ISSUE
FORCE_MAJEURE
WEATHER
ADMIN_ERROR_CORRECTION
```
