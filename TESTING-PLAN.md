# Reserved — Hloubkový testovací plán (200+ scénářů)

> Spuštěno: 2026-05-14
> Admin: http://localhost:3003 | Widget: http://localhost:3002 | Portal: http://localhost:3005 | Emaily: http://localhost:8026
> Login: tenant `demo` / `admin@demo.local` / `admin123`

Označuj `[x]` u splněných, `[!]` u nalezených chyb, `[?]` u nejasných.

---

## 🔐 Sekce 1: Autentizace & sezení (12 testů)

- [ ] **1.** Login s validními údaji (demo / admin@demo.local / admin123) → přesměrování na `/dashboard`
- [ ] **2.** Login se špatným heslem → chybová hláška, žádný redirect
- [ ] **3.** Login s neexistujícím emailem → chybová hláška
- [ ] **4.** Login s neexistujícím tenant slugem → chybová hláška
- [ ] **5.** Pokus o přístup na `/dashboard` bez přihlášení → redirect na `/login`
- [ ] **6.** Pokus o přístup na `/services` bez přihlášení → redirect na `/login`
- [ ] **7.** Odhlášení tlačítkem v NavHeader → redirect na `/login`, token vymazán
- [ ] **8.** Po odhlášení pokus o přístup na chráněnou stránku → redirect na `/login`
- [ ] **9.** Login → zavřít prohlížeč → otevřít znovu http://localhost:3003 → stále přihlášen (token v localStorage)
- [ ] **10.** Vyplň login formulář a stiskni Enter (ne tlačítko) → funguje login
- [ ] **11.** Empty email + empty password + submit → validace zabrání odeslání
- [ ] **12.** Header zobrazuje "salon: demo" — slug aktuálního tenanta

---

## 🧭 Sekce 2: Admin web — navigace & layout (10 testů)

- [ ] **13.** NavHeader obsahuje všechny položky: Dashboard, Kalendář, Zákazníci, Služby, Zaměstnanci, Pobočky, Permanentky, Bundle, Časové, Předplatné, Firmy, Platby, Pravidla, Blokace, Svátky, Integrace, Webhooky, Flags, Nastavení
- [ ] **14.** Kliknutí na každou položku → správná stránka se načte
- [ ] **15.** Aktivní stránka je v navu zvýrazněna (brand barva)
- [ ] **16.** Dashboard zobrazuje statistiky (počty rezervací, zákazníků)
- [ ] **17.** Layout je responzivní — zmenši okno → nav se zalomí, ne overflow
- [ ] **18.** Refresh stránky (F5) → zůstaneš na aktuální stránce (ne redirect)
- [ ] **19.** Kliknutí na "Reserved Admin" logo → vede na dashboard
- [ ] **20.** Hover na nav položku → změna barvy (subtle)
- [ ] **21.** Tlačítko "Odhlásit" je viditelné v hlavičce
- [ ] **22.** Žádné console errory v DevTools při procházení nav položek

---

## 💼 Sekce 3: Služby — CRUD (16 testů)

- [ ] **23.** `/services` → vidíš seed službu "Střih dámský" v seznamu
- [ ] **24.** Klik "+ Nová služba" → otevře se modal
- [ ] **25.** Vytvoř službu: "Masáž 30min" / 30min / 350 Kč / kategorie "—" / barva modrá / kapacita 1 → uloží se a objeví v tabulce
- [ ] **26.** Vytvoř kategorii inline z modalu: "Masáže" → kategorie se přidá do dropdownu a vybere
- [ ] **27.** Vytvoř službu s kategorií "Masáže" → kategorie se zobrazí v tabulce
- [ ] **28.** Vytvoř službu s buffer před 10min, buffer po 5min → uloženo
- [ ] **29.** Vytvoř službu s `isPublic = false` → zobrazí "jen interně" v tabulce, NENÍ ve widgetu (ověř na :3002)
- [ ] **30.** Vytvoř službu s isActive=false → zobrazí "× neaktivní"
- [ ] **31.** Edituj existující službu — změň cenu z 500 na 600 Kč → uloženo, refresh tabulky
- [ ] **32.** Edituj službu — změň délku z 60 na 90 min → uloženo
- [ ] **33.** Smazání služby s confirmation → zmizí z tabulky
- [ ] **34.** Smazání služby se zrušíí v confirmu → zůstane
- [ ] **35.** Vytvoř službu s cenou 0 Kč → uloží se (free služba)
- [ ] **36.** Vytvoř službu s kapacitou 10 (skupinová) → uloženo
- [ ] **37.** Empty název + submit → validace zabrání (`required`)
- [ ] **38.** Cena s desetinou (350.50) → uloží se jako 35050 haléřů, zobrazí jako 350,50 Kč

