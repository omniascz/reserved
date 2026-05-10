# 06 — Správa slotů & pravidla rezervací

## Přehled

Slot je konkrétní časový úsek, ve kterém lze provést rezervaci. Správa slotů zahrnuje tři roviny:

1. **Generování dostupnosti** — kdy fyzicky může k rezervaci dojít
2. **Zobrazení zákazníkovi** — které sloty se mu nabídnou a v jakém pořadí
3. **Operace nad slotem** — přesun, storno, blokování, přeřazení

---

## Generování dostupnosti

### Algoritmus výpočtu volných slotů

Vstup:
- Pracovní doba zaměstnance (nebo pobočky)
- Délka služby + buffer čas po/před
- Existující rezervace
- Blokované časy
- Pravidla zobrazení (interval, zaokrouhlení)

```
volné_sloty = pracovní_doba
             - existující_rezervace (+ buffer)
             - blokované_časy
             - dovolené
             - firemní svátky

výsledek = zaokrouhli_dle_display_rule(volné_sloty)
```

### Konfigurace intervalů slotů

Přes Display Rule se nastaví:

| Nastavení | Možné hodnoty | Příklad |
|-----------|--------------|---------|
| Interval slotů | 5, 10, 15, 20, 30, 60 min | každých 15 minut |
| Zaokrouhlení | žádné, čtvrthodina, půlhodina, hodina | jen 0, 15, 30, 45 |
| Pouze celé hodiny | true/false | jen 9:00, 10:00… |
| Buffer před rezervací | 0–60 min | 5 min přípravu před každým |
| Buffer po rezervaci | 0–60 min | 10 min úklid po každém |

### Výpočet vytížení a optimalizace

**Strategie nabídky slotů:**

`minimize_gaps` — systém preferuje sloty, které minimalizují mrtvý čas (gap) v rozvrhu zaměstnance. Výsledek: kompaktnější rozvrh, méně neproduktivního času.

`earliest_available` — klasický přístup, první volný slot jako první.

`priority_list` — admin definuje pořadí zaměstnanců pro nabídku (nejzkušenější nejdřív).

---

## Admin operace nad rezervacemi

### Přesun rezervace (Reschedule)

Admin může přesunout jakoukoliv rezervaci:

1. V kalendáři: drag & drop na nový čas nebo zaměstnance
2. V detailu rezervace: "Přesunout" → výběr nového slotu z dostupnosti
3. Hromadně: výběr více rezervací → "Přesunout vše" → nový zaměstnanec nebo čas

**Automatické akce po přesunu:**
- Zákazník dostane e-mail/SMS s novým termínem
- Původní slot se uvolní
- Audit log záznam (kdo přesunul, odkud/kam, proč)
- Pokud je nový slot jiný zaměstnanec → notifikace novému zaměstnanci

### Storno rezervace

**Admin storno:**
- Vždy možné bez omezení
- Volba: refundovat platbu? (plná / částečná / žádná)
- Volba: poslat zákazníkovi notifikaci? (ano/ne, volitelný text)
- Důvod storna (interní, nevidí zákazník)

**Typy storna:**
- `customer_no_show` — zákazník nedorazil, záloha propadá
- `business_cancel` — firma ruší (nemoc zaměstnance) → plná refundace, omluva
- `customer_request` — zákazník požádal → dle pravidel

### Blokování termínů

Admin nebo zaměstnanec (dle oprávnění) může uzavřít čas:

| Typ blokování | Kdo smí | Viditelnost zákazníkovi |
|--------------|---------|------------------------|
| Dovolená | Manager, Owner | Ne (slot prostě chybí) |
| Interní schůzka | Employee, Manager | Ne |
| Úklid / příprava | Employee, Manager | Ne |
| Technická závada | Manager, Owner | Volitelně (zpráva na formuláři) |
| Firemní akce | Owner | Volitelně |

### Přeřazení na kolegu

Scénář: Zaměstnanec onemocní v den s rezervacemi.

1. Manager otevře "Dnešní rezervace zaměstnance Jana"
2. Vidí seznam dotčených rezervací
3. Klikne "Hromadně přeřadit"
4. Vybere náhradního zaměstnance (nebo "rozhodit automaticky dle dostupnosti")
5. Systém ověří dostupnost každého slotu u nového zaměstnance
6. Zákazníci dostanou automaticky notifikaci ("Váš termín byl přeřazen na Petru")

