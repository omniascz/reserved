import { defineConfig, devices } from '@playwright/test';

// Testy jedou proti UŽ BĚŽÍCÍMU stacku (API 4010, admin web 4002, widget 4004).
// Záměrně tu není `webServer` — servery si pouští člověk nebo agent sám, aby
// jeden spadlý server nezabil celý běh a bylo vidět, co přesně neběží.
const WEB_URL = process.env.WEB_URL ?? 'http://localhost:4002';

export default defineConfig({
  testDir: './src',
  // Testy sdílejí JEDNU dev databázi a některé mění stav (pozastavení permanentky,
  // check-in účastníka). Paralelizace by je poštvala proti sobě → jeden worker.
  fullyParallel: false,
  workers: 1,
  forbidOnly: !!process.env.CI,
  retries: 0,
  timeout: 60_000,
  expect: { timeout: 10_000 },
  reporter: [['list'], ['html', { open: 'never', outputFolder: 'playwright-report' }]],
  outputDir: 'test-results',
  use: {
    baseURL: WEB_URL,
    headless: true,
    viewport: { width: 1440, height: 900 },
    locale: 'cs-CZ',
    timezoneId: 'Europe/Prague',
    screenshot: 'only-on-failure',
    video: 'off',
    trace: 'retain-on-failure',
    actionTimeout: 15_000,
    navigationTimeout: 30_000,
  },
  projects: [{ name: 'chromium', use: { ...devices['Desktop Chrome'] } }],
});
