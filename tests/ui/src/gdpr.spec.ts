import postgres from 'postgres';
import { test, expect, shot, loginAsFitnessAdmin } from './fixtures';

// Proklik GDPR panelu na detailu zákazníka: export (včetně skutečně staženého
// souboru) a výmaz s potvrzením.
//
// Test si zakládá VLASTNÍHO zákazníka a po sobě ho uklízí. Schválně nemaže
// nikoho ze seedu: výmaz je nevratný a na Nikole, Kláře a spol. stojí testy
// permanentek — jeden proklik by je rozbil pro všechny další běhy.

const DB_URL = process.env.DATABASE_URL ?? 'postgresql://dev:dev@localhost:5433/reserved_dev';

const znacka = Date.now().toString(36);
const EMAIL = `gdpr.${znacka}@e2e.local`;
const JMENO = 'Gdprová';
const PRIJMENI = `Testovací${znacka}`;

let customerId: string;

test.beforeAll(async () => {
  const sql = postgres(DB_URL, { max: 1 });
  try {
    const [row] = await sql`
      INSERT INTO customers (tenant_id, first_name, last_name, email, phone)
      SELECT t.id, ${JMENO}, ${PRIJMENI}, ${EMAIL}, '+420777123456'
      FROM tenants t WHERE t.slug = 'fitness'
      RETURNING id`;
    customerId = (row as { id: string }).id;
  } finally {
    await sql.end();
  }
});

test.afterAll(async () => {
  const sql = postgres(DB_URL, { max: 1 });
  try {
    await sql`DELETE FROM customer_notes WHERE customer_id = ${customerId}`;
    await sql`DELETE FROM customers WHERE id = ${customerId}`;
  } finally {
    await sql.end();
  }
});

test.describe('Admin — GDPR panel na detailu zákazníka', () => {
  test.beforeEach(async ({ page }) => {
    await loginAsFitnessAdmin(page);
  });

  test('ze seznamu se dá prokliknout na detail a vyexportovat údaje', async ({ page }) => {
    await page.goto('/customers');
    await expect(page.getByRole('heading', { name: 'Zákazníci' })).toBeVisible();

    // Na detail jdeme proklikem ze seznamu, ne přes natvrdo vepsané UUID.
    await page.getByPlaceholder('Hledat — jméno, email, telefon…').fill(EMAIL);
    const radek = page.getByRole('row').filter({ hasText: PRIJMENI });
    await expect(radek).toHaveCount(1);
    await radek.getByRole('link', { name: `${JMENO} ${PRIJMENI}` }).click();

    await expect(page).toHaveURL(new RegExp(`/customers/${customerId}`));
    await expect(page.getByTestId('gdpr-panel')).toBeVisible();
    await shot(page, '10-gdpr-panel');

    // Export musí skutečně vydat soubor — čekáme na stahování, ne jen na text.
    const stahovani = page.waitForEvent('download', { timeout: 20_000 });
    await page.getByTestId('gdpr-export').click();
    const soubor = await stahovani;
    expect(soubor.suggestedFilename()).toBe(`gdpr-export-${customerId}.json`);

    await expect(page.getByTestId('gdpr-export-summary')).toContainText('Export připraven');
    await shot(page, '11-gdpr-export');
  });

  test('výmaz vyžaduje potvrzení a pak nahlásí, co se stalo', async ({ page }) => {
    await page.goto(`/customers/${customerId}`);
    await expect(page.getByTestId('gdpr-panel')).toBeVisible();

    // Samotné kliknutí na „Vymazat" nesmí nic smazat — jen otevře potvrzení.
    await page.getByTestId('gdpr-erase').click();
    await expect(page.getByTestId('gdpr-erase-confirm')).toBeVisible();
    await expect(page.getByText(/Nejde to vzít zpět/)).toBeVisible();
    await shot(page, '12-gdpr-potvrzeni');

    await page.getByTestId('gdpr-erase-reason').fill('žádost zákazníka (Playwright)');
    await page.getByTestId('gdpr-erase-submit').click();

    await expect(page.getByTestId('gdpr-erase-result')).toBeVisible();
    await expect(page.getByTestId('gdpr-erase-result')).toContainText('Osobní údaje byly vymazány');
    await shot(page, '13-gdpr-vymazano');

    // Obrazovka se po výmazu načte znovu a už nesmí ukazovat původní jméno.
    await expect(page.getByRole('heading', { name: `${JMENO} ${PRIJMENI}` })).toHaveCount(0);
    await expect(page.getByRole('heading', { name: 'Smazaný zákazník' })).toBeVisible();
  });

  test('po výmazu už zákazník nejde najít podle původního e-mailu', async ({ page }) => {
    await page.goto('/customers');
    await page.getByPlaceholder('Hledat — jméno, email, telefon…').fill(EMAIL);
    await expect(page.getByRole('row').filter({ hasText: PRIJMENI })).toHaveCount(0);
  });
});
