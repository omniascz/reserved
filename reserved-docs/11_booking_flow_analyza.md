# 11 — Booking Flow: Hloubková analýza konkurenčních systémů

> Analýza flow ze čtyř systémů: Fresha, SimplyBook.me, Acuity Scheduling, Calendly  
> Pokrývá: životní cyklus rezervace, všechny stavy, všechny aktéry, všechny směry operací

---

## Část A — Životní cyklus rezervace (State Machine)

### Stavy rezervace — co systémy skutečně implementují

#### Fresha (nejpropracovanější model)

Fresha má dvě vrstvy stavů: systémové (nezměnitelné) a vlastní (admin si tvoří sám).

**Systémové stavy:**
```
BOOKED     → výchozí stav při vytvoření (admin i online)
CONFIRMED  → klient potvrdil / přijal platební podmínky
COMPLETED  → checkout přes POS byl proveden (vždy má navázanou transakci)
CANCELLED  → zrušeno (podmíněné — jen pokud je start_time v budoucnosti)
NO_SHOW    → označeno po uplynutí start_time (jen pokud čas již minul)
```

**Vlastní stavy (Custom Statuses):**
Admin si vytváří libovolné interní stavy: "Arrived", "Started", "In Progress", "Waiting for payment"…
- Jsou pouze interní — klient je nevidí
- Lze měnit pořadí, přejmenovávat, mazat (ale ne systémové)
- Při smazání obsazeného stavu systém vyžaduje přeřazení

**Přechody stavů (Fresha):**
```
[vytvoření online bez platební policy]
  → BOOKED

[vytvoření online s platební policy + klient potvrdí/zaplatí]
  → CONFIRMED

[admin ručně potvrdí]
  BOOKED → CONFIRMED

[admin provede checkout v POS]
  BOOKED / CONFIRMED → COMPLETED
  (nelze, pokud čas ještě nenastal — status zůstane BOOKED, až pak přejde)

[admin nebo klient zruší]
  BOOKED / CONFIRMED → CANCELLED

[čas rezervace uplynul, klient nedorazil]
  BOOKED / CONFIRMED → NO_SHOW (jen admin, po start_time)
```

**Klíčové omezení Fresha:**
- COMPLETED → žádná další změna. Checkout je finální.
- CANCELLED → nelze přesunout (lze jen "Schedule invitee again")
- NO_SHOW → lze aplikovat poplatek nebo ponechat zálohu

---

#### SimplyBook.me

SimplyBook.me pracuje s jednoduššími stavy + custom statusy jako add-on plugin:

**Základní stavy:**
```
PENDING    → čeká na potvrzení (pokud je zapnuto ruční schvalování)
CONFIRMED  → aktivní rezervace
CANCELLED  → zrušeno
COMPLETED  → dokončeno (manuálně nebo automaticky po uplynutí termínu)
```

**Booking Status Plugin (prémiový):**
Admin si definuje vlastní stavy s barvami (např. "Client arrived" = zelená, "In progress" = oranžová). Barevné kódování je viditelné přímo v admin kalendáři.

**Provider Color Coding Plugin:**
Alternativní barvení dle poskytovatele (zaměstnance), ne dle statusu.

---

#### Acuity Scheduling

Acuity má nejjednodušší stavový model:

```
SCHEDULED   → aktivní rezervace
CANCELLED   → zrušeno
NO_SHOW     → označeno adminem (manuální)
```

Acuity nemá nativní "Completed" stav — dokončení se implicitně předpokládá uplynutím termínu. Checkout/POS není součástí systému.

---

#### Calendly

Calendly je event-centric, ne service-business-centric:

```
UPCOMING    → naplánovaná schůzka
PAST        → proběhlá (automaticky po uplynutí)
CANCELLED   → zrušeno
NO_SHOW     → označeno hostem po uplynutí termínu
```

Zvláštnost Calendly: **cancelled nelze reschedule** — musí se vytvořit nová rezervace. Toto je fundamentální omezení plynoucí z event-first designu.

---

## Část B — Flow ze strany zákazníka (Client-side flows)

### B1. Základní booking flow (nový zákazník)

