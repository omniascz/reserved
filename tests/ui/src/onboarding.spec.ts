import { test, expect, shot, loginAsFitnessAdmin } from './fixtures';

test.describe('Admin — onboarding na dashboardu', () => {
  test('tenant fitness po seedu NEUKAZUJE 0 z 6', async ({ page }) => {
    await loginAsFitnessAdmin(page);
    await page.goto('/dashboard');
    await expect(page.getByRole('heading', { name: 'Dashboard' })).toBeVisible();

    const telo = await page.locator('body').innerText();

    // Jádro nálezu: seed jde přímo do DB a řádek v onboarding_checklist
    // nezaloží. Dřív to znamenalo samé nuly bez ohledu na skutečná data.
    expect(telo, 'onboarding nesmí hlásit nulový postup u nastaveného studia').not.toContain(
      '0 z 6',
    );

    // Fitness má v seedu službu, tým, pracovní dobu, rezervace, ověřený e-mail
    // vlastníka i vědomou volbu „jen hotovost" → všech 6 kroků.
    const hotovo = telo.includes('Setup hotový');
    const pocet = telo.match(/(\d)\s*z\s*6\s*kroků/);
    expect(
      hotovo || (pocet && Number(pocet[1]) >= 5),
      `onboarding má být dokončený nebo skoro dokončený, na stránce je: ${pocet?.[0] ?? '(bez počtu)'}`,
    ).toBeTruthy();

    await shot(page, '15-dashboard-onboarding');
  });
});
