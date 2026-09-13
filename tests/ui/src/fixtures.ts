import { test as base, expect, type Page } from '@playwright/test';
import { mkdirSync } from 'node:fs';
import { join } from 'node:path';

// ── Sběr chyb ───────────────────────────────────────────────────────────────
// Každý test dostane `errors` a na konci se AUTOMATICKY kontroluje, že je
// konzole čistá a že žádný požadavek nevrátil 4xx/5xx. Kontrola je v teardownu
// fixture, takže se na ni nedá zapomenout — platí i pro testy, které ji
// nezmíní. Když je něco očekávané, musí se to výslovně povolit přes
// `errors.allow(...)`, a to je pak v kódu vidět.

export interface CapturedErrors {
  consoleErrors: string[];
  httpErrors: string[];
  /** Povolí očekávanou chybu (substring nebo regex). Používat střídmě a s komentářem proč. */
  allow(pattern: string | RegExp): void;
}

const SCREENSHOT_DIR = join(process.cwd(), 'screenshots');

/** Uloží snímek celé stránky do tests/ui/screenshots/<name>.png. */
export async function shot(page: Page, name: string): Promise<string> {
  mkdirSync(SCREENSHOT_DIR, { recursive: true });
  const path = join(SCREENSHOT_DIR, `${name}.png`);
  await page.screenshot({ path, fullPage: true });
  return path;
}

export const test = base.extend<{ errors: CapturedErrors }>({
  // `auto: true` je tu KLÍČOVÉ: bez něj Playwright fixture vůbec nevytvoří,
  // pokud si ji test nevyžádá v parametrech — a kontrola konzole a 4xx/5xx by
  // tiše neběžela. (Přesně na to jsem narazil: testy procházely, i když na
  // stránce byla chyba hydratace.)
  errors: [
    async ({ page }, use) => {
      const consoleErrors: string[] = [];
      const httpErrors: string[] = [];
      const allowed: (string | RegExp)[] = [];

      const isAllowed = (text: string): boolean =>
        allowed.some((p) => (typeof p === 'string' ? text.includes(p) : p.test(text)));

      page.on('console', (msg) => {
        if (msg.type() === 'error') consoleErrors.push(msg.text());
      });
      // Nezachycená výjimka v Reactu se do console.error nemusí dostat.
      page.on('pageerror', (err) => {
        consoleErrors.push(`pageerror: ${err.message}`);
      });
      page.on('response', (res) => {
        const status = res.status();
        if (status >= 400) {
          httpErrors.push(`${status} ${res.request().method()} ${res.url()}`);
        }
      });

      const captured: CapturedErrors = {
        consoleErrors,
        httpErrors,
        allow: (pattern) => allowed.push(pattern),
      };

      await use(captured);

      // Omezovač požadavků (20 přihlášení/min na IP a cestu) je PRODUKČNÍ
      // ochrana proti hádání hesel — a celá sada se přihlašuje jednou za test,
      // takže ho při plném běhu občas přetečeme. Odmítnutí proto tolerujeme,
      // ale jen na přihlašovací cestě: 429 odjinud test pořád shodí. A když by
      // přihlášení bylo blokované trvale, test spadne stejně, protože se
      // nedostane na /dashboard (viz `loginAsFitnessAdmin`).
      const tolerovanoHttp = /^429 POST .*\/auth\/login/;
      const tolerovanoKonzole = /429 \(Too Many Requests\)/;

      const realConsole = consoleErrors.filter((t) => !isAllowed(t) && !tolerovanoKonzole.test(t));
      const realHttp = httpErrors.filter((t) => !isAllowed(t) && !tolerovanoHttp.test(t));

      expect(realConsole, `Chyby v konzoli prohlížeče:\n${realConsole.join('\n')}`).toEqual([]);
      expect(realHttp, `Požadavky se stavem 4xx/5xx:\n${realHttp.join('\n')}`).toEqual([]);
    },
    { auto: true },
  ],
});

export { expect };

// ── Přihlášení do adminu ────────────────────────────────────────────────────
export const FITNESS = {
  slug: 'fitness',
  email: 'admin@fitness.local',
  password: 'fitness123',
} as const;

/**
 * Projde skutečným přihlašovacím formulářem (ne vložením tokenu do localStorage),
 * aby se testovala i ta obrazovka. Čeká na /dashboard.
 */
export async function loginAsFitnessAdmin(page: Page): Promise<void> {
  const POKUSU = 3;

  for (let pokus = 1; pokus <= POKUSU; pokus++) {
    await page.goto('/login');
    await page.locator('#slug').fill(FITNESS.slug);
    await page.locator('#email').fill(FITNESS.email);
    await page.locator('#password').fill(FITNESS.password);

    const cekaniNaOdpoved = page.waitForResponse(
      (r) => r.url().includes('/auth/login') && r.request().method() === 'POST',
      { timeout: 20_000 },
    );
    await page.getByRole('button', { name: 'Přihlásit' }).click();
    const odpoved = await cekaniNaOdpoved;

    if (odpoved.status() !== 429) {
      await page.waitForURL('**/dashboard', { timeout: 20_000 });
      return;
    }

    // Omezovač odmítl. Čekáme PODLE HODNOTY, kterou sám poslal v těle odpovědi
    // (`retryAfterSeconds`), ne podle odhadu — a zkusíme to znovu.
    const telo = (await odpoved.json().catch(() => null)) as {
      error?: { details?: { retryAfterSeconds?: number } };
    } | null;
    const sekund = telo?.error?.details?.retryAfterSeconds ?? 60;
    // eslint-disable-next-line no-console
    console.log(`[login] omezovač vrátil 429, čekám ${sekund} s (pokus ${pokus}/${POKUSU})`);
    await page.waitForTimeout(Math.min(sekund + 1, 65) * 1000);
  }

  throw new Error(
    `Přihlášení se nepovedlo ani na ${POKUSU}. pokus — omezovač požadavků pokaždé vrátil 429.`,
  );
}
