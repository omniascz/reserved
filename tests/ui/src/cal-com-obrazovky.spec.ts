import { test, expect, shot, loginAsFitnessAdmin } from './fixtures';

// Nové obrazovky z převzetí funkcí cal.com se vykreslí bez chyb (fixture
// hlídá konzoli i 4xx/5xx) a ukážou to, co mají:
//   - Integrace: Outlook a další kalendáře (+ formulář CalDAV)
//   - Detail zákazníka: uložená karta
//   - Webhooky: událost „Přesunutá rezervace"
//   - Vložení widgetu: měření rezervací (Meta pixel, GA4, GTM)

test.describe('Obrazovky převzaté z cal.com', () => {
  test.beforeEach(async ({ page }) => {
    await loginAsFitnessAdmin(page);
  });

  test('Integrace: Outlook a CalDAV u zaměstnanců', async ({ page }) => {
    await page.goto('/integrations');
    const sekce = page.getByTestId('other-calendars');
    await expect(sekce.getByRole('heading', { name: 'Outlook a další kalendáře' })).toBeVisible({
      timeout: 20_000,
    });
    await expect(sekce.getByRole('button', { name: 'Outlook' }).first()).toBeVisible();
    await sekce.getByRole('button', { name: 'Apple / CalDAV' }).first().click();
    await expect(sekce.getByPlaceholder('Heslo pro aplikace')).toBeVisible();
    await expect(sekce.getByPlaceholder('Adresa serveru')).toHaveValue('https://caldav.icloud.com');
    await shot(page, '20-integrace-kalendare');
  });

  test('Detail zákazníka: uložená karta', async ({ page }) => {
    await page.goto('/customers');
    const prvni = page.locator('a[href^="/customers/"]').first();
    await expect(prvni).toBeVisible({ timeout: 20_000 });
    await prvni.click();
    const panel = page.getByTestId('saved-cards-panel');
    await expect(panel.getByRole('heading', { name: 'Uložená karta' })).toBeVisible({
      timeout: 20_000,
    });
    await expect(
      panel.getByRole('button', { name: 'Poslat odkaz na uložení karty' }),
    ).toBeVisible();
    await expect(panel.getByText('Zákazník nemá uloženou kartu.')).toBeVisible();
    await panel.scrollIntoViewIfNeeded();
    await shot(page, '21-zakaznik-ulozena-karta');
  });

  test('Webhooky: událost Přesunutá rezervace', async ({ page }) => {
    await page.goto('/webhooks');
    await page.getByRole('button', { name: /Nový webhook/ }).click();
    await expect(page.getByText('Přesunutá rezervace').first()).toBeVisible({ timeout: 20_000 });
    await expect(page.getByText('X-Reserved-Webhook-Version: 1', { exact: false })).toBeVisible();
    await shot(page, '22-webhooky-presun');
  });

  test('Vložení widgetu: měření rezervací', async ({ page }) => {
    await page.goto('/settings/embed');
    await expect(
      page.getByRole('heading', { name: /Měření rezervací \(Meta pixel, Google Analytics\)/ }),
    ).toBeVisible({ timeout: 20_000 });
    await expect(page.getByText('data-meta-event="Schedule"', { exact: false })).toBeVisible();
    await shot(page, '23-vlozeni-mereni');
  });
});
