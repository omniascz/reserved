import postgres from 'postgres';
import { test, expect, shot, loginAsFitnessAdmin } from './fixtures';

// Filtry na /passes nemají id ani name, jen <label> nad <select> ve stejném divu.
const statusFilter = 'div:has(> label:text-is("Stav")) > select';
const typeFilter = 'div:has(> label:text-is("Typ")) > select';

const DB_URL = process.env.DATABASE_URL ?? 'postgresql://dev:dev@localhost:5433/reserved_dev';

/**
 * Nastaví Nikole ULOŽENÝ stav permanentky.
 *
 * Test si rozdíl „uloženo × spočítáno" musí vyrobit sám: poller expirace
 * (pack-expiry) uložený stav propadlých permanentek uklízí na `expired`, takže
 * po jeho běhu by žádný rozdíl nezbyl a test by měřil jen pořadí běhů. Tenhle
 * zápis odpovídá skutečnosti z provozu — permanentka, ke které se poller ještě
 * nedostal.
 */
async function nastavNikoleUlozenyStav(stav: string): Promise<void> {
  const sql = postgres(DB_URL, { max: 1 });
  try {
    await sql`
      UPDATE customer_credit_packs p SET status = ${stav}
      FROM customers c, tenants t
      WHERE c.id = p.customer_id AND t.id = p.tenant_id
        AND t.slug = 'fitness' AND c.first_name = 'Nikola'`;
  } finally {
    await sql.end();
  }
}

test.describe('Admin — /passes (seznam vydaných permanentek)', () => {
  test.beforeEach(async ({ page }) => {
    // Povolenka na chybu hydratace je ZRUŠENÁ — NavHeader už slug vypisuje až
    // po připojení v prohlížeči, takže žádná chyba nastat nesmí. Kdyby se
    // regrese vrátila, testy na ní spadnou (hlídá je fixture `errors`).
    await loginAsFitnessAdmin(page);
  });

  test('seznam se načte a propadlá permanentka Nikoly je vidět jako Propadlá', async ({ page }) => {
    // Uložený stav vrátíme na `active`, ať je rozdíl proti spočítanému stavu
    // jistý i po běhu polleru expirace (ten ho jinak uklidí na `expired`).
    await nastavNikoleUlozenyStav('active');
    await page.goto('/passes');

    await expect(page.getByRole('heading', { name: 'Vydané permanentky' })).toBeVisible();
    await expect(page.getByRole('columnheader', { name: 'Klient' })).toBeVisible();

    // Nikola Králová má v DB uložený stav `active`, ale platnost do 30. 8. 2026.
    // Obrazovka MUSÍ ukazovat spočítaný stav "Propadlá", ne ten z databáze.
    const nikola = page.getByRole('row').filter({ hasText: 'Nikola Králová' });
    await expect(nikola).toHaveCount(1);
    await expect(nikola.getByText('Propadlá', { exact: true })).toBeVisible();

    // Rozdíl uložený vs. spočítaný stav musí být v UI přiznaný — a to konkrétně:
    // štítek říká „Propadlá", poznámka přiznává, že v databázi je „Aktivní".
    await expect(nikola.getByText(/v DB Aktivní/)).toBeVisible();

    await shot(page, '03-passes-list');
  });

  test('filtr podle stavu opravdu filtruje', async ({ page }) => {
    await page.goto('/passes');
    await expect(page.getByRole('row').filter({ hasText: 'Klára Veselá' })).toHaveCount(1);

    // Přepnout na "Propadlé" → Nikola zůstane, aktivní Klára zmizí.
    await page.locator(statusFilter).selectOption('expired');
    await expect(page.getByRole('row').filter({ hasText: 'Nikola Králová' })).toHaveCount(1);
    await expect(page.getByRole('row').filter({ hasText: 'Klára Veselá' })).toHaveCount(0);
    await shot(page, '04-passes-filtr-propadle');

    // Přepnout na "Pozastavené" → zůstane jen Radek (v seedu jediný pozastavený).
    await page.locator(statusFilter).selectOption('suspended');
    await expect(page.getByRole('row').filter({ hasText: 'Radek Pokorný' })).toHaveCount(1);
    await expect(page.getByRole('row').filter({ hasText: 'Nikola Králová' })).toHaveCount(0);

    // Filtr typu: časové → zůstane Zuzana (jediná časová permanentka).
    await page.locator(statusFilter).selectOption('');
    await page.locator(typeFilter).selectOption('time');
    await expect(page.getByRole('row').filter({ hasText: 'Zuzana Marková' })).toHaveCount(1);
    await expect(page.getByRole('row').filter({ hasText: 'Klára Veselá' })).toHaveCount(0);
  });
});

