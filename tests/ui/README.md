# @reserved/ui-tests — testy obrazovek v prohlížeči (Playwright)

Kliká po admin rozhraní a widgetu jako člověk: přihlásí se, vyplní formuláře,
zmáčkne tlačítka a ověří, co se na obrazovce stalo. Navíc u **každého** testu
hlídá, že se v konzoli prohlížeče neobjevila chyba a že žádný požadavek
nevrátil 4xx/5xx.

Headless Chromium, jeden worker (testy sdílejí jednu dev databázi).

## Co musí běžet

Testy si servery **nespouštějí samy** — schválně, ať je vidět, co přesně chybí:

| Co        | Port | Jak spustit                          |
| --------- | ---- | ------------------------------------ |
| Postgres  | 5433 | `docker compose up -d postgres`      |
| API       | 4010 | `pnpm --filter @reserved/api dev`    |
| Admin web | 4002 | viz níže (pozor na auto-login)       |
| Widget    | 4004 | `pnpm --filter @reserved/widget dev` |

### Pozor: dev auto-login

`apps/web` má komponentu `DevAutoLogin`, která se v dev režimu sama přihlásí
jako tenant **`demo`**, pokud jsou v `apps/web/.env.local` vyplněné
`NEXT_PUBLIC_DEV_LOGIN_EMAIL` a `_PASSWORD`. Testy ale jedou nad tenantem
**`fitness`**. Web proto pro testy spouštěj s vypnutým auto-loginem:

```bash
cd apps/web
NEXT_PUBLIC_DEV_LOGIN_EMAIL= NEXT_PUBLIC_DEV_LOGIN_PASSWORD= pnpm dev
```

## Spuštění

Z kořene repa:

```bash
pnpm test:ui              # všechny testy
pnpm test:ui:report       # otevře HTML report z posledního běhu
```

Jen jeden soubor nebo jeden test:

```bash
pnpm --filter @reserved/ui-tests ui src/passes.spec.ts
pnpm --filter @reserved/ui-tests ui -g "check-in"
pnpm --filter @reserved/ui-tests ui:headed   # s viditelným oknem prohlížeče
```

**Do CI to zatím nepatří.** Balíček proto záměrně nemá script `test` — kdyby ho
měl, `turbo run test` by ho v CI spustil.

## Kam se ukládají snímky

- `tests/ui/screenshots/` — snímky pořízené testy (`shot(page, 'nazev')`),
  číslované v pořadí toku
- `tests/ui/test-results/` — artefakty selhání (snímek + trace)
- `tests/ui/playwright-report/` — HTML report

Vše je v `.gitignore`.

## Testovací data

Jedou nad seedem tenanta `fitness` (`admin@fitness.local` / `fitness123`):

- **Nikola Králová** — kreditová permanentka s platností do 30. 8. 2026, v DB
  uložená jako `active` → obrazovka musí ukázat **Propadlá** (test hlídá právě
  tenhle rozdíl uložený vs. spočítaný stav)
- **Klára Veselá** — aktivní 7/10, na ní se testuje pozastavení (test si po sobě
  uklidí a vrátí ji do aktivního stavu)
- **Radek Pokorný** — už pozastavená, slouží filtru podle stavu
- **Zuzana Marková** — časový balíček, slouží filtru podle typu

Po `pnpm db:seed` se id mění, proto testy nikde nemají natvrdo zapsané UUID —
na detail permanentky se proklikávají ze seznamu.