**Fresha:**
```
1. Browse profil nebo marketplace
2. Vybere službu
3. Vybere zaměstnance (nebo "anyone")
4. Vybere datum a čas ze dostupnosti
5. Přihlásí se nebo registruje (POVINNÉ — anonymní booking nelze)
6. Přijme platební podmínky (deposit / card-on-file / žádné)
7. Potvrdí → status BOOKED nebo CONFIRMED
8. Dostane e-mail + SMS potvrzení
```

**SimplyBook.me:**
```
1. Přistoupí na booking page (subdoména nebo embed)
2. Vybere kategorii → službu
3. Vybere poskytovatele (nebo "any")
4. Vybere datum → čas
5. Vyplní formulář (jméno, e-mail, telefon + custom fields)
6. Volitelně: kód kupónu, gift card
7. Volitelně: platba (pokud je Accept Payments plugin aktivní)
8. Potvrdí → e-mail potvrzení
9. Registrace není povinná (lze jako guest)
```

**Acuity:**
```
1. Přistoupí na scheduling page
2. Vybere appointment type
3. Vybere kalendář (zaměstnance/lokaci) — pokud více
4. Vybere datum → čas
5. Vyplní intake form (jméno, e-mail, telefon + custom fields)
6. Zadá platbu (pokud je vyžadována)
7. Potvrdí → confirmation page + e-mail
8. Volitelně: přidá do Apple/Google Kalendáře (ics link)
```

**Calendly:**
```
1. Dostane odkaz nebo navštíví scheduling page
2. Vybere event type (pokud více)
3. Vybere datum → čas ze zobrazené dostupnosti
4. Vyplní jméno, e-mail + custom questions
5. Potvrdí → confirmation page
6. Dostane e-mail s calendar invite (Google/iCal/Outlook)
7. E-mail obsahuje cancel + reschedule link (konfigurovatelné)
```

---

### B2. Reschedule flow — zákazník mění termín

**Fresha:**
```
Vstupní bod: odkaz v potvrzovacím e-mailu NEBO klientský účet

Podmínky pro self-reschedule:
  - Musí být v rámci povoleného okna (nastavuje admin)
  - Služba musí být stále dostupná pro online booking
  - Pokud má zálohu → záloha se přesune na nový termín (nevrací se)

Flow:
1. Klient klikne "Reschedule" v e-mailu nebo portálu
2. Zobrazí se kalendář dostupnosti (stejná služba, stejný nebo jiný tým)
3. Vybere nový slot
4. Potvrdí → notifikace adminovi + klientovi
5. Platební policy zůstává navázána na nový termín

Omezení:
  - Group appointments: klient NEMŮŽE reschedule online → musí kontaktovat admina
  - Pokud původní služba odstraněna z online booking → klient nemůže, musí admin
```

**SimplyBook.me:**
```
Vstupní bod: odkaz v potvrzovacím e-mailu → "Change/Cancel booking"

Flow:
1. Klient klikne cancel link v e-mailu
2. Zobrazí se detaily rezervace
3. Možnost "Reschedule" (pokud admin povolil)
4. Vybere nový čas ze dostupnosti
5. Potvrdí → e-mail s novými detaily
6. Admin dostane notifikaci

Konfigurace admina:
  - Allow clients to cancel: yes/no
  - Cancellation policy: X hodin před termínem
  - Jde o globální nastavení — nelze per-service nebo per-employee (!)
```

**Acuity:**
```
Vstupní bod: odkaz "Change/Cancel appointment" v confirmation e-mailu

Flow:
1. Klient klikne → dostane se na confirmation page
2. Klikne "Reschedule"
3. Vidí dostupnost pro STEJNÝ appointment type a STEJNÝ kalendář
4. Nemůže změnit typ ani kalendář — to smí jen admin
5. Vybere nový čas → potvrdí
6. Dostane updated confirmation e-mail

Omezení Acuity:
  - Zákazník může reschedule jen stejný typ u stejného zaměstnance
  - Nelze změnit zaměstnance nebo typ přes self-service → jen admin
  - Bulk reschedule: jen admin (per-client nebo per-group class)
```

**Calendly:**
```
Vstupní bod: cancel/reschedule link v confirmation e-mailu

Flow:
1. Klient klikne reschedule link
2. Dostane se na booking page s aktuální dostupností hostitele
3. Vybere nový čas
4. Potvrdí → oba dostanou updated calendar invite

Klíčové omezení:
  - Cancel a reschedule jsou "all or nothing" — buď obě možnosti jsou v e-mailu, nebo ani jedna
  - Nelze zakázat reschedule a ponechat cancel (nebo naopak)
  - Po zrušení termínu nelze reschedule — musí se vytvořit zcela nová rezervace
  - Invitee nemůže změnit hostitele (Round Robin: host se změní, ale jen admin určí koho)
```

