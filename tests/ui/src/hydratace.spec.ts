import { test, expect, loginAsFitnessAdmin } from './fixtures';

// REGRESE na nález 1. Chyba hydratace nastane jen při PŘÍMÉM načtení stránky
// (ne při proklikání), a projeví se tím, že React zahodí serverový render a
// překreslí stránku na klientovi. Fixture `errors` hlídá konzoli automaticky,
// takže stačí každou stránku skutečně otevřít přes goto.
//
// Seznam stran vychází z auditu čtení prohlížečového úložiště během renderu:
// tady všude se slug (nebo typ provozu) čte z localStorage/sessionStorage.
const STRANKY: { cesta: string; klic: RegExp }[] = [
  { cesta: '/dashboard', klic: /Dashboard/ },
  { cesta: '/settings/embed', klic: /Embed|Vlož|kód/i },
  { cesta: '/settings/theme', klic: /Vzhled|Barva|Načítám/i },
  { cesta: '/settings/site', klic: /web|šablona|Načítám/i },
  { cesta: '/passes', klic: /Vydané permanentky/ },
  { cesta: '/class-sessions', klic: /Lekce/ },
];

test.describe('Admin — hydratace (server a prohlížeč musí vykreslit totéž)', () => {
  for (const { cesta, klic } of STRANKY) {
    test(`${cesta} se načte bez chyby hydratace`, async ({ page }) => {
      await loginAsFitnessAdmin(page);

      // Přímé načtení, ne proklik — jen tak k hydrataci vůbec dojde.
      await page.goto(cesta);
      await expect(page.locator('body')).toContainText(klic, { timeout: 20_000 });

      // Stránka nesmí skončit na náhradní hlášce, kterou dřív vykresloval
      // server, protože slug neznal.
      await expect(page.getByText('Tenant slug se nepodařilo načíst.')).toHaveCount(0);

      // Vlastní kontrola chyb konzole (včetně "Hydration failed") proběhne
      // automaticky v teardownu fixture `errors` — bez jakékoli povolenky.
    });
  }
});
