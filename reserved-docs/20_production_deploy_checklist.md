# Produkční checklist

Závazný seznam kroků před prvním nasazením Reserved a před každým větším
vydáním.

> **Poznámka k revizi (2026-09-14):** předchozí verze tohohle dokumentu
> **neodpovídala kódu** — uváděla jiné názvy proměnných, jiný port, vyžadovala
> Redis, který se nepoužívá, a odkazovala na endpointy, které neexistují.
> Kdo by se jí řídil, nasadil by nefunkční aplikaci. Tahle verze je sjednocená
> se skutečným stavem repozitáře; u každé položky je uvedený soubor, ze kterého
> to plyne, aby šlo tvrzení ověřit, a ne jen věřit.

---

## 0. Co ještě není rozhodnuté

- [ ] **Doména** — `reserved.cz` patří podle rejstříku CZ.NIC firmě LPP Czech
      Republic, s.r.o. (řetězec Reserved), registrovaná od roku 2005. Není
      k dispozici. Je potřeba vybrat jinou.
- [ ] **Hosting** — doporučení: běžný linuxový server + Cloudflare + spravovaná
      databáze. Repozitář je na to připravený a **na poskytovateli nezávisí**
      (`docker-compose.prod.yml`, `apps/api/Dockerfile`, `apps/workers/Dockerfile`,
      `docker/Dockerfile.next`).

Doména se nikam nezapisuje natvrdo — nastavuje se jedinou proměnnou
`BASE_DOMAIN` (viz `.env.production.example`).

---

## 1. Databáze

- [ ] PostgreSQL **16** (vyvíjeno a testováno proti `postgres:16-alpine`)
- [ ] Denní zálohy + obnovení do bodu v čase
- [ ] **Dvě různá připojení** (`.env.production.example`):
  - `DATABASE_URL` — vlastník schématu: migrace a seed
  - `DATABASE_APP_URL` — běžící aplikace, role `app_user`
- [ ] ⚠️ **Bez `DATABASE_APP_URL` běží API jako vlastník databáze a izolace mezi
      zákazníky se NEUPLATNÍ** (`apps/api/src/db/db.config.ts`). Není to
      volitelná optimalizace.
- [ ] `APP_USER_PASSWORD` nastavené — **bez něj migrace skončí chybou**
      (`packages/db/src/migrate.ts`). Musí se shodovat s heslem uvnitř
      `DATABASE_APP_URL`.
- [ ] Migrace: `pnpm db:migrate` (87 migrací)
- [ ] Seed ceníku platformy: `pnpm db:seed`
- [ ] Master admin: `PLATFORM_ADMIN_EMAIL` + `PLATFORM_ADMIN_PASSWORD` a
      `pnpm --filter @reserved/db exec tsx src/seed-platform-admin.ts`
      (běžný seed ho **záměrně nevytváří**)
- [ ] **Šifrování přístupů k branám** — po migraci spustit jednorázově:
      `pnpm --filter @reserved/db db:encrypt-payments`

**Redis se nepoužívá.** Fronty jsou tabulky v PostgreSQL a pollery v
`apps/workers`. Žádný `REDIS_URL` v kódu neexistuje.

---

## 2. Proměnné prostředí

Úplný seznam s vysvětlením je v `.env.example` (vývoj) a
`.env.production.example` (produkce). Tady jen to, co se **nejčastěji plete**:

| Správně | Špatně (bylo v minulé verzi) |
|---|---|
| `API_PORT=4010` | ~~4000~~ |
| `EMAIL_FROM` | ~~SMTP_FROM~~ |
| `BULKGATE_APP_ID` / `BULKGATE_APP_TOKEN` | ~~BULKGATE_APPLICATION_ID/TOKEN~~ |
| `S3_*` (šest proměnných) | ~~R2_*~~ |
| `JWT_ACCESS_TTL_SECONDS` | ~~JWT_ACCESS_EXPIRES_IN~~ |
| `DATABASE_URL` + `DATABASE_APP_URL` | ~~DATABASE_ADMIN_URL~~ |
| `STRIPE_PLATFORM_WEBHOOK_SECRET` | ~~STRIPE_WEBHOOK_SECRET~~ |

Povinné (bez nich aplikace **nenastartuje**):

