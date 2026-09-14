# Změna domény a názvu produktu

„Reserved" je pracovní název a `reserved.cz` pracovní doména. Až přijdou
skutečné, **nemá se sahat do kódu** — mění se hodnoty proměnných a přestavují
obrazy. Tenhle dokument je návod, co přesně udělat a co ověřit.

> **Proč to není jen „najít a nahradit":** část adres se **zapéká do obrazů**
> při sestavení (Next.js). Kdo změní jen proměnné na serveru a obrazy
> nepřestaví, bude mít web, který v prohlížeči pořád volá starou doménu — a na
> první pohled to vypadá, že se změna neprojevila.

---

## 1. Co se kde nastavuje

Všechno se odvozuje ze **dvou proměnných**:

| proměnná       | co určuje                              | výchozí hodnota |
| -------------- | -------------------------------------- | --------------- |
| `BASE_DOMAIN`  | doména platformy                       | `reserved.cz`   |
| `PRODUCT_NAME` | název produktu v textech pro zákazníka | `Reserved`      |

Z nich se skládají všechny ostatní adresy (`api.<doména>`, `app.<doména>`,
`portal.<doména>`, `widget.<doména>`, `master.<doména>`, holá doména pro
marketing) — viz `docker-compose.prod.yml`.

Frontendy potřebují tytéž hodnoty ještě jednou, s předponou `NEXT_PUBLIC_`,
protože Next zapéká do prohlížeče jen ty:

```
NEXT_PUBLIC_BASE_DOMAIN=<nová doména>
NEXT_PUBLIC_PRODUCT_NAME=<nový název>
```

---

## 2. Postup, až doména přijde

### Krok 1 — DNS u registrátora nové domény

| záznam            | typ      | kam ukazuje | k čemu                           |
| ----------------- | -------- | ----------- | -------------------------------- |
| `<doména>`        | A / AAAA | IP serveru  | marketingový web                 |
| `www.<doména>`    | A / AAAA | IP serveru  | přesměrování na web              |
| `api.<doména>`    | A / AAAA | IP serveru  | API                              |
| `app.<doména>`    | A / AAAA | IP serveru  | administrace provozovatele       |
| `portal.<doména>` | A / AAAA | IP serveru  | zákaznický portál                |
| `widget.<doména>` | A / AAAA | IP serveru  | rezervační widget                |
| `master.<doména>` | A / AAAA | IP serveru  | administrace platformy           |
| `*.<doména>`      | A / AAAA | IP serveru  | **subdomény tenantů**            |
| `cname.<doména>`  | A / AAAA | IP serveru  | cíl pro vlastní domény zákazníků |

⚠️ **Zástupný záznam `*.<doména>` je povinný**, jinak tenantům nepojedou jejich
subdomény (`salon-jany.<doména>`).

⚠️ **Certifikát pro zástupnou doménu vydá Let's Encrypt jen proti ověření přes
DNS.** Standardní obraz Caddy to neumí — potřebuje obraz s modulem pro
konkrétního poskytovatele DNS a token v konfiguraci. Dokud to není hotové,
nechej v `docker/Caddyfile` blok `*.{$BASE_DOMAIN}` zakomentovaný; vyjmenované
subdomény fungují i bez toho.

### Krok 2 — proměnné na serveru

V `.env` (podle `.env.production.example`):

```bash
BASE_DOMAIN=<nová doména>
PRODUCT_NAME=<nový název>
NEXT_PUBLIC_BASE_DOMAIN=<nová doména>
NEXT_PUBLIC_PRODUCT_NAME=<nový název>
ACME_EMAIL=<e-mail pro certifikáty>
EMAIL_FROM=noreply@<nová doména>
```

### Krok 3 — PŘESTAVĚT OBRAZY (nestačí restart!)

```bash
docker compose -f docker-compose.prod.yml build \
  web portal widget master marketing tenant-site
docker compose -f docker-compose.prod.yml up -d
```

**Proč:** adresy a název produktu se u frontendů zapékají při sestavení.
Restart bez přestavby je nechá staré.

API a workers naopak čtou proměnné za běhu — těm restart stačí.

⚠️ **Obrazy stav na serveru nestav.** Souběžná stavba šesti aplikací potřebuje
víc paměti, než malý server má; staví se v CI a na server se jen stahují.
Když to jinak nejde, stav je **po jedné**.

### Krok 4 — vlastní domény zákazníků

Zákazníci, kteří mají vlastní doménu, mají u sebe v DNS `CNAME` na starý cíl.
Po změně:

1. `RESERVED_CNAME_TARGET` se odvodí z nové domény automaticky;
2. **starý cíl musí nějakou dobu fungovat dál**, než si zákazníci přesměrují
   CNAME — jinak jim rezervace spadnou ze dne na den;
3. zákazníkům je potřeba dát vědět a dát jim lhůtu.

Ověřené domény jsou v databázi (`tenants.custom_domain`) a načítají se za běhu,
takže **není potřeba nic přepisovat ani restartovat kvůli nim**.

---

## 3. Co ověřit po změně

