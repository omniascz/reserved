# Reserved — engineering konvence

> Tento dokument je single source of truth pro Claude Code asistenta a tebe.
> Pravidla NEMĚNIT bez vědomé diskuze. Když se nějakému pravidlu vyhneš, vysvětli proč v PR.

---

## Stack (pevně rozhodnuto)

- **Runtime:** Node.js ≥ 22, TypeScript 5.7, ESM only
- **Backend:** NestJS 10 (REST, prefix `/api/v1`) — žádné WebSockety
- **Frontend:** Next.js 14 (App Router) — 6 apps: `web` (admin), `portal` (zákazník), `widget` (embed),
  `master` (provozovatel platformy), `marketing` (veřejný web), `tenant-site` (mini-web tenanta);
  mobilní app `apps/mobile` (Expo / React Native)
- **DB:** PostgreSQL 16 + Drizzle ORM (žádná Prisma), migrace přes drizzle journal (`pnpm db:migrate`)
- **Fronty/joby:** tabulky v Postgresu + pollery v `apps/workers` — **žádný Redis ani BullMQ**
- **Monorepo:** pnpm workspaces + Turborepo
- **Validace:** Zod na všech HTTP request handlerech (strict)
- **Testy:** Vitest — unit, DB-integrační (DB `reserved_test`) a full-stack E2E proti běžícímu API
  (`tests/e2e`). Žádný Playwright.

## Schéma a migrace

**Zdroj pravdy o struktuře DB jsou SQL migrace** (`packages/db/drizzle/*.sql`), ne `schema/*.ts`.
Drizzle schéma a jeho snapshot popisují jen tu část, kterou drizzle umí vyjádřit.

`schema/*.ts` + baseline snapshot (`drizzle/meta/0084_snapshot.json`) obsahují sloupce, cizí klíče,
CHECK omezení, unikátní i částečné indexy. **Snapshot NEobsahuje:**

- **9 indexů patřících k EXCLUDE omezením** (`bookings_no_overlap`, `slot_holds_no_overlap`,
  `class_sessions_employee_no_overlap`, `class_sessions_resource_no_overlap`,
  `booking_resources_no_overlap`, `stays_no_overlap`, `logistics_jobs_vehicle_no_overlap`,
  `logistics_jobs_driver_no_overlap`, `table_reservation_tables_no_overlap`)
- **9 EXCLUDE omezení** samotných — ochrana proti dvojí rezervaci na úrovni DB
  (v migracích je 10 příkazů `EXCLUDE USING`, protože `bookings_no_overlap` migrace 0050 zahodí
  a vytvoří znovu jako částečný)
- **95 RLS politik** + `ENABLE/FORCE ROW LEVEL SECURITY` — izolace tenantů
- **SQL funkce `app.current_role_or_null()` a `app.current_tenant_id_or_null()`**, na kterých RLS stojí
- granty pro roli `app_user`