---

### B3. Cancel flow — zákazník ruší

**Fresha — nejkomplexnější:**
```
Scénář 1: Bez platební policy (free cancel)
  → Klient klikne cancel v e-mailu nebo portálu
  → Rezervace přejde do CANCELLED
  → Admin + klient dostanou notifikaci

Scénář 2: S card-on-file, mimo cancellation window
  → Klient může zrušit online
  → Systém mu ukáže výši poplatku
  → Musí potvrdit → poplatek se strhne z karty
  → Rezervace CANCELLED

Scénář 3: S card-on-file, uvnitř cancellation window (pozdní storno)
  → Klient NEMŮŽE zrušit online
  → Musí kontaktovat admina
  → Admin může uplatnit late cancellation fee manuálně

Scénář 4: S upfront payment (záloha zaplacena předem)
  → Klient NEMŮŽE zrušit online
  → Musí kontaktovat admina
  → Admin rozhodne: refund (plný/částečný) nebo ponechání zálohy

Repeat appointments:
  → Cancel jen tuto jednu NEBO celou sérii
```

**SimplyBook.me:**
```
1. Klient klikne cancel link v potvrzovacím e-mailu
2. Zobrazí se confirmation dialog
3. Potvrdí → rezervace zrušena

Pokud je Cancellation Policy Plugin aktivní:
  → Systém ověří, zda je v povoleném okně
  → Pokud mimo okno → klientovi se zobrazí zpráva dle nastavení

Konfigurace (globální, nelze per-service):
  - Povolit klientům rušení: ano/ne
  - Min. X hodin před termínem
```

**Acuity:**
```
1. Klient klikne "Change/Cancel" v potvrzovacím e-mailu
2. Přejde na confirmation page
3. Klikne "Cancel appointment"
4. Systém ověří cancellation policy (pokud aktivní)
5. Klient musí potvrdit přijetí cancellation policy při bookingu (checkbox)
   → Pokud policy porušena, klient může i tak zrušit (Acuity nevybírá poplatky automaticky)
   → Admin musí poplatek řešit ručně (Stripe refund/charge)

Poznámka: Acuity nemá automatické strhávání cancel fee — jen policy zobrazení.
```

**Calendly:**
```
1. Klient klikne cancel link v e-mailu
2. Může přidat důvod (konfigurovatelné)
3. Potvrdí → schůzka zrušena pro obě strany
4. Hostitel dostane notifikaci

Zvláštnosti:
  - Žádná cancel policy ani poplatek — Calendly platby neřeší nativně
  - Jakmile je cancelled → status je finální, není reschedule
  - Host může "Schedule invitee again" → pošle nový booking link
```

---

### B4. No-show flow

**Fresha:**
```
Podmínka: start_time musí být v minulosti

1. Admin otevře rezervaci
2. Klikne "Set as no-show"
3. Systém nabídne:
   a. U card-on-file: uplatnit no-show fee?
   b. U upfront payment: refund nebo ponechat?
4. Status přejde na NO_SHOW
5. Zaznamená se do profilu klienta (viditelná historie)
6. Klient dostane "Did not show up" automatickou zprávu (pokud zapnuto)
7. No-show se počítá v reporting — Appointments cancellations & no-show summary report
```

**SimplyBook.me:**
```
Admin označí rezervaci jako no-show ručně v dashboardu nebo reportu.
Zaznamená se do profilu zákazníka.
Žádné automatické akce — poplatky musí admin řešit sám.
```

**Acuity:**
```
Admin může označit "This was a no-show appointment" při cancelaci z mobile nebo web.
Zaznamená se v reportech.
Žádné automatické poplatky.
```

**Calendly:**
```
Host označí invitee jako no-show z Meetings page.
Účel: zastavit follow-up Workflows nebo spustit no-show Workflow (automatická zpráva).
Žádné platební akce.
```

---

## Část C — Flow ze strany admina / vlastníka

### C1. Vytvoření rezervace adminem

