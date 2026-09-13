import { test, expect, shot, loginAsFitnessAdmin } from './fixtures';

test.describe('Admin — dashboard', () => {
  test.beforeEach(async ({ page }) => {
    await loginAsFitnessAdmin(page);
  });

  test('dlaždice permanentek jsou česky, žádný surový stav z API', async ({ page }) => {
    await page.goto('/dashboard');
    await expect(page.getByRole('heading', { name: 'Dashboard' })).toBeVisible();

    // Karta se sdílecím odkazem se vykresluje podle slugu z localStorage.
    // Hlídáme, že se po opravě hydratace opravdu zobrazí — samotná kontrola
    // konzole by prošla i tehdy, kdyby karta zmizela úplně.
    await expect(page.getByRole('heading', { name: /Sdílej rezervační odkaz/ })).toBeVisible();

    const karta = page
      .locator('div')
      .filter({ has: page.getByText('Permanentky', { exact: true }) })
      .last();
    await expect(karta).toBeVisible();

    // REGRESE na nález 4: chybějící překlad propadl fallbackem a vypsal surový
    // anglický stav z API ("SUSPENDED"). Text dlaždic je `uppercase`.
    const text = await karta.innerText();
    for (const anglicky of ['SUSPENDED', 'USED_UP', 'ROLLED_OVER', 'CANCELLED', 'REFUNDED']) {
      expect(text, `dlaždice ukazuje surový stav z API: ${anglicky}`).not.toContain(anglicky);
    }
    await expect(karta.getByText('Pozastavené')).toBeVisible();

    await shot(page, '14-dashboard-permanentky');
  });
});
