# 07 — Klientský portál & samoobsluha

## Filosofie

Klientský portál je řízený pravidly — zákazník vidí a smí jen to, co mu systém dovolí. Tím se eliminuje 60–70 % support komunikace (telefonáty, e-maily "chci přesunout termín") a zákazník dostává moderní self-service zkušenost 24/7.

**Klíčový princip:** Tlačítko se zobrazí jen tehdy, když ho zákazník smí použít. Pokud pravidlo přesun neumožňuje, tlačítko "Přesunout" se prostě nezobrazí — nebo zobrazí jako "Požádat o přesun".

---

## Přístup do portálu

### Způsoby přihlášení
- E-mail + heslo (s možností reset hesla)
- Magic link (přihlášení bez hesla — link na e-mail)
- Google / Apple OAuth (volitelné, konfigurovatelné per tenant)
- Jako host (bez registrace — jen správa konkrétní rezervace přes token v e-mailu)

### Registrace
- Automatická registrace při první rezervaci (zákazník dostane e-mail s nastavením hesla)
- Nebo volitelná manuální registrace
- Tenant může vypnout portál a zákazníci jsou vždy "hosté"

---

## Sekce klientského portálu

### 1. Moje rezervace

**Aktivní rezervace:**
- Karta rezervace: datum, čas, zaměstnanec, pobočka, služba, cena
- Stav: potvrzeno / čeká na potvrzení / platba čeká
- Akce (dle pravidel): Přesunout / Zrušit / Požádat o změnu
- Přidat do Kalendáře (ics link, Google Calendar deeplink)

**Čekání na uvolnění (Waiting list):**
- Zobrazení pozice ve frontě
- Možnost se odebrat z waiting listu

**Minulé rezervace:**
- Historie návštěv s datem, službou, zaměstnancem, cenou
- Tlačítko "Rezervovat znovu" — prefilluje formulář stejnou službou a zaměstnancem
- Hodnocení a recenze (pokud zákazník ještě nehodnotil)

**Zrušené rezervace:**
- Přehled s důvodem (kdo zrušil, kdy)
- Stav vrácení platby

### 2. Moje balíčky a kredity

- Přehled zakoupených balíčků s názvem, typem, zbývajícími kredity
- Progress bar: "Použito 3 z 10 vstupů"
- Datum platnosti / expirace s vizuálním upozorněním
- Historie čerpání (kdy který kredit byl použit)
- Tlačítko "Koupit další" (přesměruje na e-shop balíčků)

### 3. Moje platby

- Přehled všech plateb: datum, částka, za co, stav (zaplaceno / vráceno / čeká)
- Stahování faktur ve formátu PDF
- Uložené platební metody (karta, zobrazena jen poslední 4 číslice)
- Přidání / odebrání platební karty

### 4. Můj profil

**Osobní údaje:**
- Jméno, telefon, e-mail (změna e-mailu vyžaduje potvrzení)
- Datum narození (pro věrnostní program nebo narozeninové slevy)
- Poznámky pro poskytovatele (alergie, preference, zdravotní omezení) — zákazník je edituje sám

**Oblíbení zaměstnanci:**
- Zákazník si uloží preferované poskytovatele
- Při rezervaci se filtr "Kdokoli dostupný" nahradí preferencemi
- Lze nastavit pořadí preference

**Komunikační preference:**
- Kanál potvrzení: e-mail / SMS / oboje
- Čas připomínky: 24h / 2h / 1h před termínem (nebo kombinace)
- Marketingové souhlasy: promo akce, novinky, věrnostní program — zvlášť

**Bezpečnost:**
- Změna hesla
- Aktivní sessions (zobrazení zařízení, možnost odhlásit vše)
- Smazání účtu (GDPR — spustí proces výmazu dat)

### 5. Notifikace a zprávy

- Přehled doručených notifikací (potvrzení, připomínky, změny)
- Zprávy od poskytovatele (admin může zákazníkovi napsat přímo)
- Přečtené / nepřečtené s odznáčkem

---

## Samoobslužné akce — detailní popis

### Přesun rezervace zákazníkem

