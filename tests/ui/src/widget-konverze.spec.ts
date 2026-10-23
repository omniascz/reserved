import { createServer, type Server } from 'node:http';
import postgres from 'postgres';
import { test, expect } from './fixtures';

// Měření konverzí: widget vložený přes embed.js na web provozovny po dokončené
// rezervaci pošle stránce událost (vzor cal.com `bookingSuccessfulV2`).
//
// Hostitelskou stránku servíruje malý HTTP server v testu na 127.0.0.1 —
// jiný origin než widget (localhost:4004), takže iframe je opravdu cizí, jako
// na skutečném webu. (Stránka podvržená přes page.route nebo na veřejné
// doméně by v Chrome narazila na Private/Local Network Access: „veřejná"
// stránka nesmí načíst skript z localhostu. Na produkci je widget veřejný.)
// Meta pixel a GTM jsou nahrazené zapisovači, test kontroluje, co dostaly.

const WIDGET_URL = process.env.WIDGET_URL ?? 'http://localhost:4004';
const DB_URL = process.env.DATABASE_URL ?? 'postgresql://dev:dev@localhost:5433/reserved_dev';
const SERVICE = 'EMS trénink';

/** Nejbližší den (od zítřka), kdy má tenant fitness otevřeno — z dat, ne natvrdo. */
async function otevrenyDen(): Promise<string> {
  const sql = postgres(DB_URL, { max: 1 });
  try {
    const radky = await sql<Array<{ day_of_week: number }>>`
      SELECT DISTINCT wh.day_of_week FROM employee_working_hours wh
      JOIN tenants t ON t.id = wh.tenant_id
      WHERE t.slug = 'fitness' AND wh.is_active = true`;
    const otevrene = new Set(radky.map((r) => Number(r.day_of_week)));
    for (let i = 1; i <= 14; i++) {
      const d = new Date();
      d.setDate(d.getDate() + i);
      const iso = d.getDay() === 0 ? 7 : d.getDay();
      if (otevrene.has(iso)) {
        return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
      }
    }
    throw new Error('Tenant fitness nemá do 14 dnů otevřeno — test nemá co měřit.');
  } finally {
    await sql.end();
  }
}

const HOST_HTML = `<!doctype html>
<html><head><meta charset="utf-8"><title>Web provozovny</title>
<script>
  window.dataLayer = [];
  window.fbqCalls = [];
  window.fbq = function () { window.fbqCalls.push(Array.prototype.slice.call(arguments)); };
  window.domEvents = [];
  window.addEventListener('reserved:booking', function (e) { window.domEvents.push(e.detail); });
  window.callbackCalls = [];
  window.poRezervaci = function (d) { window.callbackCalls.push(d); };
</script></head>
<body><h1>Fitness — rezervace</h1>
<script src="${WIDGET_URL}/embed.js" data-slug="fitness" data-meta-event="Schedule"
  data-on-booking="poRezervaci" data-height="900"></script>
</body></html>`;

let server: Server;
let HOST: string;

test.beforeAll(async () => {
  server = createServer((_req, res) => {
    res.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8' }).end(HOST_HTML);
  });
  await new Promise<void>((r) => server.listen(0, '127.0.0.1', r));
  const addr = server.address();
  HOST = `http://127.0.0.1:${typeof addr === 'object' && addr ? addr.port : 0}`;
});

test.afterAll(async () => {
  await new Promise<void>((r) => server.close(() => r()));
});

test.describe('Widget na webu provozovny — měření konverzí', () => {
  test('dokončená rezervace pošle stránce událost, dataLayer i Meta pixel', async ({
    page,
    errors,
  }) => {
    const den = await otevrenyDen();
    await page.goto(`${HOST}/rezervace`);

    const w = page.frameLocator('iframe[id^="rw-"]');
    await expect(w.getByRole('heading', { name: 'Vyber službu' })).toBeVisible({
      timeout: 30_000,
    });
    await w.getByRole('button').filter({ hasText: SERVICE }).click();
    await w.getByRole('button').filter({ hasText: 'Marek Trenér' }).click();
    await expect(w.getByRole('heading', { name: 'Vyber termín' })).toBeVisible();
    await w.locator('input[type="date"]').fill(den);
    await expect(w.getByText('Načítám termíny…')).toBeHidden({ timeout: 20_000 });
    const sloty = w.locator('button').filter({ hasText: /^\d{1,2}:\d{2}$/ });
    await expect(sloty.first()).toBeVisible({ timeout: 20_000 });
    // Poslední slot dne — první může být obsazený jinými testy.
    await sloty.last().click();

    await expect(w.getByRole('heading', { name: 'Tvoje údaje' })).toBeVisible();
    await w.locator('#name').fill('Konverze Testovací');
    await w.locator('#email').fill(`konverze+${Date.now()}@fitness.local`);
    await w.locator('#phone').fill('+420777123456');
    await w.getByRole('button', { name: 'Potvrdit rezervaci' }).click();
    await expect(w.getByRole('heading', { name: 'Rezervace potvrzena' })).toBeVisible({
      timeout: 30_000,
    });

    // ── Co dostala stránka provozovny ──
    await expect.poll(() => page.evaluate(() => (window as any).domEvents.length)).toBe(1);
    const detail = await page.evaluate(() => (window as any).domEvents[0]);
    expect(detail).toMatchObject({ kind: 'appointment', status: 'confirmed' });
    expect(detail.bookingId).toMatch(/^[0-9a-f-]{36}$/);
    expect(detail.referenceCode).toMatch(/^B-/);
    expect(detail.serviceId).toMatch(/^[0-9a-f-]{36}$/);
    expect(typeof detail.priceHellers).toBe('number');
    expect(detail.value).toBe(detail.priceHellers / 100);
    expect(detail.currency).toBe('CZK');

    const dataLayer = await page.evaluate(() => (window as any).dataLayer);
    expect(dataLayer).toEqual([
      expect.objectContaining({ event: 'reserved_booking', value: detail.value, currency: 'CZK' }),
    ]);

    const fbq = await page.evaluate(() => (window as any).fbqCalls);
    expect(fbq).toEqual([
      [
        'track',
        'Schedule',
        {
          value: detail.value,
          currency: 'CZK',
          content_ids: [detail.serviceId],
          content_type: 'product',
        },
        { eventID: `reserved-${detail.bookingId}` },
      ],
    ]);

    const callback = await page.evaluate(() => (window as any).callbackCalls);
    expect(callback).toEqual([detail]);

    // Podvržená zpráva z hostitelské stránky samotné se NEZAPOČÍTÁ.
    await page.evaluate(() =>
      window.postMessage(
        { type: 'reserved:booking_success', bookingId: 'podvrh', priceHellers: 100000 },
        '*',
      ),
    );
    await page.waitForTimeout(300);
    expect(await page.evaluate(() => (window as any).domEvents.length)).toBe(1);
    expect(await page.evaluate(() => (window as any).fbqCalls.length)).toBe(1);

    expect(errors.httpErrors, 'rezervační tok nesmí vygenerovat 4xx/5xx').toEqual([]);
  });
});
