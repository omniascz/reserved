# 09 — Obchodní model (v2)

> Přepracováno po dokončení technické dokumentace, marketplace architektury
> a reálného odhadu vývoje (2 vývojáři).
> Všechny "nebo" jsou nyní rozhodnuty. Čísla jsou konzervativní.

---

## Tři příjmové proudy

Systém má od základu navrženy tři způsoby jak vydělávat — nezávislé,
ale navzájem se posilující.

```
1. SaaS předplatné       → tenanti platí za přístup k systému
2. Marketplace provize   → % z každé rezervace přes marketplace
3. White-label licence   → agentury a resellers platí za branded verzi
```

Každý proud má jiný zákaznický segment, jiný sales motion a jiný churn profile.
SaaS je základ. Marketplace je multiplikátor. White-label je enterprise.

---

## PROUD 1 — SaaS předplatné

### Principy cenotvorby

- Cena roste s počtem zaměstnanců — přirozený expansion revenue
- Žádná provize z rezervací — zákazník nás nenávidí za úspěch
- 14denní trial, plný Pro plán — ukážeme maximum, ne okleštěnou verzi
- Roční plán = 2 měsíce zdarma (16,7 % sleva) — lepší cashflow, nižší churn
- Add-ony pro co zákazník nepotřebuje vždy, ale ocení když ano

### Plány

#### Free (onboarding nástroj, ne revenue)
**Cena:** 0 Kč / měsíc — navždy

Účel: Zachytit solopodnikatele kteří nejsou připraveni platit.
Udržet je v ekosystému. Konvertovat při růstu.

Zahrnuje:
- 1 zaměstnanec, 1 pobočka, 1 služba
- Max 30 rezervací / měsíc
- Rezervační formulář (s "Powered by [název]" watermark)
- E-mail potvrzení (naše šablona, nelze změnit)
- Zákaznická databáze do 100 zákazníků

Nezahrnuje: SMS, platby, branding, notifikační šablony, jakékoliv pokročilé funkce

Konverzní trigger: zákazník překročí 30 rezervací → "Upgrade pro neomezené rezervace"

---

#### Starter — solopodnikatel
**Cena:** 490 Kč / měsíc | 4 900 Kč / rok (2 měsíce zdarma)

Pro koho: kadeřník solo, masérka solo, kouč solo, lékař solo ordinace

Zahrnuje:
- 1 zaměstnanec, 1 pobočka
- Neomezené rezervace
- Rezervační formulář bez watermarku
- Vlastní subdoména (jmeno.nasedomena.cz)
- E-mail notifikace + šablony (vlastní text)
- E-mail připomínky (24h a 2h před)
- Zákazníci: neomezeno
- Základní kalendář (denní + týdenní pohled)
- Ruční přidání rezervace
- Export zákazníků (CSV)
- Podpora: e-mail (odpověď do 48h)

Nezahrnuje: SMS, platby předem, balíčky, série/permanentky, Rules Engine,
zákaznický portál, více poboček/zaměstnanců

---

#### Pro — malý tým
**Cena:** 1 190 Kč / měsíc | 11 900 Kč / rok

Pro koho: salón 2–8 lidí, fitness studio, fyzioterapie, malá klinika

Vše ze Starter, plus:
- Až 8 zaměstnanců (+ 149 Kč/měs za každého dalšího)
- Až 2 pobočky (+ 390 Kč/měs za každou další)
- SMS notifikace (200 SMS/měs, pak 0,90 Kč/SMS)
- Stripe platby předem + zálohy + dárkové poukazy
- Zákaznický portál (přihlášení, správa rezervací, storno dle pravidel)
- Skupinové lekce s kapacitou a waiting listem
- Slot holds (ochrana před double bookingem)
- Google Kalendář sync (obousměrný)
- Základní Rules Engine (storno a přesun pravidla)
- Hodnocení a recenze
- Základní balíčky (kreditní, časové)
- Faktury PDF
- Podpora: live chat (pracovní dny 9–17)

