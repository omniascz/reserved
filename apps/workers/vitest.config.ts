import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    // Testy workerů jedou proti skutečné databázi (jádro workerů je SQL, mock by
    // neověřil to podstatné — které řádky se aktualizují a které ne).
    testTimeout: 30_000,
    hookTimeout: 30_000,
    // Sekvenčně v jednom procesu: testy sdílejí databázi a vytvářejí si vlastní
    // tenanty; paralelní běh by si je navzájem přepisoval.
    pool: 'forks',
    poolOptions: {
      forks: {
        singleFork: true,
      },
    },
    include: ['src/**/*.test.ts'],
  },
});