**Fresha:**
```
1. Admin klikne na slot v kalendáři nebo "Add" button
2. Vybere: nový klient / existující klient / walk-in
3. Vybere: zaměstnance + službu(y) (lze přidat více služeb najednou)
4. Vybere čas (nebo drag-and-drop)
5. Volitelně: interní poznámka, custom fields
6. Uloží → status BOOKED
7. Volitelně: checkout ihned (platba předem)

Walk-in flow:
  → Lze vytvořit rezervaci bez klienta (jen jméno a číslo telefonu)
  → Nevyžaduje registraci zákazníka

Group appointment (admin vytváří):
  → Neomezený počet lidí (na rozdíl od online: max 6)
  → Admin přidává zákazníky jednotlivě přes "Add to group"
```

**SimplyBook.me:**
```
1. Admin klikne na slot v kalendáři
2. Pop-up formulář: vybere/přidá klienta, poskytovatele, službu, čas
3. Volitelně: Invoice generování ("Receive payment" checkbox — jen při vytvoření, ne editu)
4. Uloží → e-mail potvrzení zákazníkovi (konfigurovatelné)

Důležité: Invoice se nedá přidat dodatečně — jen při vytvoření rezervace.
Pokud zapomeneš → musíš zrušit a vytvořit znovu.
```

**Acuity:**
```
1. Admin klikne "+ Add new" → "Appointment"
2. Vybere appointment type
3. Vybere kalendář (pokud více)
4. Vybere datum a čas (lze "Custom" mimo dostupnost)
5. Systém upozorní na čas mimo dostupnost — ale nezabrání v uložení
6. Volitelně: recurring (opakující se)
7. Vyplní client info → Send confirmation email: yes/no
8. Volitelně: intake form, coupon/package code, notes
9. Uloží
```

**Calendly:**
```
Calendly je navržen pro PULL model (host čeká na booking od invitee).
Admin nemůže přímo vytvořit rezervaci za invitee z admin rozhraní.
Alternativa: "Add one-off meeting" nebo pošle booking link konkrétní osobě.
Omezení: neumožňuje klasický "walk-in" nebo admin-initiated booking.
```

---

### C2. Přesun rezervace adminem

**Fresha — nejflexibilnější:**
```
Metoda 1: Drag & Drop
  → Admin uchopí rezervaci v kalendáři
  → Přetáhne na nový slot (jiný čas NEBO jiný zaměstnanec)
  → Confirmation dialog: zobrazí konflikty + volbu notifikace klientovi
  → Klikne "Update" nebo "Reschedule"

Metoda 2: Přes Actions menu
  → Admin otevře rezervaci → Actions → Reschedule
  → Zobrazí se kalendář dostupnosti
  → Vybere nový slot → potvrdí

Metoda 3: Rozšíření/zkrácení
  → V Day view: tažení za spodní hranu rezervace = změna délky

Platební policy po přesunu:
  → Platební policy zůstává navázána na přesunutou rezervaci
  → Zákazník NEPLATÍ znovu

Konflikty:
  → Systém upozorní na konflikt, ale umožní přesunout i tak (admin override)
```

**SimplyBook.me:**
```
Metoda 1: Drag & Drop v kalendáři
  → Přetažení na jiný čas nebo jiného poskytovatele
  → Potvrzovací dialog

Metoda 2: Hromadný přesun
  → Reports → Booking details → zaškrtnutí více rezervací → Cancel selected
  → (Hromadný reschedule bez zrušení není nativně k dispozici — jen cancel + recreate)

Omezení:
  → Hromadný cancel jen z jedné stránky reportu najednou
```

**Acuity:**
```
Metoda 1: Drag & Drop v kalendáři
  → Přetažení na nový čas
  → Volba: poslat/neposlat notifikaci zákazníkovi

Metoda 2: Přes detail rezervace
  → Click na rezervaci → Reschedule → nový datum a čas

Metoda 3: Hromadný reschedule
  → Clients → vybrat klienta → zaškrtnout rezervace → Reschedule selected
  → Dvě možnosti:
    a) Stejný den a čas (jiný den v týdnu) — pokud jsou všechny ve stejný čas
    b) Přidat/odebrat čas (add/subtract days/minutes) — pro různé časy

Group class bulk reschedule:
  → Appointment Types → třída → vybrat účastníky → Reschedule Selected
  → Výběr nové session
```