---

## 👥 Sekce 4: Zaměstnanci — CRUD (12 testů)

- [ ] **39.** `/employees` → vidíš "Pavla Demo" v seznamu
- [ ] **40.** Klik "+ Nový zaměstnanec" → otevře modal
- [ ] **41.** Vytvoř zaměstnance: Jana Nováková / titul "Kadeřnice" / email jana@demo.cz / telefon +420... → uloženo
- [ ] **42.** Vytvoř zaměstnance s displayName "Janička" → zobrazí se v tabulce jako "Janička" místo "Jana Nováková"
- [ ] **43.** Vytvoř zaměstnance s isPublic=false → "offline only" / nezobrazí se ve widgetu
- [ ] **44.** Vytvoř zaměstnance s acceptsOnlineBookings=false → "offline only" label
- [ ] **45.** Edituj — změň pozici z "Kadeřnice" na "Vrchní kadeřnice" → uloženo
- [ ] **46.** Edituj — přidej bio (delší text) → uloženo, zobrazí se v tabulce (truncated)
- [ ] **47.** Změň barvu zaměstnance → barva se promítne v kalendáři u rezervací
- [ ] **48.** Deaktivuj zaměstnance (isActive=false) → "× neaktivní" + ve widgetu nezobrazen
- [ ] **49.** Smazání zaměstnance s confirmation → zmizí z tabulky
- [ ] **50.** Vytvoř zaměstnance bez emailu/telefonu → uloží se (volitelné fieldy)

---

## 📍 Sekce 5: Pobočky (5 testů)

- [ ] **51.** `/branches` → vidíš "Hlavní pobočka" (seed)
- [ ] **52.** Vytvoř druhou pobočku: "Brno" / Brno / Lidická 23 → uloženo
- [ ] **53.** Edituj pobočku → změň adresu → uloženo
- [ ] **54.** Pobočka nemůže být smazána pokud má rezervace (test po vytvoření rezervace)
- [ ] **55.** Změna otevírací doby pobočky → ovlivní dostupné sloty ve widgetu

---

## 📋 Sekce 6: Zákazníci CRM (15 testů)

- [ ] **56.** `/customers` → prázdný seznam (ještě žádní)
- [ ] **57.** Po vytvoření rezervace ve widgetu → zákazník se objeví v `/customers`
- [ ] **58.** Klik na zákazníka → detail stránka s rezervacemi, statistikami
- [ ] **59.** Detail zobrazuje: jméno, email, telefon, datum vytvoření
- [ ] **60.** Detail zobrazuje statistiky: celkem rezervací, dokončených, zrušených, no-show, celkem utraceno
- [ ] **61.** Detail zobrazuje seznam rezervací zákazníka
- [ ] **62.** Přidej tag k zákazníkovi (např. "VIP") → uloží se, zobrazí
- [ ] **63.** Přidej barevný tag → barva se zobrazí
- [ ] **64.** Odstraň tag → zmizí
- [ ] **65.** Přidej poznámku k zákazníkovi (internal note) → uloží se
- [ ] **66.** Filtr zákazníků podle tagu → zobrazí pouze s daným tagem
- [ ] **67.** Vyhledávání zákazníků podle emailu (search) → najde
- [ ] **68.** Vyhledávání podle jména → najde
- [ ] **69.** Zákazník opt-out z marketingu (marketingOptIn=false) → uloženo
- [ ] **70.** Země zákazníka (country field) — defaultně CZ — lze změnit

---

## 📅 Sekce 7: Kalendář (sprint 1.6) — bookings & drag-drop (15 testů)

