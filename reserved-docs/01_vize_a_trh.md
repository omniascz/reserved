# 01 — Vize a trh

## Vize produktu

Vytvořit rezervační SaaS platformu, která je dostatečně jednoduchá pro malý kadeřnický salón a zároveň dostatečně výkonná pro síť desítek poboček s týmem zaměstnanců, firemními klienty a komplexní pravidlovou logikou. Systém musí být plně obchodovatelný jako white-label řešení i pod vlastní značkou.

**Positioning statement:**  
*Pro poskytovatele služeb, kteří potřebují víc než jen online kalendář — inteligentní rezervační platforma, která řídí tým, pobočky, pravidla i vztahy se zákazníky na jednom místě.*

---

## Analýza trhu

### Velikost trhu

- Globální trh online rezervačních systémů: ~6,5 mld. USD (2024), očekávaný růst na ~17 mld. USD do 2030 (CAGR ~16 %)
- Střední a východní Evropa: silně rostoucí segment, nízká saturace lokálními hráči
- Klíčové vertikály: wellness & beauty, fitness, zdravotnictví, vzdělávání, poradenství, automotive servisy, veterináři

### Zákaznické segmenty

| Segment | Velikost firmy | Potřeby | Ochota platit |
|---------|---------------|---------|---------------|
| Solopodnikatelé | 1 osoba | Jednoduchost, nízká cena | Nízká (5–15 €/měs) |
| Malé firmy | 2–10 zaměstnanců | Online rezervace, notifikace, platby | Střední (20–60 €/měs) |
| Střední firmy | 10–50 zaměstnanců | HR, více poboček, reporting | Vysoká (60–200 €/měs) |
| Enterprise / sítě | 50+ zaměstnanců | API, white-label, SLA, integrace | Velmi vysoká (200–1000 €/měs) |
| B2B resellers | Agentury, franšízy | White-label, revenue share | Partnerský model |

---

## Konkurenční analýza

### Hlavní konkurenti

**Simplybook.me**
- Silná stránka: bohatý feature set, 100+ pluginů
- Slabá stránka: zastaralé UI, pomalý vývoj, složitá konfigurace
- Cena: $9,99–$59,99/měs

**Reservio**
- Silná stránka: lokální podpora v ČR/SK, jednoduchý onboarding
- Slabá stránka: omezené enterprise funkce, slabé API
- Cena: zdarma–39 €/měs

**Acuity Scheduling (Squarespace)**
- Silná stránka: silná integrace, design
- Slabá stránka: pouze angličtina, žádné multi-pobočka na nižších plánech
- Cena: $16–$49/měs

**Calendly**
- Silná stránka: B2B, sales use-case
- Slabá stránka: nevhodné pro service business (salóny, fitness, kliniky)
- Cena: $0–$16/uživatel/měs

**Shore, Treatwell, Fresha**
- Marketplace model — berou provizi z každé rezervace
- Nevýhoda: závislost platformy, sdílení zákazníků s konkurencí

### Naše diferenciace

1. **Rules Engine** — konfigurovatelná pravidlová logika bez nutnosti programovat. Žádný konkurent to nenabízí na self-service úrovni.
2. **Light HR vrstva** — zaměstnanecké profily, dostupnosti, provize, výkonnostní reporting v rámci rezervačního systému.
3. **Granulární oprávnění** — matice práv per role i per osobu. Nejen "admin / zaměstnanec".
4. **Balíčková flexibilita** — kredit / čas / bundle / předplatné × veřejný / interní / B2B / podmíněný — všechny kombinace.
5. **Klientská samoobsluha s pravidly** — zákazník smí jen to, co mu systém dovolí. Žádný konkurent nemá takto jemné nastavení.
6. **White-label ready** od začátku — vlastní doména, branding, případně i vlastní app.

---

## Cílové vertikály (prioritizace)

### Vlna 1 — Ideální first customers
- Kadeřnické a beauty salóny (2–15 zaměstnanců)
- Fitness studia, jóga, pilates
- Masážní a wellness centra

Proč: vysoká frekvence rezervací, no-show problém (silná potřeba pravidel), týmový provoz, zákazníci technologicky zdatní.

### Vlna 2 — Expanze
- Fyzioterapie, osteopatie, alternativní medicína
- Vzdělávací instituce (jazykové školy, kurzy)
- Automotive servisy

### Vlna 3 — Enterprise & B2B
- Franšízové sítě
- Firemní wellness programy (B2B2C)
- Healthtech integrace

---

## SWOT analýza

**Silné stránky**
- Flexibilní rules engine bez nutnosti kódu
- Moderní technický stack od základu
- Multi-tenant architektura připravená na white-label
- Lokální jazykové a daňové přizpůsobení

**Slabé stránky**
- Žádná existující zákaznická základna
- Vyšší složitost = delší onboarding pro jednoduché use-case
- Závislost na klíčových vývojářích v raných fázích

**Příležitosti**
- Velcí hráči stagnují (Simplybook, Reservio) — okno pro disrupci
- Rostoucí poptávka po "vše v jednom" řešeních místo stack nástrojů
- AI integrace jako differenciátor v krátké budoucnosti
- White-label pro agentury a SaaS resellers

**Hrozby**
- Vstup velkého hráče (Salesforce, HubSpot, Squarespace rozšíří portfolio)
- Cenová válka na low-end segmentu (Fresha zdarma s provizí)
- Regulace GDPR a platební PSD2 compliance náklady