test.describe('Admin — /passes/[id] (detail permanentky)', () => {
  test.beforeEach(async ({ page }) => {
    // Povolenka na chybu hydratace je ZRUŠENÁ — NavHeader už slug vypisuje až
    // po připojení v prohlížeči, takže žádná chyba nastat nesmí. Kdyby se
    // regrese vrátila, testy na ní spadnou (hlídá je fixture `errors`).
    await loginAsFitnessAdmin(page);
  });

  test('detail se otevře a pozastavení s poznámkou změní stav', async ({ page }) => {
    await page.goto('/passes');

    // Na detail jdeme proklikem ze seznamu, ne přes natvrdo vepsané UUID —
    // test tak přežije i nový seed.
    const klara = page.getByRole('row').filter({ hasText: 'Klára Veselá' });
    await klara.getByRole('link', { name: 'Detail' }).click();
    await expect(page).toHaveURL(/\/passes\/credit-/);

    await expect(page.getByRole('heading', { name: '10× EMS' })).toBeVisible();
    await expect(page.getByText('Historie čerpání')).toBeVisible();
    await shot(page, '05-pass-detail');

    // Výchozí stav si zapamatujeme, ať test nezáleží na pořadí běhů.
    const wasSuspended = await page.getByRole('button', { name: 'Obnovit' }).isVisible();
    if (wasSuspended) {
      await page.getByRole('button', { name: 'Obnovit' }).click();
      await page.getByRole('textbox', { name: /Poznámka/ }).fill('úklid před testem');
      await page.getByRole('button', { name: 'Potvrdit' }).click();
      await expect(page.getByRole('button', { name: 'Pozastavit' })).toBeVisible();
    }

    // ── Pozastavení ──
    await page.getByRole('button', { name: 'Pozastavit' }).click();
    await expect(page.getByRole('heading', { name: 'Pozastavit permanentku' })).toBeVisible();

    // Poznámka je povinná — prázdné potvrzení musí obrazovka odmítnout.
    await page.getByRole('button', { name: 'Potvrdit' }).click();
    await expect(page.getByText('Poznámka je povinná.')).toBeVisible();

    await page.locator('input[placeholder="proč se to mění"]').fill('test Playwrightem');
    await page.getByRole('button', { name: 'Potvrdit' }).click();

    // Stav se musí změnit — badge i varovná věta.
    await expect(page.getByText('Pozastavená', { exact: true })).toBeVisible();
    await expect(page.getByText(/při rezervaci se z ní nečerpá/)).toBeVisible();
    await expect(page.getByRole('button', { name: 'Obnovit' })).toBeVisible();
    await shot(page, '06-pass-detail-pozastavena');

    // ── Úklid: vrátit zpět na aktivní, ať další běh začíná ze stejného stavu ──
    await page.getByRole('button', { name: 'Obnovit' }).click();
    await page.locator('input[placeholder="proč se to mění"]').fill('konec testu');
    await page.getByRole('button', { name: 'Potvrdit' }).click();
    await expect(page.getByRole('button', { name: 'Pozastavit' })).toBeVisible();
  });
});