- [ ] `DATABASE_URL` (`apps/api/src/db/db.config.ts`)
- [ ] `JWT_SECRET`, min. 32 znaků (`apps/api/src/auth/auth.config.ts`)
- [ ] `PAYMENT_CONFIG_KEY`, přesně 32 bajtů (`apps/api/src/payments/payments.config.ts`)
- [ ] `NODE_ENV=production` — ⚠️ **při jiné hodnotě má API otevřený CORS,
      veřejnou dokumentaci API a vypnuté HSTS** (`apps/api/src/main.ts`)

- [ ] ⚠️ **Hodnoty `NEXT_PUBLIC_*` se zapékají do buildu**, ne do běhu
      (`apps/*/next.config.mjs`). Musí být předané jako build argumenty —
      jinak hotové aplikace volají `localhost`. Změna domény = **přestavět
      obrazy**, ne jen restartovat.
- [ ] `NEXT_PUBLIC_DEV_LOGIN_*` v produkci **prázdné** (jinak se admin sám
      přihlašuje jako demo tenant)
- [ ] Tajemství přes správce hesel, `.env` mimo git

**Šestnáct tajemství k uložení:** `JWT_SECRET`, `PAYMENT_CONFIG_KEY`,
`DATABASE_URL`, `DATABASE_APP_URL`, `APP_USER_PASSWORD`, `SMTP_PASS`,
`STRIPE_SECRET_KEY`, `STRIPE_PLATFORM_SECRET_KEY`,
`STRIPE_PLATFORM_WEBHOOK_SECRET`, `STRIPE_CONNECT_CLIENT_ID`,
`GOOGLE_CLIENT_SECRET`, `GOOGLE_STATE_SECRET`, `S3_ACCESS_KEY`,
`S3_SECRET_KEY`, `BULKGATE_APP_TOKEN`, `PLATFORM_ADMIN_PASSWORD`.

⚠️ **`PAYMENT_CONFIG_KEY` zálohovat odděleně od databáze.** Při jeho ztrátě se
uložené přístupy k platebním branám už nedešifrují a provozovatelé je musí
zadat znovu.

---

## 3. DNS a certifikáty

Vše se odvozuje od `BASE_DOMAIN`:

- [ ] `A`/`AAAA` na server pro: holou doménu, `www`, `api`, `app`, `portal`,
      `widget`, `master`
- [ ] **Zástupný záznam `*.<doména>`** pro subdomény zákazníků
- [ ] Certifikáty: řeší reverzní proxy automaticky (`docker/Caddyfile`)
- [ ] ⚠️ **Zástupný certifikát vyžaduje ověření přes DNS**, ne přes HTTP.
      Potřebuje obraz proxy s modulem pro konkrétního poskytovatele DNS —
      dokud není, nechej blok `*.<doména>` zakomentovaný.
- [ ] SPF, DKIM a DMARC pro odesílání e-mailů
- [ ] HSTS — zapíná se samo při `NODE_ENV=production` (`apps/api/src/main.ts`)

**Vlastní domény zákazníků** (`rezervace.jejich-salon.cz`):

- [ ] Zákazník nastaví `CNAME` na `RESERVED_CNAME_TARGET` a ověřovací `TXT`
      na `_reserved-verification.<doména>` (`apps/api/src/custom-domains/`)
- [ ] ⚠️ **Vydávání certifikátů pro cizí domény není v repozitáři vyřešené** —
      existuje jen ověření vlastnictví. Je potřeba buď Cloudflare for SaaS
      (100 domén v ceně, další 0,10 USD/měsíc), nebo proxy, která si certifikát
      vyžádá sama.
- [ ] V kódu je natvrdo seznam vyloučených přípon (`reserved.cz`,
      `reserved.com`) — **při jiné doméně platformy upravit**
      (`apps/api/src/custom-domains/custom-domains.service.ts`)

---

## 4. Bezpečnost

- [ ] `NODE_ENV=production` (viz výše — nejdůležitější jediná položka)
- [ ] CORS omezený na `APP_URL`
- [ ] Helmet — **hotovo** (`apps/api/src/main.ts`)
- [ ] Omezovač požadavků — **hotovo**, 300/min běžné API, 20/min citlivé cesty
      (`apps/api/src/app.module.ts`, `apps/api/src/auth/auth.controller.ts`)
