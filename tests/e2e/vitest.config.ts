import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    // E2E testy běží proti živému API, takže potřebují víc času než unit testy.
    testTimeout: 30_000,
    hookTimeout: 30_000,
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