### Extra slot mimo rozvrh

Situace: zákazník chce v neděli, která je zavřená.

Admin (nebo owner) může ručně vytvořit "výjimkový slot":
- Mimo standardní pracovní dobu
- Přiřazený konkrétnímu zaměstnanci
- Viditelný jen pro konkrétního zákazníka nebo veřejně
- Jednorázový nebo opakovaný

---

## Zobrazení slotů zákazníkovi

### Co zákazník vidí

Zákazník v rezervačním formuláři vybírá:
1. Pobočku (pokud je více)
2. Službu
3. Zaměstnance (nebo "kdokoli dostupný")
4. Datum a čas

Systém zobrazí jen sloty, které:
- Jsou fyzicky dostupné (zaměstnanec + zdroje)
- Splňují Display Rule (interval, zaokrouhlení)
- Splňují Visibility Rule (zákazník smí vidět, je v časovém okně)
- Splňují Booking Limit Rule (zákazník nepřekračuje limity)

### Podmíněná viditelnost slotů

Příklady konfigurace:

**Příklad 1: VIP brzy ráno**
- Sloty 7:00–9:00 vidí pouze zákazníci s tagem "VIP"
- Ostatní zákazníci vidí od 9:00

**Příklad 2: Pokročilá terapie jen pro absolventy intro**
- Služba "Pokročilá masáž" viditelná jen zákazníkům, kteří mají dokončenou "Úvodní masáž" v historii rezervací

**Příklad 3: Prémiový čas jen pro předplatitele**
- Sobotní sloty viditelné jen zákazníkům s aktivním předplatným

**Příklad 4: Omezené dopředné rezervace**
- Nové zákazníky (< 1 rezervace) mohou rezervovat max. 7 dní dopředu
- Stávající zákazníci (3+ rezervace) mohou 60 dní dopředu

### Nabídka sousedních / alternativních slotů

Pokud zákazník vybere plný den:
- Systém zobrazí "Nejbližší dostupný termín: [datum + čas]"
- Nebo nabídne Waiting List: zákazník se zařadí a dostane notifikaci při uvolnění

Pokud zákazník vybere konkrétního zaměstnance, který je plný:
- "Petra je plná. Zobrazit dostupné u kolegů?"
- Systém nabídne dostupnost ostatních zaměstnanců se stejnou dovedností

---

## Čekací listina (Waiting List)

### Fungování

1. Zákazník se pokusí rezervovat plný termín
2. Systém nabídne "Přidat se na waiting list"
3. Zákazník zadá kontakt a preference (konkrétní zaměstnanec, nebo kdokoli)
4. Při uvolnění slotu (storno jiného zákazníka):
   - Systém projde waiting list v pořadí přidání
   - První zákazník dostane notifikaci s odkazem
   - Má X minut (konfigurovatelné, default 30 min) na potvrzení
   - Pokud nepotvrdí, slot přejde dalšímu v pořadí

### Konfigurace waiting listu

```
waiting_list_settings:
  enabled: true
  max_entries_per_slot: 5         # max 5 lidí ve frontě
  notification_window_min: 30     # 30 min na potvrzení
  auto_book_if_confirmed: true    # automaticky rezervuj po potvrzení
  notify_method: ["email", "sms"]
```

---

## Skupinové rezervace

### Model skupinové lekce

Skupinová lekce je slot s více místy:

```
GroupSlot
  service_id: "joga_vinyasa"
  starts_at: "2026-04-10 09:00"
  instructor_id: "jana"
  capacity: 12          # max. 12 účastníků
  min_capacity: 3       # pokud méně, lekce se zruší automaticky
  enrolled: [customer_1, customer_2, ...]
  status: open / full / cancelled
```

### Operace
- Zákazník se přihlásí (= rezervuje místo)
- Zaplatí při rezervaci nebo na místě (konfigurovatelné)
- Může se odhlásit dle pravidel storna skupiny (mohou být jiná než individuální)
- Admin může zrušit celou lekci → všichni účastníci dostanou refundaci a notifikaci
- Admin vidí seznam účastníků, může přidávat/odebírat ručně