**Calendly:**
```
Metoda 1: Z Meetings page → vybrat meeting → Reschedule
  → Free plán: admin jde přímo na booking page, vybere nový čas
  → Paid plán: dvě možnosti:
    a) "Share new times to meet" — pošle invitee e-mail s výzvou vybrat nový čas
       (lze nastavit reminder po 1/3/7 dnech pokud invitee nepodnikne akci)
    b) "Reschedule meeting now" — admin vybere čas za invitee

Round Robin events:
  → Při reschedule: ponechat původního hostitele nebo vybrat jiného

Group events:
  → Lze přesunout jednoho invitee najednou (ne hromadně)

Omezení:
  → Cancelled meetings nelze reschedule — jen "Schedule invitee again"
  → One-off meetings a Meeting Polls nelze editovat po vytvoření
```

---

### C3. Storno rezervace adminem

**Fresha:**
```
1. Admin otevře rezervaci
2. Klikne na status nebo Actions → Cancel
3. Vybere: Cancellation reason (konfigurovatelný seznam)
4. Spravuje platbu:
   - Refund (plný / částečný) nebo ponechání
   - Aplikování late cancellation fee (pokud platební policy)
5. Volba: poslat notifikaci zákazníkovi (yes/no)
6. Potvrdí → status CANCELLED

Repeat appointments:
  → Cancel jen tuto NEBO celou budoucí sérii

Zákazník s předplacenou zálohou:
  → Admin musí rozhodnout o vrácení peněz manuálně
  → Systém nenabídne automatický refund — jen připomene existenci platby
```

**SimplyBook.me:**
```
1. Admin klikne na rezervaci → Cancel booking
2. Pokud klient má e-mail → systém nabídne odeslání zprávy zákazníkovi
3. Potvrdí
4. Hromadné storno: Reports → Booking details → zaškrtnutí → Cancel selected

Platby:
  → Refundy musí admin řešit ručně ve Stripe dashboardu
  → SimplyBook neautomatizuje refundy
```

**Acuity:**
```
1. Admin klikne na rezervaci → Cancel appointment
2. Volba: mark as no-show (checkbox)
3. Volba: send cancellation email (yes/no + volitelná note zákazníkovi)
4. Potvrdí

Hromadné storno:
  → Není nativní hromadné storno přes kalendář
  → Přes Clients: vybrat klienta → zrušit více rezervací (ale jen per-klient)

Platby:
  → Acuity umí zobrazit "apply refund" → přesměruje do Stripe dashboardu
  → Není plně automatizovaný refund flow
```

**Calendly:**
```
1. Host jde na Meetings page → vybere meeting → Cancel
2. Invitee dostane notifikaci
3. Meeting se odstraní z kalendáře hostitele i invitee

Group events:
  → Cancel zruší celý event pro všechny invitees
  → Remove invitee: odstraní jen jednoho (meeting zůstane ostatním)

Platby: Calendly žádné platební akce neprovádí — Stripe/PayPal integrace je pouze pro deposit, refund je mimo systém
```

---

### C4. Blokování termínů (Block time)

**Fresha:**
```
Admin vytvoří blocked time s:
  - Titulem (pojmenování: Lunch, Training, Vacation…)
  - Délkou a kompenzačním nastavením (platí zaměstnanci za čas?)
  - Typem: interní (neviditelný zákazníkovi)

Blocked time types:
  → Admin si vytváří vlastní typy s názvem, barvou a kompenzací
  → Move up/Move down: pořadí v seznamu
  → Smazání: pokud se používá, musí se přeřadit
```

**SimplyBook.me:**
```
Admin blokuje čas přímo v kalendáři:
  - Kliknutím na slot → "Add break time"
  - Volitelně: Calendar notes (viditelná poznámka u blokování)
  - Typy: přestávka, dovolená, jiné

Break times jsou viditelné v admin kalendáři ale ne zákazníkovi.
```

**Acuity:**
```
Admin přidá "Block time":
  - Název (interní poznámka)
  - Čas a datum
  - Opakování (volitelně)
  - Nevyžaduje popis pro zákazníka
```

**Calendly:**
```
Calendly nekontroluje dostupnost přes vlastní blocked-time feature.
Místo toho: propojení s Google/Outlook Kalendářem — "busy" časy v externím kalendáři blokují Calendly dostupnost automaticky.
Vlastní block time v Calendly neexistuje — závisí zcela na externím kalendáři.
```