---

#### Business — rostoucí firma
**Cena:** 2 990 Kč / měsíc | 29 900 Kč / rok

Pro koho: síť salónů, wellness centrum, střední klinika, fitness řetězec

Vše z Pro, plus:
- Až 25 zaměstnanců (+ 119 Kč/měs za každého dalšího)
- Neomezené pobočky
- SMS neomezené
- Light HR modul — profily, certifikace, provize, výkonnostní reporting
- Plný Rules Engine — všechny typy pravidel + simulátor + podmíněná viditelnost
- Permanentky / série — kompletní modul se všemi scénáři
- Pokročilé balíčky — bundle, předplatné, B2B/firemní, podmíněné
- Approval requests — zákaznická žádost ke schválení adminem
- Zapier / Make integrace
- Zoom / Google Meet automatické linky
- Vlastní notifikační šablony (HTML editor)
- Marketplace listing (profil na našem marketplace)
- Konsolidovaný reporting přes pobočky
- Audit log (90 dní)
- API přístup (rate limit 5 000 req/min)
- Podpora: prioritní chat + onboarding call (1h zdarma)

---

#### Enterprise — sítě a franšízy
**Cena:** od 7 900 Kč / měsíc | individuální smlouva

Pro koho: franšízy, hotelové sítě, zdravotnické řetězce, korporátní wellness

Vše z Business, plus:
- Neomezení zaměstnanci
- White-label — vlastní doména, branding, e-mail odesílatele, login stránka
- Vlastní role s granulárními oprávněními
- SSO (SAML 2.0 / Azure AD / Google Workspace)
- Dedikovaný account manager
- SLA 99,9 % uptime (s finanční kompenzací)
- DPA — Data Processing Agreement
- Dedikovaná read replica (pro velké reportingové potřeby)
- Audit log neomezený
- Onboarding a školení na místě nebo online
- Fakturace (ne jen karta) — 30denní splatnost
- Prioritní podpora 24/7

---

### Add-ony

| Add-on | Cena | Kdy dává smysl |
|--------|------|---------------|
| Extra zaměstnanec | Starter: N/A, Pro: 149 Kč/os/měs, Business: 119 Kč/os/měs | Překročení limitu |
| Extra pobočka | Pro: 390 Kč/měs, Business: v ceně | Druhá lokace |
| SMS balíček | 290 Kč / 500 SMS | Nad inkludovaný počet |
| Marketplace boost | 490 Kč / měsíc | Placené zvýšení ranku v search |
| Pokročilá analytika | 590 Kč / měsíc | Revenue forecasting, cohort, benchmarking |
| AI asistent | 890 Kč / měsíc | Natural language booking (fáze 4) |
| Dedicated onboarding | 2 900 Kč jednorázově | Pro velkých zákazníky kteří chtějí pomoc |

---

### Srovnání s konkurencí

| | Free | Starter | Pro | Business | Enterprise |
|--|------|---------|-----|----------|-----------|
| Náš systém | 0 | 490 | 1 190 | 2 990 | 7 900+ |
| Reservio | 0 | 290 | 590 | 1 490 | N/A |
| SimplyBook.me | 0 | 220 | 560 | 1 400 | N/A |
| Fresha | 0 | 0 | 0 | 0 (provize!) | N/A |

**Proč jsme dražší než Reservio / SimplyBook:**
Permanentky, marketplace, Rules Engine, approval flow, Light HR, slot holds —
to konkurence nemá nebo jen částečně. Prodáváme komplexnější systém.

**Proč jsme lepší než Fresha "zdarma":**
Fresha bere provizi z každé rezervace (průměrně 2–3 %). Salón s 200 rezervacemi
po 800 Kč/měsíc = 160 000 Kč tržeb → Fresha bere 3 200–4 800 Kč/měsíc.
Vs. náš Pro plán za 1 190 Kč. Zákazník šetří 2 000–3 600 Kč/měsíc.