- [ ] **71.** `/calendar` → zobrazí se týdenní pohled (timeGridWeek)
- [ ] **72.** Přepínač Měsíc / Týden / Den funguje
- [ ] **73.** Tlačítka prev / next / Dnes navigují kalendář
- [ ] **74.** První den týdne je pondělí (firstDay=1, lokálně CS)
- [ ] **75.** Časové pásmo zobrazení je Europe/Prague
- [ ] **76.** Vytvoř rezervaci přes widget → zobrazí se v kalendáři
- [ ] **77.** Rezervace má barvu podle statusu (potvrzena = modrá `#3b82f6`)
- [ ] **78.** Klik na rezervaci → modal s detaily
- [ ] **79.** Modal zobrazí: zákazník, email, telefon, zaměstnanec, začátek, konec, cena, stav, poznámka
- [ ] **80.** Drag-and-drop rezervace na jiný čas → reschedule, refresh úspěšný
- [ ] **81.** Drag-and-drop mimo pracovní dobu → není proveditelné (nebo dovolené)
- [ ] **82.** Filtr "Zaměstnanec" v hlavičce → vyber konkrétního → zobrazí jen jeho rezervace
- [ ] **83.** Filtr "Všichni" → vidíš všechny rezervace zpět
- [ ] **84.** Legenda dole — vidíš 7 barev (5 statusů + Blokace + Svátek)
- [ ] **85.** Hover na rezervaci → tooltip / kurzor pointer (visual feedback)

---

## 🚫 Sekce 8: Blokace času (10 testů)

- [ ] **86.** Klik a tažení přes prázdnou oblast v kalendáři → otevře se "Nová blokace" modal
- [ ] **87.** Modal má předvyplněný rozsah (od-do podle tažení)
- [ ] **88.** Vyber typ "Úklid" + název "Velký úklid" + zaměstnanec Pavla → vytvoří blokaci
- [ ] **89.** Blokace se zobrazí v kalendáři šedě s ikonou 🚫
- [ ] **90.** Vytvoř blokaci s `employeeId=null` (Všichni) → blokuje všechny zaměstnance
- [ ] **91.** Aktivní filtr zaměstnance v kalendáři → předvyplní se v modalu pro novou blokaci
- [ ] **92.** Klik na blokaci → otevře BlockDetailModal s detaily
- [ ] **93.** Smazání blokace přes BlockDetailModal → zmizí z kalendáře
- [ ] **94.** Typy blokací: Úklid / Školení / Schůzka / Údržba / Jiné — všechny lze vybrat
- [ ] **95.** Blokace překáží rezervaci — pokus zarezervovat blokovaný čas přes widget → neproveditelné

---

## 🎉 Sekce 9: Svátky (5 testů)

- [ ] **96.** `/holidays` → seznam svátků (možná prázdný nebo se státními)
- [ ] **97.** Vytvoř svátek: 24.12.2026 / Štědrý den / zavřeno (isOpen=false)
- [ ] **98.** Svátek (isOpen=false) se zobrazí v `/calendar` jako 🎉 all-day event
- [ ] **99.** Svátek (isOpen=true — otevřeno) NENÍ vykreslen v kalendáři vizuálně
- [ ] **100.** Smaž svátek → zmizí z kalendáře

---

## 🛒 Sekce 10: Booking widget — veřejný flow (15 testů)

Widget na http://localhost:3002 (může vyžadovat URL s tenant slugem).

