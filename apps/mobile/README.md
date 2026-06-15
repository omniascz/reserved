# Reserved — nativní mobilní app (Expo / React Native)

Klientská app: přihlášení do studia, moje rezervace, rozvrh lekcí + přihlášení,
profil + permanentky. Napojená na stávající Reserved API (portál + veřejné endpointy).

## Stav

- ✅ **Kód kompletní + typecheck zelený** (`pnpm --filter @reserved/mobile typecheck`).
- ✅ Závislosti se instalují (`pnpm install`).
- ⚠️ **Metro bundling v tomhle monorepu vyžaduje hoisted node_modules.** pnpm
  ukládá závislosti přes symlinky (`.pnpm/`), což Metro (bundler RN) nativně
  neumí procházet. React Native to řeší **hoisted linkerem**.

## Jak spustit / zabundlovat

React Native potřebuje ploché (hoisted) node_modules. Dvě varianty:

**A) Hoisted linker pro celé repo** (pozor: přelayoutuje node_modules všech appek
— po změně ověř, že ostatní appky stále buildí):

```
echo "node-linker=hoisted" >> .npmrc   # v kořeni repa
pnpm install
pnpm --filter @reserved/mobile start
```

**B) App ve vlastním checkoutu** (doporučeno pro mobilní vývoj) — zkopíruj
`apps/mobile` do samostatné složky mimo pnpm workspace, `npm install`, `npx expo start`.

## Ke spuštění na zařízení / do storu je potřeba (mimo kód)

- **Device/simulátor test** (Expo Go appka nebo dev build) — ověřit UX naživo.
- **Účty obchodů**: Apple App Store ($99/rok) + Google Play ($25 jednorázově).
- **EAS Build** (Expo) pro produkční buildy + odeslání do storů.

## Konfigurace

`app.json → expo.extra.apiUrl` = URL API (default `http://localhost:4000/api/v1`).
Pro produkci nastav na veřejnou doménu API.
