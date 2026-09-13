import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    // E2E testy běží proti živému API, takže potřebují víc času než unit testy.
    //
    // 120 s kvůli omezovači požadavků: limit na přihlašovací cestě je 20/min a
    // je SDÍLENÝ celou sadou (klíčuje se podle IP a cesty). Test zamykání účtu
    // proto musí umět počkat na uvolnění okna — s třicetisekundovým stropem by
    // spadl na čas dřív, než se limit uvolní. Strop se uplatní jen tam, kde se
    // opravdu čeká; ostatní testy doběhnou ve zlomku sekundy jako dosud.
    testTimeout: 120_000,
    hookTimeout: 120_000,
    // Sekvenčně — testy sdílejí stav (kupříkladu vytvořený tenant).
    pool: 'forks',
    poolOptions: {
      forks: {
        singleFork: true,
      },
    },
    include: ['src/**/*.spec.ts'],
  },
});