- [ ] Zamykání účtu po 10 neúspěšných přihlášeních — **hotovo**
      (`apps/api/src/auth/account-lockout.service.ts`)
- [ ] Šifrování přístupů k platebním branám — **hotovo**
      (`packages/utils/src/crypto.ts`), po nasazení ověřit, že v databázi
      nezůstala čitelná konfigurace
- [ ] Role `app_user` bez práv měnit schéma — ověřit heslo z `APP_USER_PASSWORD`
- [ ] Ověřování podpisu webhooků plateb

---

## 5. Odesílání pošty a SMS

- [ ] SMTP: `SMTP_HOST`, `SMTP_PORT`, `SMTP_USER`, `SMTP_PASS`, `EMAIL_FROM`
      **v API i ve workers** (obě služby posílají samostatně)
- [ ] ⚠️ Výchozí hodnoty míří na vývojový Mailhog (`localhost:1026`) — bez
      nastavení neodejde **jediný e-mail**
- [ ] Zkušební e-mail dorazil mimo spam
- [ ] SMS (volitelné): při `SMS_PROVIDER=bulkgate` jsou `BULKGATE_APP_ID`
      i `BULKGATE_APP_TOKEN` povinné, jinak **workers spadnou při startu**
      (`apps/workers/src/providers/sms/index.ts`)

---

## 6. Úložiště souborů

- [ ] Všech šest `S3_*` proměnných, nebo žádná
- [ ] ⚠️ Bez nich se obrázky ukládají na disk kontejneru a **při každém
      nasazení zmizí** (`apps/api/src/uploads/uploads.service.ts`)

---

## 7. Platební brány

- [ ] Přístupy se nastavují **per tenant v administraci**, ne přes proměnné
- [ ] V administraci mají formulář: hotovost, terminál, QR platba, Stripe,
      GoPay, **Comgate**
- [ ] ThePay, PayU a GP webpay formulář zatím nemají — nastaví se voláním API
- [ ] ⚠️ U ThePay, PayU a GP webpay je **podepisování neověřené proti sandboxu**
      (poznámka přímo v kódu poskytovatelů)
- [ ] Webhook u brány nasměrovat na
      `https://api.<doména>/api/v1/payments/webhooks/<slug-tenanta>/<brána>`
- [ ] Stripe pro předplatné: `https://api.<doména>/api/v1/platform/webhooks/stripe-billing`

---

## 8. Workers

- [ ] Běží jako **samostatný kontejner** (`docker-compose.prod.yml`)
- [ ] Politika restartu `unless-stopped`
- [ ] Pět pollerů: notifikace (5 s), sloty (30 s), narozeniny (1 h), expirace
      permanentek (1 h), připomínky ověření (1 h), úklid přihlášení (1 den)

---

## 9. Sledování provozu

- [ ] Sentry pro API i všech šest aplikací (volitelné, ale doporučené)
- [ ] Dostupnost: `https://api.<doména>/api/v1/health` (živost) a
      `/api/v1/health/ready` (připravenost — vrací 503 při nedostupné databázi)
- [ ] Upozornění při výpadku

---

## 10. Vlastní nasazení

```bash
cp .env.production.example .env     # a vyplnit
docker compose -f docker-compose.prod.yml --profile nastroje run --rm migrace
docker compose -f docker-compose.prod.yml up -d --build
```

- [ ] Migrace proběhly
- [ ] Převod šifrování přístupů k branám proběhl
- [ ] `health` i `health/ready` odpovídají
- [ ] Ruční zkouška: registrace → služba → veřejná rezervace
- [ ] Zkusit obnovu ze zálohy (dřív, než bude potřeba doopravdy)

---

## Co v repozitáři zatím chybí

Přiznané mezery, ne opomenutí:

1. **Vydávání certifikátů pro vlastní domény zákazníků** (existuje jen ověření
   vlastnictví přes DNS).
2. **Automatické nasazení** — žádný workflow, který by nasazoval. Nasazuje se
   ručně příkazy výše.
3. **Podepisování u ThePay, PayU a GP webpay** neověřené proti sandboxu.
4. **ESLint** není nastavený a v CI se nespouští.
