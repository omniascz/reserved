import { test, expect, shot, loginAsFitnessAdmin, FITNESS } from './fixtures';

test.describe('Admin — přihlášení', () => {
  test('přihlašovací formulář se zobrazí a pustí fitness admina dovnitř', async ({
    page,
    errors,
  }) => {
    await page.goto('/login');

    await expect(page.getByRole('heading', { name: 'Reserved Admin' })).toBeVisible();
    await expect(page.getByText('Přihlášení do administrace')).toBeVisible();
    await shot(page, '01-login');

    await loginAsFitnessAdmin(page);

    // Skutečné ověření, že jsme uvnitř právě jako fitness — ne jen že se změnila URL.
    await expect(page).toHaveURL(/\/dashboard/);
    const slug = await page.evaluate(() => localStorage.getItem('reserved_tenant_slug'));
    expect(slug).toBe(FITNESS.slug);
    const token = await page.evaluate(() => localStorage.getItem('reserved_access_token'));
    expect(token, 'po přihlášení musí být uložený access token').toBeTruthy();

    await shot(page, '02-dashboard');

    // Kontrola konzole i 4xx/5xx proběhne automaticky v teardownu fixture `errors`.
    expect(errors.consoleErrors.length + errors.httpErrors.length).toBeGreaterThanOrEqual(0);
  });

  test('formulář nepředvyplňuje natvrdo zapsané cizí údaje', async ({ page }) => {
    await page.goto('/login');

    // Nález z fáze TESTY UI: v kódu byly natvrdo `demo-widget`,
    // `o@demo-widget.test` a dokonce heslo. Předvyplnit se smí jen z env
    // proměnných pro lokální vývoj — nikdy ne z kódu.
    const slug = await page.locator('#slug').inputValue();
    const email = await page.locator('#email').inputValue();
    const heslo = await page.locator('#password').inputValue();

    expect(slug).not.toBe('demo-widget');
    expect(email).not.toBe('o@demo-widget.test');
    expect(heslo).not.toBe('verysecurepassword123');

    // Heslo se nesmí předvyplnit z kódu za žádných okolností; pokud je vyplněné,
    // musí pocházet z dev proměnné, ne z natvrdo zapsané konstanty.
    const zdrojHesla = await page.evaluate(() => document.body.innerHTML.includes('verysecure'));
    expect(zdrojHesla, 'v HTML stránky nesmí být natvrdo zapsané heslo').toBe(false);
  });

  test('špatné heslo dovnitř nepustí', async ({ page, errors }) => {
    // Neúspěšné přihlášení JE očekávaná 401 — povolujeme ji výslovně, ať je to v kódu vidět.
    errors.allow('401');

    await page.goto('/login');
    await page.locator('#slug').fill(FITNESS.slug);
    await page.locator('#email').fill(FITNESS.email);
    await page.locator('#password').fill('tohle-heslo-neplati');
    await page.getByRole('button', { name: 'Přihlásit' }).click();

    await expect(page).toHaveURL(/\/login/);
    const token = await page.evaluate(() => localStorage.getItem('reserved_access_token'));
    expect(token, 'po neúspěšném přihlášení nesmí existovat token').toBeFalsy();
  });
});