---

## PROUD 2 — Marketplace provize

### Model

Zákazník najde providera přes náš marketplace a rezervuje přímo tam.
Z každé takové rezervace bereme provizi.

```
Zákazník zaplatí 800 Kč za masáž
  → Provider dostane 672 Kč (84 %)
  → My dostaneme 128 Kč (16 %)

Stripe poplatek (~1,5 % + 5 Kč):
  → Odečteme od naší části
  → Provider dostane vždy 84 % čisté
```

### Provizní struktura

| Měsíční objem providera | Naše provize | Provider dostane |
|------------------------|--------------|-----------------|
| 0 – 50 000 Kč | 20 % | 80 % |
| 50 001 – 200 000 Kč | 16 % | 84 % |
| 200 001 – 500 000 Kč | 12 % | 88 % |
| 500 001 Kč+ | 8 % | 92 % |

**Tiered pricing motivuje providery k růstu objemu.**
Velký provider s 500k/měs vydělá víc a zároveň platí méně % —
oboustranně výhodné.

### Marketplace pro SaaS zákazníky

Tenanti na Business plánu a výše mohou být automaticky listováni
na marketplace bez příplatku (listing = v ceně).
Rezervace přes marketplace = provize navíc, ne místo SaaS.

**Klíčová otázka zákazníka:** "Platím vám dvakrát?"
**Odpověď:** Ne. Platíš SaaS za správu svého businessu.
Marketplace je bonus kanál kde tě najdou noví zákazníci.
Provizi platíš jen z nových zákazníků které by sis jinak nenašel.

---

## PROUD 3 — White-label licence

### Pro koho

Agentury, IT firmy a obchodní partneři kteří chtějí prodávat
rezervační systém pod vlastní značkou svým klientům.

### Model

```
Partner dostane:
  - Kompletní systém pod jejich brandingem
  - Vlastní doména, logo, barvy, login stránka
  - Partner dashboard (správa všech klientů na jednom místě)
  - Vlastní ceník (partner si nastaví marži)

Partner platí nám:
  - Licence fee: 4 900 Kč / měsíc (neomezený počet klientů)
  - Revenue share: 15 % z toho co klienti platí
    (partner inkasuje od klientů, nám odvede 15 %)

Partner vydělá:
  - Nastavuje vlastní ceny (typicky 2–3× naše velkoobchodní ceny)
  - Průměrný partner s 30 klienty na 1 500 Kč/měs:
    45 000 Kč příjmů - 4 900 licence - 6 750 revenue share = 33 350 Kč/měs marže
```

### Typy partnerů

**Reseller:** Prodává systém, stará se o sales, my děláme support.
**Agency:** Staví na našem systému, přidává vlastní služby (nastavení, školení).
**Technology:** Integruje náš systém do svého produktu přes API.

---

## Go-to-Market strategie

### Fáze 1 — Traction (M1–M12 od launche)

**Cíl:** 100 platících tenantů, MRR 120 000 Kč, NPS > 50

**Kdo jsou první zákazníci:**
Beauty & wellness (kadeřnictví, masáže) v Praze a Brně.
Proč: nejvyšší hustota podnikatelů, technologicky zdatní,
silná community, vysoký no-show problém (silná motivace).

**Jak je získáme:**

Týden 1–4: Osobní outreach
- Admin navštíví/zavolá 5 salónů denně osobně
- Demo 20 minut, onboarding 30 minut na místě
- Prvních 20 zákazníků: "Founding member" — Pro plán za cenu Starteru navždy
- Podmínka: souhlas s testimonialem a případovou studií

Měsíce 2–6: Community
- Facebook skupiny: "Kadeřníci ČR", "Masérky ČR" (desítky tisíc členů)
- Přidávání hodnoty, ne spam — odpovídat na otázky, psát užitečné posty
- Webinář: "Jak snížit no-show zákazníků o 40 %" (bezplatný)
- YouTube: screencasts "Nastavení za 10 minut" per vertikála

