# 08 — Balíčky, Bundle & Cenotvorba

## Přehled typů balíčků

Systém podporuje čtyři základní typy balíčků, které lze libovolně kombinovat s nastavením viditelnosti, pravidly čerpání a cenovou strukturou.

---

## Typy balíčků

### 1. Kreditní balíček

Zákazník koupí předem definovaný počet "vstupů" (kreditů) za zvýhodněnou cenu. Každá rezervace odečte příslušný počet kreditů.

**Příklad:** 10 vstupů na střih za 3 500 Kč místo 4 500 Kč (sleva 22 %).

**Konfigurace:**
```jsonc
{
  "type": "credit",
  "credits_total": 10,
  "credits_per_booking": 1,        // 1 kredit = 1 rezervace
  "valid_days": 365,               // platný 1 rok od nákupu
  "valid_from_first_use": false,   // nebo: platnost od první rezervace
  "transferable": false,           // nelze přenést na jinou osobu
  "applicable_services": ["striz_damsky", "striz_pansky"],
  "applicable_branches": ["all"]
}
```

**Varianta:** Kreditní balíček s různou hodnotou kreditů per služba:
- Střih = 1 kredit
- Barvení = 2 kredity
- Styling = 0,5 kreditu

### 2. Časový balíček (Subscription bez automatického obnovení)

Zákazník má neomezený (nebo limitovaný) počet rezervací zvolené kategorie po dobu X.

**Příklad:** Neomezený přístup na skupinové lekce fitness po dobu 1 měsíce za 1 200 Kč.

**Konfigurace:**
```jsonc
{
  "type": "time",
  "duration_days": 30,
  "max_bookings_per_period": null,    // null = neomezeno, nebo číslo
  "max_bookings_per_day": 1,          // max 1 lekce denně
  "applicable_categories": ["skupinove_lekce"],
  "auto_renew": false
}
```

### 3. Bundle (svazek více služeb)

Zákazník koupí kombinaci konkrétních služeb v jedné transakci za balíčkovou cenu.

**Příklad:** "Relaxační balíček" = masáž 60 min + manikúra + zábal za 2 200 Kč (místo 2 800 Kč).

**Konfigurace:**
```jsonc
{
  "type": "bundle",
  "items": [
    { "service_id": "masaz_60", "quantity": 1 },
    { "service_id": "manikura", "quantity": 1 },
    { "service_id": "zabal", "quantity": 1 }
  ],
  "valid_days": 90,
  "all_at_once": false,              // false = lze čerpat postupně
  "same_visit_required": false
}
```

### 4. Předplatné (Subscription s automatickým obnovením)

Měsíční nebo roční platba, která se automaticky obnovuje. Zákazník má přístup k definovaným výhodám po celou dobu předplatného.

**Příklad:** VIP členství za 499 Kč/měsíc = 20 % sleva na všechny služby + prioritní přístup k termínům + 1 masáž zdarma měsíčně.

**Konfigurace:**
```jsonc
{
  "type": "subscription",
  "billing_interval": "monthly",      // "monthly" | "quarterly" | "yearly"
  "price": 49900,                     // v haléřích
  "trial_days": 14,
  "benefits": {
    "discount_percent": 20,
    "free_credits_per_period": 1,
    "priority_slots": true,
    "exclusive_services": ["masaz_vip"]
  },
  "cancellation_policy": "end_of_period",
  "auto_renew": true
}
```

---

## Viditelnost a dostupnost balíčků

Každý balíček má nastavení viditelnosti, které je nezávislé na jeho typu:

### Veřejný balíček
- Zobrazuje se v e-shopu nebo na rezervační stránce
- Dostupný pro přihlášeného i nepřihlášeného zákazníka
- Lze zakoupit bez asistence admina

### Interní (admin only)
- Nezobrazuje se zákazníkovi
- Pouze admin nebo manager ho přiřadí konkrétnímu zákazníkovi
- Použití: speciální ceny pro VIP, náhradní kredity za potíže, firemní smlouvy

### B2B / firemní balíček
- Nakoupí firma pro své zaměstnance hromadně
- Faktura místo okamžité platby kartou
- Kredity rozděleny mezi více uživatelů (firemní účet s sub-uživateli)
- Reporting pro firmu: kdo, kdy, co čerpal