```bash
# 1. API odpovídá na nové doméně
curl -s -o /dev/null -w "%{http_code}\n" https://api.<doména>/api/v1/health     # 200

# 2. Dokumentace API je v produkci skrytá
curl -s -o /dev/null -w "%{http_code}\n" https://api.<doména>/api-docs          # 404

# 3. Prohlížeč smí volat API ze VŠECH aplikací (ne jen z administrace)
for O in app portal widget master; do
  curl -s -D - -o /dev/null -H "Origin: https://$O.<doména>" \
    https://api.<doména>/api/v1/health | grep -i access-control-allow-origin
done
# u každé musí vrátit TU ADRESU, ze které se ptáš

# 4. Cizí web NESMÍ projít
curl -s -D - -o /dev/null -H "Origin: https://cizi.example.com" \
  https://api.<doména>/api/v1/health | grep -i access-control-allow-origin
# nesmí vrátit nic
```

Dál ručně:

- [ ] **Subdoména tenanta** — `https://<slug>.<doména>` otevře mini-web tenanta.
- [ ] **Vlastní doména zákazníka** — po přesměrování CNAME dál funguje rezervace.
- [ ] **Registrace** — u pole s adresou se ukazuje nová doména, ne stará.
- [ ] **E-mail** — registrovat zkušební účet a zkontrolovat, že odkaz v ověřovacím
      e-mailu vede na novou doménu a podpis nese nový název produktu.
- [ ] **Widget** — vložit na cizí stránku podle návodu a ověřit, že se načte.
- [ ] **Patičky a titulky** — marketing, administrace, portál, mini-web tenanta.

---

## 4. Co se ZÁMĚRNĚ nemění

Tohle vypadá jako název produktu, ale měnit se to nesmí — nebo jen s vlastním
rozhodnutím a vlastní migrací:

| co                                                                          | proč zůstává                                                                                                                                                                                                 |
| --------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| hlavičky webhooků `X-Reserved-*`, `User-Agent: Reserved-Webhook/1.0`        | **veřejný kontrakt.** Zákazníci na ně mají navázané integrace; přejmenování je rozbije.                                                                                                                      |
| vydavatel přihlašovacích tokenů (`reserved`, `reserved-api`)                | vnitřní protokol. Změna **odhlásí všechny** najednou.                                                                                                                                                        |
| předpona API klíčů `rsk_`                                                   | kontrakt, klíče už jsou u zákazníků.                                                                                                                                                                         |
| identifikátor mobilní aplikace `cz.reserved.app`                            | identita v obchodech s aplikacemi. Změna = nová aplikace, ne aktualizace.                                                                                                                                    |
| názvy balíčků `@reserved/*`, role `app_user`, databázové identifikátory     | vnitřní, zákazník je nikdy neuvidí.                                                                                                                                                                          |
| WordPress plugin (`wordpress-plugin/`)                                      | má vlastní výchozí adresu widgetu ve svém kódu. Po změně domény vyžaduje **nové vydání pluginu**, ne jen proměnnou.                                                                                          |
| typ zprávy `reserved:resize` a `window.__reservedEmbedResize*` v `embed.js` | dorozumívací protokol mezi vloženým skriptem a rámem widgetu. Na cizích webech zůstane viset **stará verze skriptu**, která musí umět mluvit s novým widgetem; přejmenování rozbije dopočítávání výšky rámu. |
| předpona `[Reserved]` v hlášeních `embed.js` do konzole                     | vidí ji jen vývojář cizího webu při ladění, ne zákazník.                                                                                                                                                     |

---

## 5. Známá omezení (nevyřeší se proměnnou)

### `embed.js` na cizích webech

`apps/widget/public/embed.js` je **statický soubor** — neprochází sestavením
Next.js, takže se do něj žádná proměnná nezapeče. To samo o sobě nevadí; potíž
je jinde:

Zákazníci mají na svých stránkách nalepený řádek
`<script src="https://widget.<stará doména>/embed.js" …>`. **Ten odkaz za ně
nikdo nepřepíše.** Proto:

- stará doména musí obsluhovat `embed.js` **stejně dlouho jako CNAME** z kroku 4
  (viz výše) — jinak zákazníkům zmizí rezervační formulář z jejich webu;
- zákazníkům je potřeba poslat nový řádek k vložení a dát jim lhůtu;
- dokud starou doménu držíte, **musí vracet funkční skript**, ne přesměrování na
  novou — některé weby mají zakázané načítání skriptů z cizí domény.

### Stránky oborů v marketingu mají texty natvrdo

Stránka `apps/marketing/src/app/[locale]/pro/[vertikala]/page.tsx` nemá texty
v překladech, ale přímo v kódu, a to česky — obsah všech oborů je v konstantě
`CONTENT` a stránka nepoužívá žádný překladový háček. Anglická jazyková verze
je proto **nezobrazí anglicky**. Se změnou domény to nesouvisí a tenhle dokument to neřeší — je to
samostatná práce na jazykových verzích. Zmíněno tu jen proto, aby se na to při
přejmenování nezapomnělo: až se bude měnit název produktu, tyhle texty ho
neobsahují, takže se změní správně, ale zůstanou česky.

---

## 6. Kontrola, že se stará doména nevrátí

V repozitáři běží test, který hlídá, že se natvrdo zapsaná doména nevrátí do
kódu (`packages/utils/src/__tests__/bez-natvrdo-domeny.test.ts`). Když někdo
napíše doménu přímo do zdrojáku, test spadne a řekne kam.

Výjimky (dokumentace, testovací přípravky, komentáře) jsou v testu vyjmenované.
Když přibude legitimní výjimka, doplní se tam — **nezruší se test**.