Měsíce 3–12: Referral engine
- Zákazník doporučí kolegyni → oba dostanou 2 měsíce Pro zdarma
- Tracking přes unikátní link v zákaznickém portálu
- Cíl: 30 % nových zákazníků přes referral do konce roku

**Čeho se vyvarovat:**
- Google Ads ve fázi 1 — příliš drahé bez product-market fit
- Přílišné přizpůsobování produktu prvním zákazníkům
- Zákazníci kteří chtějí "custom" funkce za standardní cenu

---

### Fáze 2 — Growth (M12–M24)

**Cíl:** 500 tenantů, MRR 700 000 Kč, marketplace spuštěn

**Kanály:**

SEO — obsahový marketing:
- Blog: "jak řídit kadeřnický salón", "jak snížit no-show", "permanentka pro zákazníky"
- Cíl: 10 000 organických návštěv/měsíc do M18
- Long-tail klíčová slova per vertikála

Google Ads — přesně cílené:
- "rezervační systém pro kadeřnice" (CPC ~25 Kč, konverze ~3 %)
- "online objednávky pro masáže" (CPC ~20 Kč)
- Budget: 30 000 Kč/měsíc, cíl CAC < 2 000 Kč

Partnerství:
- POS systémy: Dotykačka, Storyous — integrace + co-marketing
- Účetní software: Pohoda, Money S3 — doporučení, landing page
- Dodavatelé pro beauty: Wella, Schwarzkopf — sponzorství eventů

Marketplace launch (M15–M18):
- Cíl: 50 providerů na marketplace do M18
- Spustit v jednom městě (Praha) → validovat → expandovat
- PR: "Najděte kadeřníka v Praze online" — media outreach

---

### Fáze 3 — Scale (M24+)

**Cíl:** 2 000 tenantů, MRR 3 000 000 Kč, expanze SK a PL

**Expanze do SK:**
- Lokalizace: slovenština, EUR měna, slovenská DPH
- Partnership s local community (Facebook skupiny SK)
- 1 local sales osoba v Bratislavě

**Expanze do PL:**
- Polština, PLN, polská DPH
- Trh 5× větší než CZ — větší příležitost ale i konkurence

**Enterprise motion:**
- Outbound sales pro franšízy (5+ poboček)
- Konference: HoReCa, Beauty Forum, Fitness Industry
- Case studies od největších zákazníků

**White-label launch (M20):**
- Cíl: 10 agency partnerů do konce roku 3
- Partner portal pro správu klientů

---

## Partnerský program

### Referral (pro koncové zákazníky)

```
Zákazník doporučí → odkaz → nový zákazník se zaregistruje a zaplatí
  → Obě strany dostanou 2 měsíce Pro zdarma
  → Tracking: zákaznický portál → "Doporučit a vydělat"
  → Výplata: automaticky připsáno jako credit, ne peníze
```

### Reseller / Agency

```
Podmínky pro vstup:
  - Min. 5 aktivních klientů do 3 měsíců
  - Absolvování partner certifikace (online, 2h)
  - Podpis reseller smlouvy

Co dostane partner:
  - Licence fee: 4 900 Kč/měs (neomezení klienti)
  - 15 % revenue share z klientů které přivedl
  - Partner dashboard
  - White-label (volitelně +2 000 Kč/měs)
  - Prioritní technická podpora
  - Co-marketing materiály

Výstup pro nás:
  - Partner s 20 klienty = 20 tenantů bez CAC nákladu
  - Průměrný klient: 1 500 Kč/měs × 20 = 30 000 Kč MRR
  - Naše revenue: 30 000 × 85 % = 25 500 Kč MRR per partner
```

---

## Unit ekonomika

### CAC (Customer Acquisition Cost)