- [ ] **101.** Otevři widget → vidíš seznam veřejných služeb
- [ ] **102.** Klik na službu → vybereš ji
- [ ] **103.** Po výběru služby → seznam zaměstnanců, kteří službu poskytují
- [ ] **104.** Klik na zaměstnance → kalendář s dostupnými termíny
- [ ] **105.** Vyber datum → zobrazí se dostupné časy
- [ ] **106.** Časy zohledňují buffery (před/po)
- [ ] **107.** Časy zohledňují kapacitu (pokud >1 → skupinová rezervace)
- [ ] **108.** Vyber čas → drží se po dobu 10min (slot_hold)
- [ ] **109.** Vyplň zákaznické údaje (jméno, email, telefon) → pokračovat
- [ ] **110.** Volitelná poznámka pro zákazníka → uloží se na booking
- [ ] **111.** Submit → rezervace vytvořena, dostaneš reference code (B-XXXX-XXXX)
- [ ] **112.** Email potvrzení dorazí do MailHog (http://localhost:8026)
- [ ] **113.** Rezervace se objeví v admin `/calendar` okamžitě
- [ ] **114.** Pokus o rezervaci v už blokovaném čase → není dostupný slot
- [ ] **115.** Pokus o rezervaci u neaktivního zaměstnance → není vidět

---

## 🔄 Sekce 11: Reschedule & cancel rezervace (12 testů)

- [ ] **116.** Z admin kalendáře — klik na rezervaci → modal → "Zrušit"
- [ ] **117.** Při rušení zadej důvod → uloží se
- [ ] **118.** Zrušená rezervace má status "cancelled" + šedá barva
- [ ] **119.** Email se zrušením dorazí do MailHog
- [ ] **120.** Reschedule přes drag-drop → uloží se nový čas
- [ ] **121.** Email s přesunem (s old + new časem) dorazí do MailHog
- [ ] **122.** Mark "Nedorazil/a" (no_show) → status změna, červená barva
- [ ] **123.** Mark "Dokončeno" (completed) → status změna, zelená barva
- [ ] **124.** Po cancel se v detailu zákazníka cancelledCount zvýší
- [ ] **125.** Po no-show se noShowCount zvýší
- [ ] **126.** Po completed se completedCount zvýší + totalSpent přidá
- [ ] **127.** Cancelled rezervaci NELZE znovu mark completed (tlačítka skrytá)

---

## 👤 Sekce 12: Customer portal (10 testů)

Portal na http://localhost:3005.

- [ ] **128.** Zákazník si zažádá o magic link na svém emailu
- [ ] **129.** Email s magic linkem dorazí do MailHog
- [ ] **130.** Klik na link → portal login úspěšný
- [ ] **131.** Portal zobrazí seznam zákazníkových rezervací
- [ ] **132.** Klik na rezervaci → detail
- [ ] **133.** Zákazník může zrušit svou rezervaci → status changed
- [ ] **134.** Zákazník může požádat o přesun → admin vidí v notifikacích
- [ ] **135.** Zákazník si nastaví heslo → příště se přihlásí emailem+heslem bez magic linku
- [ ] **136.** Portal sekce předplatné — zobrazí aktivní subscriptions
- [ ] **137.** Portal sekce balíčky — zobrazí remaining credits / bundle items / time pack

---

## 🎫 Sekce 13: Permanentky / credit packs (10 testů)

- [ ] **138.** `/credit-packs` → seznam šablon permanentek (asi prázdný)
- [ ] **139.** Vytvoř šablonu "10 návštěv" / 10 kreditů / 4000 Kč / platnost 365 dní
- [ ] **140.** Alokuj permanentku zákazníkovi (přes Allocation UI)
- [ ] **141.** Vytvoř rezervaci za toho zákazníka → 1 kredit se odečte
- [ ] **142.** Zrušení rezervace → kredit se vrátí
- [ ] **143.** Vyčerpání všech kreditů → další rezervace platí plnou cenu
- [ ] **144.** Expirovaná permanentka (vypršela platnost) → kredity se nepoužijí
- [ ] **145.** Detail zákazníka zobrazuje jeho permanentky
- [ ] **146.** Permanentka s konkrétní službou (whitelist) → odečte se jen pro tu službu
- [ ] **147.** Permanentka pro všechny služby → odečte se pro libovolnou

---

## 📦 Sekce 14: Bundle balíčky (10 testů)

- [ ] **148.** `/bundle-packs` → seznam šablon bundlů
- [ ] **149.** Vytvoř bundle: 5x Střih + 2x Masáž za 3500 Kč
- [ ] **150.** Alokuj bundle zákazníkovi
- [ ] **151.** Vytvoř rezervaci Střih → 1 z 5 položek bundlu se odečte
- [ ] **152.** Vytvoř rezervaci Masáž → 1 z 2 položek se odečte
- [ ] **153.** Vyčerpání jedné položky (Střih) ale jiná zbývá (Masáž) → další Střih platí plnou cenu
- [ ] **154.** Zrušení rezervace s odečteným bundle → položka se vrátí
- [ ] **155.** Detail zákazníka zobrazuje bundle s remaining counts
- [ ] **156.** Bundle expiruje po datu platnosti → nepoužije se
- [ ] **157.** Priorita deduct: pokud má zákazník i time pack + bundle, time pack se použije první (sprint 3.3 specifikace)

---

## ⏱️ Sekce 15: Časové balíčky / time packs (10 testů)

- [ ] **158.** `/time-packs` → seznam šablon
- [ ] **159.** Vytvoř time pack: 30 dní / max 4 rezervace celkem / max 1 za den / 800 Kč
- [ ] **160.** Alokuj time pack zákazníkovi
- [ ] **161.** Vytvoř rezervaci → spotřebovává time pack (zdarma)
- [ ] **162.** Pokus o 2. rezervaci ten samý den → blokováno (max 1/day)
- [ ] **163.** Po 4 rezervacích → time pack vyčerpán
- [ ] **164.** Po 30 dnech (změň datum manuálně v DB) → expirovaný
- [ ] **165.** Detail zákazníka zobrazuje time pack s remaining + zbývající dny
- [ ] **166.** Time pack pro konkrétní službu (whitelist) → jen ta služba je zdarma
- [ ] **167.** Zrušení rezervace s time packem → "návštěva" se nevrací (důležitý feature — time-based ne count-based)

---

## 💳 Sekce 16: Subscriptions / předplatné (12 testů)

> Vyžaduje Stripe sandbox klíče v .env (zatím prázdné) — bez nich lze ovlivnit jen UI.

- [ ] **168.** `/subscription-plans` → seznam plánů
- [ ] **169.** Vytvoř plán: "Premium" / 999 Kč/měsíc / -10% sleva na vše
- [ ] **170.** Vytvoř plán s exclusive access na konkrétní službu → bez subscription si ji nelze rezervovat
- [ ] **171.** Bez Stripe klíčů checkout nefunguje (očekávaná chyba) — ALE UI se má zobrazit
- [ ] **172.** S Stripe klíči — zákazník v portalu klikne "Koupit" → redirect na Stripe Checkout
- [ ] **173.** Po úspěšné platbě (Stripe testovací karta 4242 4242 4242 4242) → webhook → subscription aktivní
- [ ] **174.** Aktivní subscription zobrazena v portal zákazníka
- [ ] **175.** Rezervace za zákazníka s aktivním subscription → automatický -10% discount applied
- [ ] **176.** Zákazník zruší subscription → status `cancelled`, doběhne do konce období
- [ ] **177.** Po vypršení subscription → discount už neapliokován
- [ ] **178.** Exclusive service → bez subscription dostane error `EXCLUSIVE_SERVICE_REQUIRES_SUBSCRIPTION`
- [ ] **179.** Idempotence webhooku — opakovaný webhook stejné události se aplikuje 1×

---

## 🏢 Sekce 17: Korporátní účty (B2B) (12 testů)

- [ ] **180.** `/corporate-accounts` → seznam firem (prázdný)
- [ ] **181.** Vytvoř firmu: "ABC s.r.o." / IČO / kontakt
- [ ] **182.** Přidej člena (existujícího zákazníka) k firmě
- [ ] **183.** Přidej druhého člena → firma má 2 členy
- [ ] **184.** Alokuj firmě credit pack 100 kreditů → sdílí všichni členové
- [ ] **185.** Člen 1 vytvoří rezervaci → odečte firemní credit pack (ne osobní)
- [ ] **186.** Člen 2 vytvoří rezervaci → odečte ze stejného poolu
- [ ] **187.** Stejně pro bundle a time packs — sdílené
- [ ] **188.** Soft-remove člena (removed_at) → už nemůže čerpat
- [ ] **189.** Firemní reporting (`/corporate-accounts/:id/reports`) — usage per člen, period summary
- [ ] **190.** Filtr "Firma" v zákaznících
- [ ] **191.** XOR constraint: rezervace má buď customerId NEBO corporateAccountId (ne oboje) — DB CHECK

---

## 🚩 Sekce 18: Feature flags (5 testů)

- [ ] **192.** `/feature-flags` → admin UI seznam
- [ ] **193.** Vytvoř flag `beta:google_sync` / popis / enabled=false → uloženo
- [ ] **194.** Toggle flag → změní isEnabled
- [ ] **195.** Flag s JSON config → uloží se, lze upravit
- [ ] **196.** Smazat flag → zmizí

---

## 📅 Sekce 19: Google Calendar integrace (5 testů)

> Vyžaduje GOOGLE_CLIENT_ID, GOOGLE_CLIENT_SECRET v .env.

- [ ] **197.** `/integrations` zobrazí seznam zaměstnanců s tlačítkem "Propojit Google" (bez klíčů ukáže error)
- [ ] **198.** S klíči — klik "Propojit" → redirect na Google OAuth → po souhlasu se vrátíš se status "Propojeno"
- [ ] **199.** Vytvoř rezervaci → outbound sync — event se objeví v Google Calendari zaměstnance
- [ ] **200.** Toggle "Inbound sync" → klik "Sync teď" → eventy z Google Calendare se zkopírují jako blokace do Reserved
- [ ] **201.** Smazání eventu v Google → další sync → blokace v Reserved také zmizí

---

## 🌐 Sekce 20: Webhooky (10 testů)

- [ ] **202.** `/webhooks` → prázdný seznam
- [ ] **203.** Vytvoř webhook: název "Test", URL https://webhook.site/<your-uuid>, eventy `booking.created`
- [ ] **204.** Po vytvoření se zobrazí secret — zkopíruj do schránky
- [ ] **205.** Tlačítko "Test" → pošle ukázkový payload → na webhook.site vidíš POST
- [ ] **206.** Vytvoř rezervaci přes widget → webhook dostane `booking.created` payload
- [ ] **207.** Payload obsahuje hlavičky: X-Reserved-Signature, X-Reserved-Event-Type, X-Reserved-Webhook-Id
- [ ] **208.** Tlačítko "Log" → zobrazí seznam posledních 50 doručení s HTTP statusy
- [ ] **209.** Toggle "Vypnout" → webhook neaktivní, další eventy se neposílají
- [ ] **210.** Vytvoř webhook s neexistující URL (např. https://nonexistent.invalid) → po 5 chybách v řadě se auto-vypne
- [ ] **211.** Smazání webhooku → zmizí + jeho deliveries také

---

## 🎥 Sekce 21: Online meeting URL (sprint 3.3 C4) (5 testů)

- [ ] **212.** Edituj službu — zaškrtni "Online" + zadej Zoom URL
- [ ] **213.** Vytvoř rezervaci na tuto službu → booking dostane onlineMeetingUrl (zkopírováno ze služby)
- [ ] **214.** Customer portal — u rezervace vidíš tlačítko "Připojit se k videohovoru"
- [ ] **215.** Email potvrzení obsahuje meeting URL
- [ ] **216.** Reschedule online rezervace → URL zůstává

---

## 📧 Sekce 22: Emailové notifikace (8 testů)

Všechny emaily v MailHog: http://localhost:8026

- [ ] **217.** Po vytvoření rezervace → email "Potvrzení rezervace"
- [ ] **218.** Po zrušení → email "Vaše rezervace byla zrušena"
- [ ] **219.** Po reschedule → email "Vaše rezervace byla přesunuta" (s old + new časem)
- [ ] **220.** Magic link email s odkazem na portal
- [ ] **221.** Password set confirm email po nastavení hesla
- [ ] **222.** Email obsahuje reference code rezervace
- [ ] **223.** Email obsahuje jméno zaměstnance + služby + čas
- [ ] **224.** Subject obsahuje název tenanta ("— Demo Tenant")

---

## 🔒 Sekce 23: Multi-tenant izolace & RLS (8 testů)

- [ ] **225.** Vytvoř druhý tenant (přes seed nebo manuálně v DB)
- [ ] **226.** Přihlaš se do druhého tenantu → vidíš pouze jeho data
- [ ] **227.** Pokus o GET rezervací prvního tenantu z druhého tenantu → 403/404
- [ ] **228.** Webhook secret jednoho tenantu není viditelný v druhém
- [ ] **229.** Customer email kolize: stejný email v 2 tenantech → 2 různí customers (per-tenant)
- [ ] **230.** Service ID z jednoho tenantu nelze použít při rezervaci ve druhém
- [ ] **231.** Pravidla (rules engine) izolovaná per-tenant
- [ ] **232.** Reporting per tenant — žádné cross-tenant data

---

## ⚠️ Sekce 24: Edge cases, bezpečnost, UX (12 testů)

- [ ] **233.** Rezervace v minulosti (dragnout na minulý den) → odmítnuta
- [ ] **234.** Rezervace s end < start → validation error
- [ ] **235.** XSS test: vlož `<script>alert(1)</script>` do názvu služby → escape, nespustí se
- [ ] **236.** SQL injection: pokud existuje search input, zkus `' OR 1=1--` → zabezpečeno přes parametrizované queries (Drizzle)
- [ ] **237.** Velmi dlouhý text (10k znaků) v poznámce zákazníka → buď oříznuto nebo validation error, ne 500
- [ ] **238.** Emoji v jméně zákazníka 🎉 → uloženo, zobrazeno
- [ ] **239.** Unicode v emailu (例如@example.cz) → uloženo
- [ ] **240.** Konkurence: 2 zákazníci se snaží rezervovat stejný slot souběžně → pouze 1 uspěje (PostgreSQL EXCLUDE constraint)
- [ ] **241.** Vypnutí internetu během booking flow → user-friendly error, ne white screen
- [ ] **242.** Refresh stránky uprostřed modálu → nezavře okno (state v URL? — nebo akceptováno že se zavře)
- [ ] **243.** Tab navigation (klávesnice) — všechny inputy + tlačítka jsou dostupné z klávesnice
- [ ] **244.** Enter v modálu submituje formulář (UX)

---

## 🐢 Sekce 25: Performance & stabilita (6 testů)

- [ ] **245.** Načtení `/calendar` s 1000+ rezervacemi za měsíc → < 2s
- [ ] **246.** `/customers` se 500+ zákazníky → pagination nebo limit, ne crash
- [ ] **247.** Po 100 vytvořených rezervacích → console nemá memory leak warning
- [ ] **248.** Hot-reload v dev módu — změna API kódu se promítne bez restartu
- [ ] **249.** Hot-reload web — změna komponenty se projeví bez F5
- [ ] **250.** Database connection pool nevyteče (max DATABASE_POOL_MAX = 10)

---

## 📝 Sekce 26: Pravidla / Rules engine (5 testů)

- [ ] **251.** `/rules` → seznam pravidel (možná prázdný)
- [ ] **252.** Vytvoř pravidlo: trigger `booking_no_show` → action `send_email` s custom šablonou
- [ ] **253.** Vytvoř no-show rezervaci → email od pravidla dorazí do MailHog
- [ ] **254.** Pravidlo s condition (např. `customerType === 'corporate'`) → spustí se jen pro odpovídající
- [ ] **255.** Vypnutí pravidla → se neaplikuje

---

## ✅ Konečný checklist

Po projití všech sekcí:

- [ ] Žádné console errory v běžných flows
- [ ] Žádné 500 errors v API logu
- [ ] Všechny emaily správně rendrované (HTML/text)
- [ ] Drag-drop funguje plynule
- [ ] Multi-tenant izolace funguje (žádné cross-tenant leakage)
- [ ] Webhooky doručují events spolehlivě
- [ ] Kalendář se chová predikabilně
- [ ] Zákazník dostane vše co má (emaily, portal, rezervace)
- [ ] Admin UI nezpůsobuje frustraci (intuitivní flow, jasné chybové hlášky)

---

## 🐛 Jak hlásit nalezené chyby

Při nalezení chyby — pošli mi prosím:

1. **Čísla testů** (např. #67, #142)
2. **Co se mělo stát** (Expected)
3. **Co se reálně stalo** (Actual)
4. **Reprodukce** (klikni X → Y → Z)
5. **Screenshoty** (pokud UX problém)
6. **Console / Network log** (pokud technický problém)

Opravím v dávkách po sekcích nebo po prioritách.