⚠️ **Tyhle věci žijí JEN v SQL migracích. Když někdo vygeneruje schéma podle snapshotu (např.
`drizzle-kit push` nebo „přegenerování od nuly"), tiše zmizí** — DB pak vypadá funkčně, ale
přijde o ochranu proti dvojí rezervaci i o izolaci tenantů. Nové takové objekty proto vždy
přidávej ruční SQL migrací.

**Unikátní částečné indexy vynucují byznys pravidla a nesmí zmizet:**

| Index                                    | Pravidlo                                        |
| ---------------------------------------- | ----------------------------------------------- |
| `bookings_session_customer_uniq`         | klient se do jedné lekce nepřihlásí dvakrát     |
| `bookings_session_spot_uniq`             | jedno místo v sále může mít jen jeden klient    |
| `class_session_waitlist_uniq`            | jeden e-mail je v pořadníku lekce nejvýš jednou |
| `reviews_booking_uniq`                   | jedna recenze na rezervaci                      |
| `loyalty_transactions_earn_booking_uniq` | body za rezervaci se připíšou jen jednou        |

Provozní pravidla:

- `drizzle-kit generate` musí hlásit **„No schema changes"**. Když něco vygeneruje, rozešlo se
  `schema/*.ts` se snapshotem — zkontroluj to, než cokoli commitneš.
- Nová migrace = SQL soubor + záznam v `drizzle/meta/_journal.json` (jinak ji `db:migrate` nespustí).
  ⚠️ **87 cizích klíčů má názvy vygenerované Postgresem (`*_fkey`), ne drizzle konvenci**
  (`*_tenant_id_tenants_id_fk`). Vznikly tím, že migrace zapisují `REFERENCES` přímo u sloupce.
  **Definice jsou správné** — odkazy, `ON DELETE` i cílové tabulky sedí; liší se jen jména.

Drizzle o těch jmenech neví, takže vygenerovaná migrace nad těmito tabulkami může chtít cizí
klíče **zahodit a vytvořit znovu pod jiným jménem**. Takové přejmenování je zbytečné, při běhu
drží zámky a u velkých tabulek může znamenat odstávku.

**Nikdy nespouštěj vygenerovanou migraci bez přečtení SQL.** Když obsahuje `DROP CONSTRAINT`
nebo `ADD CONSTRAINT` u cizího klíče, který se věcně nemění, příslušné příkazy z migrace smaž
(nebo FK pojmenuj ve `schema/*.ts` přes `foreignKey({ name: '…' })` tak, aby odpovídal DB).

## Lokální porty

API 4010 · master 4001 · web 4002 · portal 4003 · widget 4004 · marketing 4005 · tenant-site 4006 ·
Postgres 5433 (DB `reserved_dev` + `reserved_test`) · Mailhog SMTP 1026 / UI 8026

### PAST: `pnpm dev` po ukončení nechává běžet potomka

Ukončení `pnpm dev` (Ctrl+C, TaskStop, i kill systému při nedostatku paměti) zabije jen wrapper —
podřízený `tsx watch` (API) nebo `next dev` (frontendy) **běží dál**, drží port a drží paměť.
Projeví se to dvěma způsoby, které svádějí na špatnou stopu: nový start spadne na obsazeném portu,
nebo port naopak odpovídá, přestože „server neběží".

**Před spuštěním stacku vždy zkontroluj a zabij osiřelé procesy:**

```powershell
# co drží porty Reserved
Get-CimInstance Win32_Process -Filter "Name='node.exe'" |
  Where-Object { $_.CommandLine -like "*Code\reserved*" } |
  Select-Object ProcessId, @{n='MB';e={[math]::Round($_.WorkingSetSize/1MB)}}, CommandLine

# zabít je
Get-CimInstance Win32_Process -Filter "Name='node.exe'" |
  Where-Object { $_.CommandLine -like "*Code\reserved*" } |
  ForEach-Object { Stop-Process -Id $_.ProcessId -Force }
```

Reálný dopad (2026-09-13): šest osiřelých procesů drželo 407 MB a systém při 0,8 GB volné paměti
odstřelil všechny tři dev servery. Po úklidu byly volné 2 GB. Celý stack potřebuje ~1,2 GB
(Postgres + Mailhog 59 MB, API ~60 MB, každý Next dev server ~360–460 MB), takže **frontendy
pouštěj po jednom** — admin testy potřebují jen web (4002), widget test jen widget (4004).

### PAST: `Date` jako parametr syrového SQL shodí dotaz

Do syrového SQL — tedy do šablony `sql` předané metodě `tx.execute`, i do šablony volané přímo
na klientovi postgres-js — se **objekt `Date` předat nesmí**. Ovladač ho neumí serializovat
a dotaz spadne na:

```
TypeError: The "string" argument must be of type string or an instance of Buffer or ArrayBuffer.
Received an instance of Date
```

Zrádné je, že **typovaný dotazovač drizzle (`.update().set({ sentAt: new Date() })`) `Date` zvládá**
— past sklapne jen u syrového SQL, takže jedna část kódu funguje a druhá ne.

**Správně:** poslat ISO text s výslovným přetypováním.

```ts
const platiDo = new Date(Date.now() + 24 * 3600_000).toISOString();
await tx.execute(
  sql`INSERT INTO email_verifications (expires_at) VALUES (${platiDo}::timestamptz)`,
);
```

Kde to jde, počítej čas rovnou v SQL (`now() - interval '48 hours'`) a parametr vůbec neposílej.

Reálný dopad (2026-09-13): worker připomínek by v produkci spadl při **každém** běhu, kdy měl komu
poslat e-mail — odhalil to až jeho první test. Stejná chyba pak podruhé v přípravě dat testu
expirace.

### PAST: vícestupňový Docker obraz v pnpm workspace

Dvě léčky, obě shodily build a obě vypadaly jako chyba jinde:

**1. `COPY packages packages` v build kroku přepíše `node_modules`.**
Když se závislosti instalují v předchozí vrstvě a pak se přes složku zkopírují
zdrojáky, instalace se ztratí. Balíčky přijdou o `tsc` a build spadne na
`MODULE_NOT_FOUND` — což svádí hledat chybu v TypeScriptu, ne v pořadí kopií.
**Kopíruj jen zdrojové podsložky** (`packages/x/src`, `tsconfig.json`), ne celé
složky balíčků.

**2. Produkční instalace spustí kořenový `prepare`.**
`pnpm install --prod` zavolá `prepare: husky`, jenže husky je vývojová
závislost a v produkčním režimu není → `husky: not found`. Řešení:
`--ignore-scripts`. Nativní balíčky (argon2) to nerozbije, protože mají
předkompilované binárky pro `linux-x64` i `linux-arm64`.

**A hlavně: obraz, který se vyrobí, ještě nemusí nastartovat.** Po sestavení
vždy kontejner spusť a ověř `/api/v1/health`. Samotné `exit code: 0` u buildu
nic neříká o běhu.

Reálný dopad (2026-09-14): tři neúspěšné pokusy o sestavení obrazu API, z toho
jeden hlášený jako úspěšný.

### PAST: roura spolkne návratový kód — platí VŠUDE, nejen u buildu

`prikaz | tail -5` vrátí návratový kód **roury**, ne příkazu. V řetězu s `&&`
tím propadne i selhání: `gh pr checks 58 | tail -5 && gh pr merge 58` sloučí PR
i tehdy, když kontroly hlásí `fail`.

**Pravidlo: příkaz, na jehož výsledku něco závisí, se NIKDY nepouští rourou.**
Buď bez roury, nebo si výsledek ulož (`vystup=$(prikaz); kod=$?`) a rozhoduj se
podle uloženého kódu.

Reálný dopad (2026-09-14): PR #58 byl sloučen do `main` přes dvě červené
kontroly a `main` zůstal rozbitý. Pravidlo „neslučovat PR s červeným CI"
přitom bylo zapsané — selhal jeho VÝKON, ne jeho znění.

### PAST: YAML přečte samé číslice jako číslo

V GitHub Actions je `KLIC: 1111111111111111111111111111111111111111111111111111111111111111`
(64 jedniček) **číslo**, ne text. Do prostředí se předá jako `1.11111111111111E+63`,
tedy 14 znaků místo 64. Aplikace pak spadne na kontrole délky klíče a vypadá to
jako vada aplikace, ne konfigurace.

**Pravidlo: tajemství a klíče v YAML vždy do uvozovek** a pokud možno volit
hodnotu s písmeny, aby se jako číslo nedala přečíst ani omylem. Totéž platí pro
verze (`node: 22.10` je číslo `22.1`) a pro hodnoty `yes`/`no`/`on`/`off`.

Reálný dopad (2026-09-14): obě kontroly na `main` (CI i E2E Smoke) padaly na
`PAYMENT_CONFIG_KEY musí být 32 bajtů … dostal jsem 14 B`; API vůbec
nenastartovalo.

### PAST: vzorec v `.dockerignore` sedne i na zdrojovou složku

`**/uploads` mělo vyloučit soubory nahrané uživateli. Sedlo ale i na
`apps/api/src/uploads`, tedy na zdrojový modul. Stavba spadla na:

```
src/app.module.ts:72:31 - error TS2307: Cannot find module './uploads/uploads.module.js'
```

Chyba se tváří jako vada kódu — modul „zmizel", přestože v repozitáři je.
V obrazu ale nikdy nebyl, protože ho odfiltroval `.dockerignore`.

**Pravidlo: vzorce s `**/`piš co nejužší** a po každé změně`.dockerignore`ověř, na co všechno sedí:`find apps packages -type d -name <jméno> -not -path "_/node_modules/_"`.
Vyluč konkrétní cestu (`apps/api/uploads`), ne každou složku toho jména.

Bez `.dockerignore` se ale neobejdeš: kontext stavby byl 3,17 GB a po jeho
zavedení 6,53 MB — a bez něj se do linuxového obrazu kopírovaly `node_modules`
nainstalované na Windows (i soubory `.env` s hesly).

### PAST: obalový skript vrátí 0, i když příkaz uvnitř spadl

Sourozenec pasti s rourou. Když se příkaz spustí uvnitř skriptu, který na konci
ještě něco vypisuje, vrací se návratový kód TOHO SKRIPTU. Hlášení „úloha
skončila s kódem 0" pak znamená jen to, že doběhl obal — ne že uspěla stavba.

**Pravidlo: návratový kód si ulož hned za příkazem (`KOD=$?`) a VYPIŠ ho.**
Dokud ho nevidíš vypsaný, o výsledku nic nevíš — a netvrď, že něco prošlo.

Reálný dopad (2026-09-14): stavba obrazů spadla (`navratovy kod: 1`,
`target api: failed to solve`), obal vrátil 0 a já to ohlásil jako úspěch.
Musel jsem to vzápětí odvolat.

### PAST: stavba všech obrazů naráz shodí démona Dockeru

`docker compose build` staví služby SOUBĚŽNĚ. U téhle sestavy to znamená osm
obrazů naráz, z toho šest Next aplikací, a každá si uvnitř instaluje závislosti
a překládá.

Rozhodující není paměť celého počítače, ale **přidělení virtuálního stroje
Dockeru** — zjistí se přes `docker info --format "{{.MemTotal}}"`. Tady to bylo
**5,8 GB**, navíc sdílených s devíti kontejnery jiných projektů. Osm souběžných
překladů se do toho nevešlo a démona to zabilo uprostřed práce:

```
request returned 500 Internal Server Error ... /_ping
```

Vypadá to jako porucha Dockeru nebo jako chyba ve stavbě — ve skutečnosti je to
vyčerpaná paměť. Poznávací znamení: `docker image ls` najednou nic nevypíše
a chybí i obrazy, které předtím existovaly. Démon se pak sám zotaví, takže při
pozdějším ověřování už všechno vypadá v pořádku.

**Pravidlo: stavěj po jedné službě** a u každé si vypiš návratový kód:

```bash
for S in api workers web portal widget master marketing tenant-site; do
  docker compose ... build "$S"; KOD=$?
  echo "$S -> $KOD"; [ "$KOD" -ne 0 ] && break
done
```

Platí to i pro nasazení: na malém serveru dopadne souběžná stavba stejně. Proto
se obrazy mají stavět jinde (v CI) a na server jen stahovat, ne stavět na něm.

### PAST: společný Dockerfile kopíruje složku, kterou má jen část aplikací

`docker/Dockerfile.next` staví všech šest Next aplikací z jednoho předpisu.
Kopíroval bezpodmínečně `public`, jenže tu mají jen **portál** (`icon.svg`,
`sw.js`) a **widget** (`embed.js`). U zbylých čtyř stavba spadla:

```
COPY --from=build /app/apps/web/public → "/app/apps/web/public": not found
```

Proč se to neprojevilo dřív: žádná Next aplikace se do té doby nepostavila až
do konce — dřívější pokusy padaly nebo se rušily ještě před běhovou vrstvou.
Vada v produkčním předpisu tak ležela nepovšimnutá a projevila by se až při
prvním ostrém nasazení.

**Pravidlo: u sdíleného předpisu ověř každý bezpodmínečný `COPY` proti VŠEM
aplikacím, ne jen proti té, na které zrovna zkoušíš.** Chybějící volitelnou
složku řeš `RUN mkdir -p` v build vrstvě — ne tím, že kopírování zvolníš.
Volitelné kopírování by totiž tiše prošlo i tehdy, kdyby se ztratil `embed.js`,
a widget by přestal fungovat na cizích stránkách, aniž by to cokoli ohlásilo.

### PAST: zaostalá lokální testovací databáze vypadá jako vada kódu

`reserved_test` na vývojovém stroji se NEMIGRUJE sama. Když někdo přidá migraci,
CI je v pořádku (staví databázi od nuly), ale lokální sada začne padat způsobem,
který svádí hledat chybu v aplikaci:

```
insert or update on table "payment_connections" violates foreign key constraint
AssertionError: expected 4 to be 6
relation "login_attempts" does not exist
```

Jen to třetí hlášení říká pravdu. První dvě jsou následek — databáze byla o jednu
migraci pozadu (86 místo 87, 96 tabulek místo 97).

**Pravidlo: při nečekaném pádu lokální sady NEJDŘÍV porovnej schéma**, teprve
potom čti kód:

```bash
psql ... -tAc "SELECT count(*) FROM drizzle.__drizzle_migrations"
DATABASE_URL=...reserved_test APP_USER_PASSWORD=... pnpm --filter @reserved/db db:migrate
```

Druhá půlka téže pasti: `pnpm turbo run test` bez `DATABASE_URL` skončí na
`Error: DATABASE_URL is not set` a vitest to ohlásí jako „3 failed / no tests“ —
tedy jako by testy spadly, přestože se vůbec nenačetly. V CI se proměnná nastavuje
na úrovni jobu, lokálně ji musíš vyexportovat sám.

### PAST: `nest build` překládá i testovací soubory

Typová chyba v souboru pod `__tests__` neshodí jen testy — **shodí stavbu celého
API**, protože `nest build` překládá celý `src` včetně testů:

```
src/cors/__tests__/nacitac-domen.db.test.ts:48:17 - error TS2532: Object is possibly 'undefined'
```

Nejčastější případ je indexovaný přístup (`radky[0].id`), protože projekt má
zapnuté `noUncheckedIndexedAccess`. **Ošetři to výslovně** (`const r = radky[0];
if (!r) throw …`), ne vykřičníkem — ten kontrolu jen umlčí.

Důsledek pro pořadí práce: po napsání testu spusť `pnpm turbo run typecheck`
dřív, než se pustíš do stavby obrazu nebo do spouštění API. Jinak se typová
chyba v testu projeví až jako nepovedená stavba a hledá se na špatném místě.

### PAST: vyčerpaný limit pokusů se hlásí pod cizím jménem

Omezovač na `/auth/register` a `/auth/login` má **jeden společný rozpočet**
(klíčuje se podle IP a cesty, okno 60 s) a sdílí ho VŠECHNO, co na stroj sahá:
obě testovací sady i ruční proklikávání. Dvě registrace přes formulář udělané
rukou tedy stačí, aby sada, která běží hned po nich, spadla.

Nejhorší na tom je, pod jakými jmény se to projeví:

```
✗ /settings/theme se načte bez chyby hydratace      → Test timeout (čekání na 429 při loginu)
✗ tenant fitness po seedu NEUKAZUJE 0 z 6           → „na stránce je: (bez počtu)“ (nepřihlásil se)
✗ neověřený účet: pruh se zobrazí…                  → „registrace musí projít“ (429)
```

Ani jeden z těch testů neměřil to, co má v názvu. Kdo se řídí názvem, opravuje
tři neexistující vady — hydrataci, onboarding a ověřování e-mailu.

**Pravidlo: po ručních registracích nebo přihlášeních nech uplynout aspoň 90 s,
než pustíš sadu.** A když sada spadne na časovém limitu nebo na „nepřihlásil se“,
NEJDŘÍV počkej a pusť ji znovu samotnou — teprve pak čti kód.

Reálný dopad (2026-09-14): 3 spadlé testy z 24 a 6 z 217. Po vyčkání 90 s
prošlo **24/24 (23,7 s)** a **217/217** beze změny jediného řádku kódu.

### PAST: souběh vitest + Playwright shodí testy „chybou aplikace"

Když běží obě sady současně (nebo vedle nich `docker build`, který překládá celé
monorepo), prohlížeč v Playwrightu dostane od systému méně prostředků a spojení
mu padají. V logu to vypadá jako vada aplikace:

```
Failed to load resource: net::ERR_NETWORK_IO_SUSPENDED
TimeoutError: page.waitForResponse: Timeout 20000ms exceeded
Error: write CONNECT_TIMEOUT localhost:5434
```

Ani jedno není chyba kódu — je to vyhladovění stroje. Stejně se projevuje
u vitestu: test omezovače požadavků posílá 23 požadavků po síti a při zátěži
přeteče výchozí pětisekundový strop, takže spadne **na čas**, ne na tvrzení.

**Pravidlo: sady pouštěj po jedné.** A když test padne na časovém limitu nebo
na síťové chybě prohlížeče, NEJDŘÍV ho pusť samostatně — teprve pak ho
prohlašuj za rozbitý.

Reálný dopad (2026-09-14): dvě falešná selhání, každé stálo desítky minut
hledání neexistující chyby.

### PAST: test, který měří kalendář místo aplikace

Widgetový test měl v sobě `const DATE = '2026-09-15'` a komentář „dnes (neděle)
je zavřeno". V neděli procházel, v pondělí spadl — pondělí je podle pracovní
doby otevřené — a po 15. 9. by se rozbil úplně (počet kroků vyjde záporně).

**Pravidlo: co test potřebuje o datech vědět, ať si zjistí z dat.** Seed zakládá
pracovní dobu podle ISO dne v týdnu (pondělí–pátek), takže stačí přečíst
`employee_working_hours` a otevřený i zavřený den z toho spočítat. Datum napsané
natvrdo je v testu časovaná nálož s datem výbuchu.

### PAST: test, který prochází naprázdno

Kontrola typu „po výmazu nezůstal e-mail ve frontě notifikací" projde i tehdy, když v té frontě
**nikdy nic nebylo**. Zelená, která nic neměří, je nebezpečnější než červená — vypadá jako důkaz
a přitom kryje nefunkční kód.

**Pravidlo: u každého tvrzení „X už tam není" musí test nejdřív zařídit, aby tam X bylo** — a
ideálně k němu přidat protikontrolu, že jiný záznam na témže místě zůstal (jen změněný).

```ts
// špatně: projde i s úplně rozbitou anonymizací
expect(pocetRadkuSPuvodnimEmailem).toBe(0);

// správně: řádek existuje, jen je anonymizovaný
expect(anonymizovane.length).toBeGreaterThanOrEqual(1);
expect(anonymizovane[0].body).toContain('obsah smazán');
```

Reálný dopad (2026-09-13): GDPR test „původní e-mail nezůstal ve frontě notifikací" procházel,
protože veřejné přihlášení na lekci zákazníkovi žádný e-mail nezakládá. Anonymizace notifikací
tak nebyla ověřená vůbec.

## Železná pravidla

### Peníze

- **Halíře jako INTEGER**, nikdy float, nikdy `parseFloat`. 1 Kč = 100 haléřů.
- Pokud uvidíš `parseFloat(amount)` → bug. Použij `parseInt(amount, 10)`.
- DPH se počítá v **basis points** (21 % = 2100), ne v procentech přímo.

### SQL

- **Drizzle parametrizované dotazy** — žádný string concat, žádný template literal s daty.
- Když potřebuješ raw SQL, použij Drizzle `sql` helper (`sql` from `drizzle-orm`), ne `db.execute(stringConcat)`.
- **EXCLUDE constraint** na overlapping bookings — DB-úrovni double-book ochrana.

### Tenant izolace

- **VŽDY** přes `withTenantContext(db, ctx, fn)` z `@reserved/rls-multitenancy`.
- **Žádné lokální noop stuby** — viz V6 z review ticketarium/tixly. Pokud najdeš stub, nahraď.
- Defensive layer: i tak přidej `AND tenant_id = $N` do mutating queries.

### Validace vstupu

- **Zod schema** pro každý route handler s `await request.json()`.
- Šablona: `const Schema = z.object({...}); const data = Schema.parse(await req.json());`
- ESLint pravidlo: `no-unvalidated-json` (přidáme — ESLint zatím v repu není nakonfigurovaný).

### Naming

- Soubory: kebab-case (`booking-availability.service.ts`)
- TS identifikátory: camelCase pro funkce/proměnné, PascalCase pro typy/třídy
- DB sloupce: snake_case (`tenant_id`, `created_at`, `price_hellers`)
- Drizzle column aliases v `RETURNING`: `"tenantId"` (kebab → camel mapping)

### Money columns

- Vše s cenou končí na `_hellers` (CZK) nebo `_cents` (EUR/USD)
- Měna jako separátní sloupec (`currency CHAR(3)`), nikdy hardcoded `'CZK'`

### Error handling

- Custom error třídy per modul (`SlotError`, `BeautyError`, `BillingError`)
- Error code je enum string: `'SLOT_FULL' | 'HOLD_EXPIRED' | ...`
- `try/catch` jen tam, kde děláš kompenzační akci. `catch {}` = zakázáno.

### Time

- Vše v UTC v DB (`TIMESTAMPTZ`)
- Konverze na local time v UI vrstvě, ne v API
- `Date` v TS, nikdy `dayjs`/`moment`/`luxon` v core domain (jen v UI)

### Testy

- **Min. 1 test soubor per modul** ihned po napsání
- Race conditions, money math, tenant boundaries → integration testy
- Mock DB jen pro pure logic, jinak Postgres v Docker testovací DB

**PAST: omezovač požadavků počítá i testy.** Od nasazení globálního `AppThrottlerGuard`
platí limity i na testovací běhy — všechny jedou z jedné IP (localhost) a klíčuje se
podle IP + cesty. Citlivé cesty: **přihlášení 20/min**, znovuodeslání ověřovacího
e-mailu 20/min, **registrace 20/min**; běžné API 300/min. Sada dnes dělá
**12 volání `/auth/register`** a **~14 přihlášení** za běh (Playwright se přihlašuje
skoro v každém testu, `hydratace.spec.ts` generuje testy cyklem). Když přibudou další
testy, limit se vyčerpá a spadne ten soubor, který běží abecedně poslední — a s ním
kaskádou testy, které staví na jeho tenantovi. Příznak: `429 TOO_MANY_REQUESTS`.
Řešení je zvýšit `CITLIVY_LIMIT` / `REGISTRACE_LIMIT` v `auth.controller.ts`.

**Proč zrovna 20 a ne 5:** limit dopadá na VŠECHNA volání, ne jen neúspěšná. Odlišit je
nejde — `ThrottlerGuard.handleRequest()` zvyšuje počítadlo v `canActivate`, tedy PŘED
spuštěním handleru, kdy výsledek ještě neexistuje. Nižší hodnota by trestala legitimní
provoz (přihlášení na počítači, pak na mobilu, zavřená karta, návrat).

**ZAPSANÝ DLUH: rate limit NENÍ plnohodnotná ochrana proti hádání hesel.** Tou je až
zamykání účtu po N neúspěšných pokusech — projekt ho nemá, `users` nemá počítadlo
pokusů ani `locked_until` a nikde se neúspěšná přihlášení neevidují.

**PAST: e2e testy musí mít TUTÉŽ databázi jako běžící API.** Skripty v `packages/db`
(`db:migrate`, `db:seed`) ani e2e testy si `.env` nenačítají — `DATABASE_URL` berou čistě
z prostředí procesu (v CI ji dodává workflow). Lokálně ji tedy musíš předat sám:

```bash
export $(grep -E '^DATABASE_URL=' apps/api/.env | xargs)
pnpm db:migrate && pnpm db:seed
pnpm turbo run test
```

Bez ní spadne rovnou `DATABASE_URL is not set`. **Horší je předat ji špatně:** e2e testy si
tenanta zakládají přes HTTP (`/auth/register`), tedy v DB běžícího API, ale některé věci
(magic-link token) zapisují přímo SQL spojením. Když každá půlka míří jinam, tenant vznikne
v jedné DB a odkaz na něj ve druhé → `violates foreign key constraint
"customer_magic_links_tenant_id_tenants_id_fk"`. Vypadá to jako regrese v kódu, ale je to
jen rozpojená databáze.

Playwright testy obrazovek (`tests/ui`) jedou samostatně přes `pnpm test:ui` a do `turbo run test`
**se schválně nechytají** — balíček nemá script `test`.

### Commits

- Conventional commits: `feat:`, `fix:`, `chore:`, `refactor:`, `test:`, `docs:`
- Každý commit funkční (CI green) — žádné WIP commity v `main`

**PRAVIDLO: NIKDY neslučovat PR s červeným CI.** Kontrola musí merge **podmiňovat**,
ne ho jen předcházet výpisem. Stalo se (PR #53): skript stav kontrol vypsal, viděl
`ci: failure` a přesto pokračoval — main pak zůstal červený. Správně:

```bash
CI=$(gh api "repos/omniascz/reserved/commits/<sha>/check-runs" \
      --jq '.check_runs[] | select(.name=="ci") | .conclusion' | head -1)
if [ "$CI" != "success" ]; then echo "STOP: CI není zelené"; exit 1; fi
gh pr merge <cislo> --merge
```

Totéž platí pro `e2e-smoke`. Po merge vždy ověřit CI i na `main` — merge commit je
jiný commit než hlava PR a může dopadnout jinak.

⚠️ **Příkaz, který merge podmiňuje, NIKDY nepouštěj rourou.** `gh pr checks N | tail -5`
vrátí kód roury, ne kontroly, takže `&& gh pr merge` proběhne i přes červené CI —
viz „PAST: roura spolkne návratový kód" výše. Stalo se podruhé u PR #58 (2026-09-14),
i když samotné pravidlo už zapsané bylo. Znění pravidla nestačí; musí ho vynutit tvar
příkazu.

- Pre-commit hook: format (prettier přes lint-staged) + typecheck + gitleaks (pokud je nainstalovaný);
  commit-msg: commitlint (header max. 100 znaků)

### Bezpečnost

- `.env*` v `.gitignore`, secrets v GitHub Secrets / Vercel env
- Pre-commit `gitleaks` scan
- `process.env.X` čteno jen v `config/` modulech, ne rozesetě po kódu
- Validace env při startu (Zod schema pro `process.env`)

---

## Struktura

```
reserved/
├── apps/
│   ├── api/          NestJS API (REST)
│   ├── web/          Admin panel (Next.js)
│   ├── portal/       Customer portal (Next.js, PWA)
│   ├── widget/       Embed booking widget (Next.js) + public/embed.js
│   ├── master/       Admin provozovatele platformy (Next.js)
│   ├── marketing/    Veřejný web (Next.js, CS/EN)
│   ├── tenant-site/  Mini-web tenanta (Next.js)
│   ├── mobile/       Klientská mobilní app (Expo)
│   └── workers/      Pollery nad Postgresem (notifikace, slot holdy, narozeniny)
├── packages/
│   ├── db/           Drizzle schema + migrations + seed
│   ├── rls-multitenancy/ Tenant kontext (RLS)
│   ├── types/        Shared DTOs, enums, branded types
│   ├── ui/           (zatím prázdný)
│   ├── rules-engine/ Rules evaluator
│   └── utils/        Shared helpers
├── tests/e2e/        Full-stack E2E testy proti běžícímu API
├── docker-compose.dev.yml  Postgres 16 (5433) + Mailhog
├── turbo.json
├── pnpm-workspace.yaml
└── tsconfig.base.json
```

## Extrakce z ticketarium / tixly

Když přenášíš modul z `ticketarium` nebo `tixly`:

1. **Code review řádek po řádku** před commitem
2. **Komentář na začátku souboru:** `// Adapted from tixly/<module>@<commit-sha> on YYYY-MM-DD`
3. **Adaptace:** Next.js `route.ts` → NestJS controller (mechanický překlad logiky služby)
4. **Schema check:** každá tabulka, kterou modul používá, musí být v `packages/db/schema/`
5. **withTenantContext audit:** žádné noop stuby, vše přes `@reserved/rls-multitenancy`
6. **Zod audit:** každý JSON request handler má Zod schema
7. **Test minimum:** ≥1 test soubor per přenesený modul, race conditions explicit

## Roadmap status

Aktuální fáze viz `reserved-docs/10_roadmap.md` (cílový blueprint).
Sprint trackováno přes GitHub Projects nebo TaskCreate.
