import { test, expect, shot } from './fixtures';

// Widget je veřejný — žádné přihlášení. Tenanta bere z cesty: /<slug>.
const WIDGET_URL = process.env.WIDGET_URL ?? 'http://localhost:4004';

// EMS trénink má kapacitu 1 → jde klasickým tokem služba → specialista →
// termín → údaje → potvrzení. (TRX má kapacitu 12 a šel by přes výběr lekce.)
const SERVICE = 'EMS trénink';
const DATE = '2026-09-15';

test.describe('Widget — veřejná rezervace (tenant fitness)', () => {
  test('projde tok od výběru služby po potvrzenou rezervaci', async ({ page, errors }) => {
    await page.goto(`${WIDGET_URL}/fitness`);

    // ── 1. Služba ──
    await expect(page.getByRole('heading', { name: 'Vyber službu' })).toBeVisible({
      timeout: 30_000,
    });
    await shot(page, '10-widget-sluzby');
    await page.getByRole('button').filter({ hasText: SERVICE }).click();

    // ── 2. Specialista ──
    await expect(page.getByRole('heading', { name: 'Vyber specialistu' })).toBeVisible();
    await page.getByRole('button').filter({ hasText: 'Marek Trenér' }).click();

    // ── 3. Termín ──
    await expect(page.getByRole('heading', { name: 'Vyber termín' })).toBeVisible();

    // Datum posouváme ŠIPKOU, ne psaním do pole. Zadání psaním sice odešle dotaz
    // na správný den, ale obrazovka pak hlásí "žádné volné termíny" — viz nález
    // v reportu. Šipka na stejný den nabídne 42 časů.
    const dnesek = new Date();
    const cil = new Date(`${DATE}T12:00:00`);
    const kroku = Math.round((cil.getTime() - dnesek.setHours(12, 0, 0, 0)) / 86_400_000);
    for (let i = 0; i < kroku; i++) {
      await page.getByRole('button', { name: 'Další den' }).click();
    }
    await expect(page.locator('input[type="date"]')).toHaveValue(DATE);

    // Počkat, až se načtou sloty pro zvolený den, a vzít první volný.
    await expect(page.getByText('Načítám termíny…')).toBeHidden({ timeout: 20_000 });
    const slotButtons = page.locator('button').filter({ hasText: /^\d{1,2}:\d{2}$/ });
    await expect(slotButtons.first()).toBeVisible({ timeout: 20_000 });
    await shot(page, '11-widget-terminy');
    await slotButtons.first().click();

    // ── 4. Údaje ──
    await expect(page.getByRole('heading', { name: 'Tvoje údaje' })).toBeVisible();
    const unikat = Date.now();
    await page.locator('#name').fill('Playwright Testovací');
    await page.locator('#email').fill(`playwright+${unikat}@fitness.local`);
    await page.locator('#phone').fill('+420777123456');
    await shot(page, '12-widget-udaje');
    await page.getByRole('button', { name: 'Potvrdit rezervaci' }).click();

    // ── 5. Potvrzení ──
    await expect(page.getByRole('heading', { name: 'Rezervace potvrzena' })).toBeVisible({
      timeout: 30_000,
    });
    await expect(page.getByText('Číslo rezervace')).toBeVisible();
    await shot(page, '13-widget-potvrzeni');

    expect(errors.httpErrors, 'rezervační tok nesmí vygenerovat 4xx/5xx').toEqual([]);
  });
});