| Kanál | CAC | Podíl zákazníků |
|-------|-----|----------------|
| Referral | 300 Kč | 30 % |
| Organic / SEO | 800 Kč | 25 % |
| Google Ads | 2 000 Kč | 20 % |
| Osobní outreach | 1 500 Kč | 15 % |
| Partner / reseller | 0 Kč (platí partner) | 10 % |
| **Blended CAC** | **~900 Kč** | |

### LTV (Lifetime Value) per plán

| Plán | ARPU/měs | Průměrný churn | LTV |
|------|----------|----------------|-----|
| Starter | 490 Kč | 4 %/měs | 12 250 Kč |
| Pro | 1 350 Kč | 2,5 %/měs | 54 000 Kč |
| Business | 3 200 Kč | 1,5 %/měs | 213 000 Kč |
| Enterprise | 9 500 Kč | 0,8 %/měs | 1 187 500 Kč |

*LTV = ARPU / churn rate*

### LTV / CAC ratio

| Segment | LTV | CAC | Ratio |
|---------|-----|-----|-------|
| Starter | 12 250 Kč | 900 Kč | 13× |
| Pro | 54 000 Kč | 900 Kč | 60× |
| Business | 213 000 Kč | 1 500 Kč | 142× |

Cíl: ratio > 3× pro zdravý SaaS. Jsme výrazně nad.

### MRR projekce

| Měsíc | Tenanti | Blended ARPU | MRR | Marketplace MRR | Celkem MRR |
|-------|---------|-------------|-----|-----------------|-----------|
| M6 | 40 | 900 Kč | 36 000 Kč | 0 | 36 000 Kč |
| M12 | 100 | 1 100 Kč | 110 000 Kč | 0 | 110 000 Kč |
| M18 | 280 | 1 400 Kč | 392 000 Kč | 80 000 Kč | 472 000 Kč |
| M24 | 600 | 1 700 Kč | 1 020 000 Kč | 280 000 Kč | 1 300 000 Kč |
| M36 | 1 800 | 2 100 Kč | 3 780 000 Kč | 900 000 Kč | 4 680 000 Kč |

### Náklady

| Položka | M6 | M12 | M24 |
|---------|-----|-----|-----|
| Infrastruktura | 4 000 Kč | 6 000 Kč | 12 000 Kč |
| Stripe poplatky (~2 %) | 720 Kč | 2 200 Kč | 20 400 Kč |
| Postmark + Twilio | 2 000 Kč | 4 000 Kč | 10 000 Kč |
| Sentry + nástroje | 1 500 Kč | 2 000 Kč | 3 000 Kč |
| Marketing | 0 | 15 000 Kč | 50 000 Kč |
| **Celkem COGS** | **8 220 Kč** | **29 200 Kč** | **95 400 Kč** |
| **Gross margin** | **77 %** | **73 %** | **93 %** |

---

## KPIs — co měříme každý týden

### Akvizice
- Nové trial signupy / týden (cíl M6: 10/týden)
- Trial-to-paid konverzní rate (cíl: > 25 %)
- CAC per kanál (aktualizovat měsíčně)
- Time-to-first-booking (cíl: < 7 dní od registrace)

### Retence
- Měsíční churn rate per plán (cíl: < 2,5 % Pro, < 1,5 % Business)
- NPS (měřit každé 3 měsíce, cíl: > 50)
- Booking volume trend per tenant (klesá = at-risk)
- Feature adoption: % tenantů kteří použili permanentky, Rules Engine, balíčky

### Revenue
- MRR + MoM growth (cíl: > 15 % MoM v growth fázi)
- ARR (Annual Recurring Revenue)
- ARPU per plán (trend směrem nahoru = upsell funguje)
- Expansion MRR (upgrade ze Starter → Pro → Business)
- Marketplace GMV (Gross Merchandise Value)
- Marketplace take rate (% provize)

### Produkt
- p99 latence API (cíl: < 500ms)
- Onboarding completion rate (cíl: > 60 %)
- Support ticket rate (cíl: < 5 % tenantů / měsíc)
- Webhook failure rate (cíl: < 0.1 %)
