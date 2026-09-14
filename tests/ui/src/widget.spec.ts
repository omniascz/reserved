import postgres from 'postgres';
import { test, expect, shot } from './fixtures';

// Widget je veřejný — žádné přihlášení. Tenanta bere z cesty: /<slug>.
const WIDGET_URL = process.env.WIDGET_URL ?? 'http://localhost:4004';
const DB_URL = process.env.DATABASE_URL ?? 'postgresql://dev:dev@localhost:5433/reserved_dev';

// EMS trénink má kapacitu 1 → jde klasickým tokem služba → specialista →
// termín → údaje → potvrzení. (TRX má kapacitu 12 a šel by přes výběr lekce.)
const SERVICE = 'EMS trénink';

// ── PROČ SE DNY POČÍTAJÍ Z DAT A NEJSOU NAPSANÉ NATVRDO ─────────────────────
// Dřív tu bylo `const DATE = '2026-09-15'` a komentář „dnes (neděle) je zavřeno".
// Test tím měřil KALENDÁŘ, ne aplikaci: v neděli prošel, v pondělí spadl (pondělí
// je podle pracovní doby otevřené) a po 15. 9. by se rozbil úplně, protože počet
// kroků vyjde záporně.
//
// Teď se otevřený i zavřený den ZJIŠŤUJÍ z pracovní doby tenanta v databázi.
// Seed ji zakládá podle ISO dne v týdnu (pondělí–pátek), takže je deterministická
// — mění se jen to, který konkrétní datum na ně padne. Test tak dává stejný
// výsledek v pondělí i v sobotu.

/** ISO den v týdnu: 1 = pondělí … 7 = neděle. */
function isoDen(d: Date): number {
  const den = d.getDay(); // 0 = neděle
  return den === 0 ? 7 : den;
}

/** Datum ve tvaru YYYY-MM-DD v místním čase (ne UTC — input[type=date] je místní). */
function jakoISO(d: Date): string {
  const mesic = String(d.getMonth() + 1).padStart(2, '0');
  const den = String(d.getDate()).padStart(2, '0');
  return `${d.getFullYear()}-${mesic}-${den}`;
}

function plusDni(d: Date, dni: number): Date {
  const out = new Date(d);
  out.setDate(out.getDate() + dni);
  return out;
}

interface VybraneDny {
  /** Datum, kdy má tenant zavřeno (žádná pracovní doba). */
  zavreny: string;
  /** Datum, kdy má otevřeno. */
  otevreny: string;
  /** Kolik kliknutí na „Další den" vede ze zavřeného na otevřený (min. 3). */
  kroku: number;
}

/**
 * Zjistí z databáze, které dny v týdnu má tenant `fitness` otevřeno, a vybere
 * konkrétní zavřený a otevřený den v budoucnosti.
 *
 * Mezi nimi nechává aspoň tři dny, aby překlikávání vytvořilo skutečný závod
 * odpovědí — to je podstata téhle regrese (opožděná odpověď přepsala novější).
 */
async function zjistiDny(): Promise<VybraneDny> {
  const sql = postgres(DB_URL, { max: 1 });
  try {
    const radky = await sql<Array<{ day_of_week: number }>>`
      SELECT DISTINCT wh.day_of_week
      FROM employee_working_hours wh
      JOIN tenants t ON t.id = wh.tenant_id
      WHERE t.slug = 'fitness' AND wh.is_active = true`;
    const otevreneDny = new Set(radky.map((r) => Number(r.day_of_week)));

    if (otevreneDny.size === 0) {
      throw new Error('Tenant fitness nemá v databázi žádnou pracovní dobu — test nemá co měřit.');
    }
    if (otevreneDny.size >= 7) {
      throw new Error(
        'Tenant fitness má otevřeno každý den — test potřebuje i zavřený den. ' +
          'Buď se změnil seed, nebo je potřeba zavřený den v testu vyrobit.',
      );
    }

    const dnes = new Date();

    // Zavřený den hledáme od zítřka (dnešek může být zčásti za pracovní dobou).
    let zavreny: Date | null = null;
    for (let i = 1; i <= 14 && !zavreny; i++) {
      const kandidat = plusDni(dnes, i);
      if (!otevreneDny.has(isoDen(kandidat))) zavreny = kandidat;
    }
    if (!zavreny) throw new Error('Do 14 dnů nenalezen žádný zavřený den.');

    // Otevřený den: nejbližší otevřený aspoň 3 dny po zavřeném.
    let kroku = 0;
    for (let k = 3; k <= 10 && kroku === 0; k++) {
      if (otevreneDny.has(isoDen(plusDni(zavreny, k)))) kroku = k;
    }
    if (kroku === 0) throw new Error('Nenalezen otevřený den 3–10 dnů po zavřeném.');

    return {
      zavreny: jakoISO(zavreny),
      otevreny: jakoISO(plusDni(zavreny, kroku)),
      kroku,
    };
  } finally {
    await sql.end();
  }
}

