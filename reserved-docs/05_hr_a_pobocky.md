# 05 — Light HR modul & správa poboček

## Light HR modul

### Filosofie

HR modul není náhrada za Personio nebo Workday. Je to vrstva navíc k rezervačnímu systému, která odpovídá na otázky:
- Kdo může přijímat jaké rezervace?
- Kdy je dostupný?
- Jak výkonný je?
- Kolik mu za to náleží?

Tím se eliminuje potřeba propojovat rezervační systém s externím HR nástrojem pro 80 % use-cases.

---

### Zaměstnanecká karta

Každý zaměstnanec má profil s těmito sekcemi:

**Základní údaje**
- Jméno, foto, kontaktní e-mail a telefon
- Role (systémová nebo vlastní)
- Datum nástupu
- Pobočky, ke kterým je přiřazen

**Dovednosti & služby**
- Matice: ke kterým službám je zaměstnanec přiřazen (může je nabízet)
- Úroveň: junior / senior / specialista (volitelné, ovlivňuje cenu nebo popis)
- Certifikáty a poznámky (např. "certifikace Schwarzkopf")

**Pracovní podmínky**
- Typ úvazku: HPP, DPP, DPČ, OSVČ
- Hodinová sazba nebo měsíční mzda (pro výpočet provize)
- Interní poznámky (vidí jen owner a manager)

**Dokumenty**
- Upload smlouvy, certifikátů, fotografií k dokladu
- Upozornění na expiraci dokumentů (řidičák, certifikace)

---

### Pracovní doby a dostupnost

#### Standardní rozvrh
Každý zaměstnanec má per pobočka definovaný týdenní rozvrh:

```
Pondělí:   09:00–17:00
Úterý:     09:00–17:00 (přestávka 12:00–13:00)
Středa:    volno
Čtvrtek:   10:00–18:00
Pátek:     09:00–15:00
So/Ne:     volno
```

#### Výjimky a přepisy
- Jednorázová změna na konkrétní den (jiný čas nebo volno)
- Opakující se výjimka (každý první pátek v měsíci zkrácený provoz)

#### Žádosti o dovolenou
Zaměstnanec podá žádost o volno → manager dostane notifikaci → schválí nebo zamítne → po schválení se automaticky blokuje dostupnost a zákazníci nemohou na ten den rezervovat.

**Stavy žádosti:** draft → submitted → approved / rejected

Při schválení se:
1. Zablokují sloty v kalendáři pro daného zaměstnance
2. Existující rezervace dostanou příznak "nutno přeřadit"
3. Manager vidí seznam zasažených rezervací a může hromadně přeřadit

---

### Výkonnostní reporting

#### Dashboard zaměstnance (vidí manager a owner)

**Statistiky za zvolené období:**
- Počet dokončených rezervací
- Tržby přiřazené k danému zaměstnanci
- Průměrná hodnota rezervace
- No-show rate (kolik zákazníků nedorazilo)
- Průměrné hodnocení zákazníků
- Obsazenost (% dostupného času, který byl rezervován)

#### Provize a odměny

Konfigurovatelné schéma provizí:

```
Typ provize:
  - Procentuální ze služby: 15 % z každé dokončené rezervace
  - Fixní per rezervace: 50 Kč za každou
  - Mixované: základní + 10 % z obratu nad 20 000 Kč/měs
  - Per kategorie: 20 % z barvení, 10 % ze střihu

Výplata:
  - Automatický výpočet k definovanému dni
  - Export pro mzdy (CSV)
  - Přehled per zaměstnanec: co bylo fakturováno, co bylo zaplaceno
```

---

### Audit log aktivit

Systém loguje každou akci zaměstnance:

| Čas | Uživatel | Akce | Detail |
|-----|---------|------|--------|
| 10:23 | Jana K. | booking.cancelled | Rezervace #1234, zákazník Novák |
| 10:45 | Jana K. | booking.rescheduled | Rezervace #1235, nový čas 14:00 |
| 11:00 | Petr M. | booking.created | Nová rezervace #1240 pro zákazníka |

Log je neměnný (append-only), dostupný exportem do CSV.

---

## Správa poboček

### Model poboček

```
Tenant (firma)
  └── Branch A (Praha – centrum)
        ├── Users (zaměstnanci přiřazení k pobočce)
        ├── Services (lokální ceník nebo přepis globálního)
        ├── Resources (místnosti, přístroje)
        └── Settings (lokální přepisy pravidel a pracovní doby)
  └── Branch B (Praha – Žižkov)
  └── Branch C (Brno)
```

### Centrální vs. lokální nastavení

Owner definuje, které atributy jsou "zamčené" (globální) a které mohou pobočky přepisovat:

| Atribut | Centrální (zamčené) | Lokální (přepisovatelné) |
|---------|-------------------|-------------------------|
| Název značky | ✓ | — |
| Ceník | volitelně | volitelně |
| Pracovní doby | — | ✓ |
| Pravidla storna | ✓ | — |
| Barvy a branding | ✓ | — |
| Dostupnost zaměstnanců | — | ✓ |
| Notifikační šablony | volitelně | volitelně |

### Sdílení zaměstnanců mezi pobočkami

Jeden zaměstnanec může pracovat ve více pobočkách:

- Každá pobočka má pro daného zaměstnance vlastní pracovní dobu
- Systém hlídá, aby se časy nepřekrývaly — fyzicky nemůže být na dvou místech
- Kalendář zaměstnance zobrazuje rezervace ze všech poboček v jednom pohledu
- Zákazník si vybírá pobočku → systém nabídne dostupné zaměstnance v daném místě

### Zdroje (Resources)

Zdroje jsou entity, které jsou potřeba pro provedení služby vedle zaměstnance:

**Typy zdrojů:**
- Místnost (masážní box 1, box 2, střihací křeslo A)
- Přístroj (laser, solárium, kavitace)
- Vozidlo (servisní auto)

**Kombinovaná rezervace:**
Služba "Laserová epilace" vyžaduje:
- Zaměstnance s certifikací "laser"
- Místnost "Laserový box 1 nebo 2"

Systém zkontroluje dostupnost obojího a rezervuje oba zdroje simultánně. Zákazník vidí jen "volný termín" — alokace zdrojů je interní.

### Konsolidovaný reporting

Owner vidí přes všechny pobočky najednou:

- Celkové tržby (s rozpadem per pobočka)
- Obsazenost (% kapacity per pobočka)
- Srovnání výkonu poboček
- Top zákazníci napříč pobočkami
- Predikce vytížení na příští týden/měsíc

Filtry: pobočka, zaměstnanec, služba, zákazník, datum, kategorie.
