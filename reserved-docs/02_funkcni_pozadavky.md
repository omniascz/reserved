# 02 — Funkční požadavky

## Core funkce (MVP — bez čeho systém nefunguje)

### Rezervace & kalendář
- Online rezervační formulář dostupný 24/7 bez nutnosti registrace
- Správa více služeb s vlastní délkou, cenou, barvou, popisem a fotografiemi
- Přiřazení rezervace konkrétnímu zaměstnanci nebo zdroji (místnost, přístroj)
- Nastavení pracovní doby, přestávek a výjimek per zaměstnanec i per pobočka
- Blokování termínů s typem (dovolená, úklid, školení, interní schůzka)
- Ruční vytvoření rezervace adminem (telefon, osobní návštěva)
- Zobrazení kalendáře: denní, týdenní, měsíční pohled; přepínání mezi zaměstnanci
- Drag & drop přesun rezervací v admin kalendáři

### Notifikace
- E-mail potvrzení rezervace zákazníkovi i poskytovateli (vlastní šablony)
- SMS a e-mail připomínky — konfigurovatelný čas před termínem
- Notifikace při zrušení, přesunu nebo změně rezervace
- Notifikace při přijetí nové rezervace zaměstnanci
- Denní přehled (digest) pro majitele a manažery

### Platby
- Integrace platební brány (Stripe primárně, rozšiřitelné)
- Platba předem — plná nebo záloha (procento nebo fixní částka)
- Vrácení platby při storno dle konfigurovatelných pravidel
- Podpora více měn

### Klienti
- Databáze zákazníků s historií rezervací, plateb a poznámek
- Zákaznický portál — přihlášení, správa vlastních rezervací
- Tagy a skupiny zákazníků (VIP, firemní, rizikový, člen programu)
- Import/export zákazníků (CSV)
- GDPR: smazání dat, export dat, souhlas s marketingem

### Přizpůsobení a branding
- Vlastní logo, primární barva, název stránky
- Vlastní URL nebo vlastní doména (CNAME)
- Vložitelný widget (iframe nebo JS embed) na vlastní web
- Vlastní e-mail odesílatele (SMTP nebo SendGrid napojení)
- Vícejazyčný interface (minimálně CS, SK, EN, DE, PL)

### Admin a správa
- Dashboard: přehled dne, příjmy, obsazenost, noví zákazníci
- Statistiky: rezervace, výpadky, no-show rate, průměrná hodnota
- Mobilní přístup (PWA nebo nativní app)
- Audit log — kdo co kdy udělal

---

## Premium funkce (placené moduly nebo vyšší plány)

### Finance & fakturace
- Automatická fakturace po provedené službě
- Přehled tržeb per zaměstnanec, pobočka, služba, období
- Export do účetního softwaru (PDF, CSV, ISDOC pro CZ)
- Dárkové poukazy — prodej i uplatnění
- Slevové kupóny — procentuální, fixní, jednorázové nebo opakované
- Věrnostní bodový program s konfigurovatelnými odměnami

### Marketing & zákazníci
- E-mail marketing integrace (Mailchimp, Klaviyo, vlastní SMTP)
- Automatická výzva k recenzi po návštěvě (Google, vlastní hodnocení)
- Waiting list při plné kapacitě s automatickým upozorněním
- Opakující se rezervace (weekly, bi-weekly, monthly) — série termínů
- Segmentace zákazníků a automatické kampaně
- Dynamický up-selling při rezervaci ("přidej službu se slevou")

### Skupinové a eventy
- Skupinové lekce s kapacitou a správou účastníků
- Vstup na skupinovou lekci kreditním balíčkem
- Waiting list pro skupinové lekce
- Hromadné pozvánky a komunikace s účastníky

### Integrace
- Google Kalendář a Apple Kalendář (obousměrná synchronizace)
- Zapier a Make (Integromat) connector
- Zoom a Google Meet — automatické generování linku
- Google Analytics 4 a Meta Pixel
- Open REST API s webhooks

### Multi-pobočka a tým
- Neomezený počet poboček v rámci jednoho účtu
- Sdílení zaměstnanců mezi pobočkami
- Centrální vs. lokální nastavení — co pobočky smí přepisovat
- Konsolidovaný reporting přes všechny pobočky
- Přístupová oprávnění — granulární matice rolí
- Výkonnostní dashboard per zaměstnanec a provize

### Light HR modul
- Zaměstnanecké profily (kontakt, doklady, smlouva, poznámky)
- Pracovní doby a směny per zaměstnanec
- Žádosti o dovolenou a schválení nadřízeným
- Matice dovedností — ke kterým službám je zaměstnanec přiřazen
- Log aktivit zaměstnanců

---

## Budoucí funkce (roadmapa, fáze 3+)

### AI a automatizace
- Konverzační AI asistent pro rezervace (přirozený jazyk)
- Inteligentní scheduling optimizer — minimalizace mrtvých časů
- Dynamické ceny (yield management) dle obsazenosti a poptávky
- Predikce no-show + automatický overbooking s rezervou
- Churn detection — zákazník 60 dní nerezeroval, spusť retenci
- Personalizovaná doporučení služeb na základě historie

### Nové kanály
- Rezervace přes WhatsApp Business API
- Rezervace přes Instagram a Facebook (Book Now button)
- Voice rezervace (integrace s hlasovými asistenty)
- NFC/QR kód na místě pro okamžitou rezervaci

### UX inovace
- Interaktivní výběr křesla / stolu / místnosti na mapě prostoru
- AR preview výsledku před rezervací (účes, make-up)
- Pre-visit intake formulář vyplněný zákazníkem předem

### Platby budoucnosti
- BNPL (Klarna, Splitit) pro dražší procedury a balíčky
- Krypto / stablecoin platby
- Apple Pay a Google Pay (Stripe Elements)

### Analytika
- Revenue forecasting na základě sezónnosti
- No-show scoring per zákazník
- Anonymní benchmarking obsazenosti vůči oboru
- Cohort analýza zákaznické retence
