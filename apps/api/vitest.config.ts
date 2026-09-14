import { defineConfig } from 'vitest/config';

// Testy v `apps/api` běží PO JEDNOM, ne souběžně.
//
// ── PROČ ────────────────────────────────────────────────────────────────────
// Velká část zdejších testů není jednotková: volají ŽIVÉ API na portu 4010
// a zakládají si data ve sdílené databázi. Ve výchozím nastavení pouští vitest
// testovací soubory souběžně, takže si navzájem šlapou po dvou sdílených
// zdrojích:
//
//   1. JEDEN ROZPOČET OMEZOVAČE. Registrace i přihlášení mají limit 5 pokusů
//      za minutu klíčovaný podle IP a cesty. Tři soubory, které si v přípravě
//      registrují vlastního tenanta, ho vyčerpají a další registrace dostane
//      429. Test pak nemá tenanta a padá o několik kroků dál.
//
//   2. JEDNA DATABÁZE. Souběžné soubory si míchají data a pořadí.
//
// ── PROČ TO STOJÍ ZA SAMOSTATNOU KONFIGURACI ────────────────────────────────
// Ty pády se totiž NEHLÁSÍ tam, kde vznikly. Reálný případ (2026-09-14):
//
//   ✗ „/settings/theme se načte bez chyby hydratace"  → ve skutečnosti čekání na 429
//   ✗ „tenant fitness po seedu NEUKAZUJE 0 z 6"       → ve skutečnosti se nepřihlásil
//   ✗ „registrace vystaví ověřovací token"            → ve skutečnosti 429
//
// Kdo se řídí názvem testu, opravuje tři neexistující vady. Sada `tests/e2e`
// má proto souběh vypnutý už dávno; tenhle balíček na to čekal.
//
// Cena: sada běží déle. Stojí to za to — zelená, které se dá věřit, je víc
// než rychlá zelená, která občas lže.
export default defineConfig({
  test: {
    // Jeden proces, soubory za sebou. `singleFork` je totéž nastavení,
    // jaké používá `tests/e2e`.
    pool: 'forks',
    poolOptions: {
      forks: {
        singleFork: true,
      },
    },

    // Výchozí strop je 5 s. To nestačí tam, kde test čeká na uvolnění
    // omezovače (okno je 60 s) — spadl by NA ČAS, ne na tvrzení, a vypadalo
    // by to jako vada aplikace. Stejná hodnota jako v `tests/e2e`.
    testTimeout: 120_000,
    hookTimeout: 120_000,

    // Obě obvyklé přípony schválně: kdyby tu byl jen `*.test.ts`, případný
    // `*.spec.ts` by se TIŠE přestal spouštět a nikdo by si toho nevšiml.
    include: ['src/**/*.{test,spec}.ts'],
  },
});
