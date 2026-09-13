import { test, expect, shot, loginAsFitnessAdmin } from './fixtures';

test.describe('Admin — /class-sessions (skupinové lekce)', () => {
  test.beforeEach(async ({ page }) => {
    // Povolenka na chybu hydratace ZRUŠENA — viz passes.spec.ts.
    await loginAsFitnessAdmin(page);
  });

  test('seznam lekcí se načte', async ({ page }) => {
    await page.goto('/class-sessions');

    await expect(page.getByRole('heading', { name: 'Lekce' })).toBeVisible();
    await expect(page.getByRole('columnheader', { name: 'Termín' })).toBeVisible();
    await expect(page.getByRole('columnheader', { name: 'Obsazenost' })).toBeVisible();

    // Výchozí filtr je "otevřené" — v seedu fitness jsou tři takové.
    const detailLinks = page.getByRole('link', { name: 'Detail' });
    await expect(detailLinks.first()).toBeVisible();
    expect(await detailLinks.count()).toBeGreaterThan(0);

    await shot(page, '07-class-sessions-list');
  });

  test('detail lekce ukáže přihlášené a check-in „Přišel“ změní stav účastníka', async ({
    page,
  }) => {
    await page.goto('/class-sessions');
    await page.getByRole('link', { name: 'Detail' }).first().click();
    await expect(page).toHaveURL(/\/class-sessions\/[0-9a-f-]{36}/);

    await expect(page.getByRole('heading', { name: 'Přihlášení' })).toBeVisible();
    await expect(page.getByText('Obsazenost')).toBeVisible();
    await shot(page, '08-class-session-detail');

    // Rozsah času nesmí opakovat datum dvakrát ("út 15. 9. 19:00 – út 15. 9. 19:55").
    // U lekce v rámci jednoho dne musí být datum právě jednou.
    const podnadpis = (await page.locator('h2 + p, h2 ~ p').first().innerText()).trim();
    const pocetDat = (podnadpis.match(/\d{1,2}\.\s*\d{1,2}\./g) ?? []).length;
    expect(pocetDat, `rozsah opakuje datum: "${podnadpis}"`).toBeLessThanOrEqual(1);

    // První účastník v tabulce přihlášených.
    const participantRow = page
      .locator('table')
      .filter({ has: page.getByRole('columnheader', { name: 'E-mail' }) })
      .locator('tbody tr')
      .first();
    await expect(participantRow).toBeVisible();
    const jmeno = (await participantRow.locator('td').first().innerText()).trim();
    expect(jmeno.length, 'detail lekce musí mít aspoň jednoho přihlášeného').toBeGreaterThan(0);

    // ── Check-in ──
    // POZOR: bez `exact` matchuje "Přišel" i tlačítko "Nepřišel" (hledá podřetězec).
    await participantRow.getByRole('button', { name: 'Přišel', exact: true }).click();

    // Stav účastníka se musí přepnout na "Přišel" ve sloupci Stav.
    const stateCell = participantRow.locator('td').nth(2);
    await expect(stateCell).toHaveText('Přišel', { timeout: 15_000 });

    await shot(page, '09-class-session-checkin');
  });
});