let dny: VybraneDny;

test.beforeAll(async () => {
  dny = await zjistiDny();
  // eslint-disable-next-line no-console
  console.log(
    `[widget] zavřený den: ${dny.zavreny} · otevřený den: ${dny.otevreny} (${dny.kroku} kroků)`,
  );
});

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

    // Datum zadáváme PSANÍM do pole — právě tahle cesta byla rozbitá
    // (opožděná odpověď na dřívější den přepsala výsledek a obrazovka hlásila
    // "žádné volné termíny"). Druhý test v tomhle souboru pokrývá tutéž věc
    // přes šipky, takže jsou ošetřené obě cesty.
    await page.locator('input[type="date"]').fill(dny.otevreny);
    await expect(page.locator('input[type="date"]')).toHaveValue(dny.otevreny);

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

  test('rychlé překlikávání dnů ukáže termíny toho dne, který je vybraný', async ({ page }) => {
    // REGRESE na nález 2: dřív se odpovědi přeskakovaly — opožděná odpověď na
    // starší den přepsala novější výsledek a zákazník viděl prázdný kalendář
    // u dne, který volno měl. Záměna dnů je poznat na tom, že zavřený den
    // termíny nemá a otevřený ano.
    await page.goto(`${WIDGET_URL}/fitness`);
    await expect(page.getByRole('heading', { name: 'Vyber službu' })).toBeVisible({
      timeout: 30_000,
    });
    await page.getByRole('button').filter({ hasText: SERVICE }).click();
    await page.getByRole('button').filter({ hasText: 'Marek Trenér' }).click();
    await expect(page.getByRole('heading', { name: 'Vyber termín' })).toBeVisible();

    const dalsiDen = page.getByRole('button', { name: 'Další den' });
    const predchoziDen = page.getByRole('button', { name: 'Předchozí den' });
    const datum = page.locator('input[type="date"]');
    const casy = page.locator('button').filter({ hasText: /^\d{1,2}:\d{2}$/ });
    const hlaskaZavreno = page.getByText(
      'Pro tento den nejsou žádné volné termíny. Vyber jiný den.',
    );

    // Výchozí bod: ZAVŘENÝ den, zadaný napevno do pole (ne „co widget zrovna
    // nabídne" — na tom předchozí verze testu ztroskotala).
    await datum.fill(dny.zavreny);
    await expect(datum).toHaveValue(dny.zavreny);
    await expect(hlaskaZavreno).toBeVisible({ timeout: 20_000 });

    // Rychle vpřed na otevřený den — bez čekání mezi kliky, ať se dotazy překryjí.
    for (let i = 0; i < dny.kroku; i++) await dalsiDen.click();

    await expect(datum).toHaveValue(dny.otevreny);
    // Jádro testu: u vybraného dne MUSÍ termíny být.
    await expect(casy.first()).toBeVisible({ timeout: 20_000 });
    expect(await casy.count(), 'u otevřeného dne musí být nabídnuté termíny').toBeGreaterThan(0);

    // A zpátky na zavřený den — tam naopak termíny být nesmí.
    for (let i = 0; i < dny.kroku; i++) await predchoziDen.click();
    await expect(datum).toHaveValue(dny.zavreny);
    await expect(hlaskaZavreno).toBeVisible({ timeout: 20_000 });
    expect(await casy.count(), 'u zavřeného dne nesmí zůstat viset termíny jiného dne').toBe(0);
  });
});