### Podmíněný (Conditional)
- Viditelný jen zákazníkům splňujícím podmínku
- Příklady podmínek:
  - Má aktivní jiný balíček
  - Je přihlášen (ne jako host)
  - Má tag nebo je ve skupině
  - Absolvoval konkrétní službu alespoň 1×
  - Je zákazníkem déle než 6 měsíců

### Časově omezený (Flash sale)
- Dostupný jen od data X do data Y
- Nebo jen pro prvních N zákazníků
- Nebo jen ve specifické hodiny (ranní výprodej)

---

## Matice kombinací

| Typ | Veřejný | Interní | B2B | Podmíněný | Flash |
|-----|---------|---------|-----|-----------|-------|
| Kreditní | ✓ | ✓ | ✓ | ✓ | ✓ |
| Časový | ✓ | ✓ | ✓ | ✓ | ✓ |
| Bundle | ✓ | ✓ | ✓ | ✓ | ✓ |
| Předplatné | ✓ | ✓ | ✓ | ✓ | — |

Všechny kombinace jsou validní a systém je podporuje bez custom kódu.

---

## Pravidla čerpání balíčků

### Expirace
- Absolutní: platný do konkrétního data
- Relativní od nákupu: platný X dní od zakoupení
- Relativní od prvního použití: platný X dní od první rezervace
- Bez expirace (konfigurovatelné per balíček)

### Přenositelnost
- Zákazník smí sdílet kredity s jinou osobou (partner, rodina)
- Nebo přísně vázáno na zákazníka
- B2B varianta: vždy přenositelné mezi zaměstnanci firmy

### Omezení na pobočku / zaměstnance
- Balíček platí v jakékoli pobočce (default)
- Nebo jen ve vybraných pobočkách
- Nebo jen u konkrétního zaměstnance (prémiový terapeut)

### Kombinovatelnost
- Balíček + slevový kupón: povoleno / zakázáno (per balíček)
- Dva balíčky najednou: zákazník nemůže čerpat z obou na jednu rezervaci
- Priority: pokud zákazník má kredit i předplatné, který se použije?

### Automatická detekce a čerpání
Při rezervaci zákazníka s aktivním balíčkem:
1. Systém detekuje relevantní balíčky (aplikovatelné na danou službu)
2. Pokud je více balíčků, zobrazí zákazníkovi výběr nebo použije dle priority
3. Kredit se odečte až po dokončení rezervace (ne při vytvoření)
4. Při storno: kredit se vrátí dle konfigurace (vždy / jen v čas / nikdy)

---

## E-shop balíčků

Zákazník si kupuje balíčky přes:

**Integrovaný e-shop** (součást rezervační stránky):
- Seznam veřejných balíčků s popisem, cenou, výhodami
- Košík a platba (Stripe)
- Po úhradě: okamžitý přístup ke kreditům v portálu

**Embed na vlastní web:**
- Widget s balíčky vložitelný jako iframe nebo JS component
- Přizpůsobitelný design

**Manuální přiřazení adminem:**
- Admin otevře profil zákazníka → "Přiřadit balíček"
- Vybere balíček (i interní), nastaví platnost
- Nemusí proběhnout platba (pro věrnostní kredity, náhrady)

---

## Dárkové poukazy

Dárkový poukaz je speciální varianta balíčku:

- Pevná hodnota (500 Kč k uplatnění na cokoliv)
- Nebo konkrétní služba / balíček
- Generuje unikátní kód (např. `GIFT-X7K2-P9QA`)
- Zákazník kód zadá při platbě v rezervačním formuláři
- Sledování: vydáno, uplatněno, zbývající hodnota, expirováno
- Prodej přes e-shop nebo manuálně adminem

---

## Reporting balíčků

Admin vidí:
- Přehled prodaných balíčků: počet, tržby, průměrná hodnota
- Aktivní balíčky: kolik zákazníků má aktivní co
- Čerpání: kolik kreditů bylo spotřebováno vs. zbývá
- Expirující: kdo má balíček expirující do 30 dní (pro retenci)
- Nevyčerpané kredity (liability): celková hodnota nevyčerpaných kreditů v systému