---

## Část D — Srovnání klíčových flow-decisions

### D1. Musí zákazník být registrován pro booking?

| Systém | Registrace povinná | Anonymní booking | Guest token |
|--------|--------------------|------------------|-------------|
| Fresha | **ANO** | Ne | Ne |
| SimplyBook.me | Ne | ANO | Přes e-mail link |
| Acuity | Ne | ANO | Přes e-mail link |
| Calendly | Ne | ANO | Přes e-mail link |

Fresha je jediný, kdo vyžaduje registraci klientského účtu pro online booking. Výhoda: propojená historie, rebooking, review. Nevýhoda: tření při první rezervaci.

---

### D2. Granularita cancellation policy

| Systém | Globální | Per-service | Per-employee | Per-customer group |
|--------|----------|------------|--------------|-------------------|
| Fresha | ✓ | ✓ | Nepřímé | Ne |
| SimplyBook.me | ✓ | **NE** | **NE** | Ne |
| Acuity | ✓ | Per appointment type | Ne | Ne |
| Calendly | ✓ | Per event type | Ne | Ne |

**Kritická mezera SimplyBook.me:** Booking rules jsou striktně globální. Nelze nastavit jiné pravidlo pro storno masáže a pro skupinovou lekci.

---

### D3. Jak systémy řeší platbu při reschedule?

| Systém | Záloha při reschedule | Automatický refund | Card charge při late cancel |
|--------|----------------------|-------------------|----------------------------|
| Fresha | Přesune se na nový termín | NE (admin ručně) | ANO (automaticky) |
| SimplyBook.me | Záloha se vrátí (default) | Závisí na Stripe | NE (admin ručně) |
| Acuity | Záloha zůstává (default) | NE (admin ručně) | NE (admin ručně) |
| Calendly | N/A — Calendly neřeší | N/A | NE |

---

### D4. Hromadné operace — co který systém umí

| Operace | Fresha | SimplyBook | Acuity | Calendly |
|---------|--------|-----------|--------|----------|
| Hromadný cancel | Per-employee přes filtr | Přes Report (1 stránka) | Per-klient | Jen group event |
| Hromadný reschedule | Ne | Ne | Per-klient nebo per-group | Jeden invitee najednou |
| Přeřazení na jiného | Drag & drop per-one | Ne | Ne | Ne |
| Cancel celé série | ANO | Omezené | Ne | Ne |

---

### D5. No-show monetizace

| Systém | Automatický no-show fee | Záloha propadá | Card charge | Report |
|--------|------------------------|----------------|-------------|--------|
| Fresha | ANO (s card-on-file) | ANO | ANO | ANO (summary report) |
| SimplyBook.me | Ne | Manuálně | Ne | Základní |
| Acuity | Ne | Manuálně | Ne | Základní |
| Calendly | Ne | Ne | Ne | Ne |

---

## Část E — Chybějící flow, které žádný systém neřeší dobře

### E1. Request-based flow (žádost místo přímé akce)

Žádný ze systémů nemá plnohodnotný "Request & Approve" flow pro zákazníka:
- Zákazník chce zrušit mimo povolené okno → musí telefonovat nebo psát e-mail
- Žádný systém neumožní: zákazník odešle žádost → admin ji schválí nebo zamítne s důvodem → zákazník dostane odpověď → v případě schválení se akce provede automaticky

Toto je klíčová díra — support komunikace by mohla být plně nahrazena strukturovaným flow.

---

### E2. Cascade reschedule (přeřazení týmu)

Scénář: Zaměstnanec onemocní. Má 8 rezervací. Admin potřebuje vše přeřadit.

- **Fresha:** Drag & drop per-rezervace. Žádný bulk reassign.
- **SimplyBook.me:** Žádný bulk reassign.
- **Acuity:** Per-klient bulk reschedule (jiný čas, ne jiný poskytovatel).
- **Calendly:** Nelze.

Nikdo nenabízí: "Vyber zaměstnance → vyber rozsah dní → přeřaď vše na jiného (nebo rozhoď automaticky dle dostupnosti)."

---

### E3. Conditional visibility flow