**Flow:**
1. Zákazník klikne "Přesunout" na kartě rezervace
2. Systém ověří: smí zákazník přesunout? (Rules Engine)
   - Pokud ne: zobrazí důvod + "Požádat o přesun" tlačítko
   - Pokud ano: pokračuje krokem 3
3. Zobrazí se kalendář dostupnosti pro stejnou službu a zaměstnance
   - Volitelně: "Přepnout na jiného zaměstnance" (dle povolení)
4. Zákazník vybere nový termín
5. Potvrzovací dialog: "Přesunout z [starý čas] na [nový čas]?"
6. Potvrdí → systém přesune, notifikuje, audit log

**Omezení přesunu dle pravidel:**
- Min. X hodin před termínem
- Max. Y přesunů na jedné rezervaci
- Pouze do stejného zaměstnance nebo i jiného
- Pouze o ±1 slot nebo libovolně

### Storno rezervace zákazníkem

**Flow:**
1. Zákazník klikne "Zrušit"
2. Systém vyhodnotí pravidla storna:
   - Volný storno (plná refundace) → potvrzovací dialog → storno + refundace
   - Storno s poplatkem → dialog s upozorněním na poplatek → zákazník potvrdí → storno + strhnutí
   - Storno zakázáno → "Termín nelze zrušit online. Kontaktujte nás nebo pošlete žádost."
3. Po storno: e-mail potvrzení + info o refundaci (kdy přijde na kartu)

### Žádost o storno / přesun

Pokud zákazník nemůže zrušit sám (pravidla to neumožňují), odešle žádost:
- Předvyplněný formulář: rezervace, důvod, preferovaný nový termín (volitelně)
- Admin v dashboardu vidí seznam čekajících žádostí
- Schválí (→ akce se provede automaticky + notifikace zákazníkovi) nebo zamítne (s důvodem)

---

## Zákaznický self-service — nastavení pro admina

V admin nastavení může owner zapnout/vypnout každou samoobslužnou funkci:

| Funkce | Zapnout/Vypnout | Podmínky |
|--------|----------------|---------|
| Zákazník smí zrušit | ✓ | Min. X hodin před, max. Y× za měsíc zdarma |
| Zákazník smí přesunout | ✓ | Min. X hodin před, max. Y× na rezervaci |
| Zákazník smí měnit profil | ✓ | — |
| Zákazník smí koupit balíček | ✓ | Jen veřejné balíčky |
| Zákazník smí hodnotit | ✓ | Jen po dokončené rezervaci |
| Zákazník smí vidět ceny | ✓ | — |
| Zákazník smí přidat do kalendáře | ✓ | — |
| Waiting list | ✓ | Max. X osob ve frontě |
| Žádosti o změnu | ✓ | — |

---

## Notifikační systém

### Transakční notifikace (vždy odeslány)

| Událost | E-mail | SMS |
|---------|--------|-----|
| Rezervace vytvořena | ✓ | volitelné |
| Rezervace potvrzena adminem | ✓ | volitelné |
| Připomínka 24h před | ✓ | volitelné |
| Připomínka 2h před | ✓ | volitelné |
| Rezervace zrušena | ✓ | volitelné |
| Rezervace přesunuta | ✓ | volitelné |
| Platba potvrzena | ✓ | — |
| Refundace odeslána | ✓ | — |
| Balíček expiruje za 7 dní | ✓ | — |

### Marketingové notifikace (vyžadují souhlas)

| Událost | Trigger |
|---------|---------|
| Výzva k hodnocení | 2h po dokončení rezervace |
| Reaktivační e-mail | 60 dní bez rezervace |
| Narozeninová sleva | Den před narozeninami |
| Věrnostní odměna | Po dosažení prahu bodů |
| Nová kampaň / promo | Manuální odeslání adminem |

### Šablony notifikací

Admin může upravovat šablony e-mailů a SMS:
- WYSIWYG editor pro e-maily (nebo HTML)
- Proměnné: `{{customer_name}}`, `{{booking_date}}`, `{{service_name}}`, `{{employee_name}}`, atd.
- Preview v různých e-mailových klientech
- A/B testování subject line (enterprise plán)