Žádný systém nemá: "Tento slot se zobrazí zákazníkovi jen pokud má aktivní balíček / absolvoval intro lekci / je ve VIP skupině."

Nejblíže je Fresha s payment policy (slot vyžaduje card-on-file), ale ne podmíněná viditelnost na základě zákaznické historie nebo skupiny.

---

### E4. Partial reschedule (přesun jen části rezervace)

Zákazník má bundle (střih + barvení, 3 hodiny). Chce přesunout jen barvení na jiný den.

Žádný systém to neumí. Rezervace je atomic — celá nebo nic.

---

### E5. Proactive slot offer (systém sám nabídne)

Po no-show nebo storno systém mohl automaticky kontaktovat dalšího zákazníka z waiting listu. Fresha to dělá pro waiting list, ale:
- Žádný systém neposílá "uvolnil se termín, chcete ho?" zákazníkům, kteří mají historii rezervací podobné služby.
- Žádný systém proaktivně nenavrhuje zákazníkovi přesun kvůli lepšímu vytížení (yield optimization).

---

### E6. Two-way confirmation flow

Fresha a SimplyBook.me mají jednostranné potvrzení (admin potvrdí, zákazník dostane zprávu). Žádný systém nemá:
- Admin navrhne tři alternativní termíny → zákazník si jeden vybere → automaticky se rezervuje
- (Ekvivalent Calendly pro service business — ale Calendly to řeší jen pro B2B schůzky, ne pro salóny)

---

## Část F — Doporučená flow architektura pro náš systém

### Stavový model (rozšíření nad konkurenci)

```
DRAFT          → rezervace uložena, čeká na akci (guest checkout)
PENDING        → čeká na schválení admina (pokud je manual approval zapnuto)
CONFIRMED      → aktivní, potvrzená rezervace
ARRIVED        → zákazník dorazil (custom status, interní)
IN_PROGRESS    → probíhá (custom status, interní)
COMPLETED      → checkout proveden, platba uzavřena
CANCELLED      → zrušeno (s podtypem: admin / client / no_response)
NO_SHOW        → zákazník nedorazil (jen po start_time)
PENDING_RESCHEDULE → zákazník odeslal žádost o přesun (REQUEST flow)
PENDING_CANCEL → zákazník odeslal žádost o storno (REQUEST flow)
```

### Dva typy client actions: DIRECT a REQUEST

```
DIRECT (okamžitá akce):
  Podmínka: zákazník je v povoleném okně + akce splňuje pravidla
  → Zákazník klikne → akce se provede → notifikace adminovi

REQUEST (žádost ke schválení):
  Podmínka: zákazník je mimo povolené okno NEBO překračuje limit
  → Zákazník klikne "Požádat o [přesun/storno]"
  → Vyplní důvod + preferovaný nový termín (u přesunu)
  → Admin dostane notifikaci + vidí žádost ve frontech
  → Schválí (akce se provede automaticky) nebo Zamítne (s důvodem zákazníkovi)
  → Zákazník dostane odpověď + automatická akce pokud schváleno
```

### Cascade reassign flow (nový)

```
Trigger: admin označí zaměstnance jako "nepřítomný" pro rozsah dní

1. Systém zobrazí seznam zasažených rezervací
2. Admin vybere strategii:
   a) Přiřadit konkrétnímu kolegovi (s ověřením dostupnosti)
   b) Automaticky rozhodit dle dostupnosti a vytížení
   c) Zákazníkům nabídnout self-reschedule (e-mail se speciálním linkem)
3. Systém ověří dostupnost
4. Zákazníci dostanou notifikaci s novým zaměstnancem nebo výzvou vybrat termín
5. Audit log: kdo spustil, kdy, kolik rezervací přeřazeno
```

### Slot offer flow (nový — proactive)

```
Trigger: rezervace přejde do CANCELLED nebo NO_SHOW

1. Systém zkontroluje waiting list pro daný slot
2. Pokud waiting list → nabídne slot prvnímu v pořadí (X minut timeout)
3. Pokud no waiting list → systém zkontroluje:
   a) Zákazníci s historií stejné služby, kteří dlouho nebookovali
   b) Zákazníci s expirujícím balíčkem vhodným pro tuto službu
4. Pošle proactive offer e-mail/SMS: "Uvolnil se termín na [datum], máš zájem?"
5. First-come-first-served: kdo klikne první, rezervuje
```
