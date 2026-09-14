// Testy převodu existujících přístupů k platebním bránám na šifrované + testy
// vynuceného hesla role `app_user`.
//
// Obojí jsou kroky nasazení, které se dělají JEDNOU a pod tlakem. Když
// selžou potichu, provozovatelé přijdou o přístupy k branám (platby přestanou
// chodit) nebo zůstane databázová role s veřejně známým heslem.

import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import path from 'node:path';
import postgres from 'postgres';
import { desifrujKonfiguraci, konfiguraceJeZasifrovana, nactiKlic } from '@reserved/utils';
import { prevedPlatebniKonfigurace } from '../encrypt-payment-configs.js';

const execFileAsync = promisify(execFile);

const DB_URL = process.env.DATABASE_URL ?? 'postgresql://dev:dev@localhost:5433/reserved_dev';
const sql = postgres(DB_URL, { max: 2 });
const KLIC = nactiKlic('c'.repeat(64), 'TEST_KEY');

const znacka = `enc-${Date.now().toString(36)}`;
let tenantId: string;

const CITELNY = { merchant: '123456', secret: 'tajne-heslo-comgate', test: false };

describe('Převod přístupů k platebním bránám na šifrované', () => {
  beforeAll(async () => {
    const [t] = await sql`
      INSERT INTO tenants (slug, name, plan, status)
      VALUES (${znacka}, ${'Šifrování ' + znacka}, 'starter', 'active')
      RETURNING id`;
    tenantId = (t as { id: string }).id;

    // 1) čitelná konfigurace (stav před nasazením)
    await sql`
      INSERT INTO payment_methods (tenant_id, method_type, config, is_enabled)
      VALUES (${tenantId}, 'comgate', ${sql.json(CITELNY)}, true)`;
    // 2) prázdná konfigurace (zakládá ji propojení Stripe Connect)
    await sql`
      INSERT INTO payment_methods (tenant_id, method_type, config, is_enabled)
      VALUES (${tenantId}, 'stripe', ${sql.json({})}, false)`;
  });

  afterAll(async () => {
    await sql`DELETE FROM payment_methods WHERE tenant_id = ${tenantId}`;
    await sql`DELETE FROM tenants WHERE id = ${tenantId}`;
    await sql.end();
  });

  it('čitelnou konfiguraci zašifruje a nic neztratí', async () => {
    const pred = await sql`
      SELECT config::text AS config FROM payment_methods
      WHERE tenant_id = ${tenantId} AND method_type = 'comgate'`;
    expect((pred[0] as { config: string }).config).toContain('tajne-heslo-comgate');

    const vysledek = await prevedPlatebniKonfigurace(sql, KLIC, () => {});
    expect(vysledek.zasifrovano).toBeGreaterThanOrEqual(1);

    const po = await sql`
      SELECT config FROM payment_methods
      WHERE tenant_id = ${tenantId} AND method_type = 'comgate'`;
    const ulozeno = (po[0] as { config: Record<string, unknown> }).config;

    expect(konfiguraceJeZasifrovana(ulozeno)).toBe(true);
    // A po rozšifrování sedí PŮVODNÍ hodnoty včetně typu booleanu.
    expect(desifrujKonfiguraci(ulozeno, KLIC)).toEqual(CITELNY);
  });

  it('v databázi nezůstal čitelný otisk hesla ani identifikátoru', async () => {
    const [row] = await sql`
      SELECT config::text AS config FROM payment_methods
      WHERE tenant_id = ${tenantId} AND method_type = 'comgate'`;
    const text = (row as { config: string }).config;
    expect(text).not.toContain('tajne-heslo-comgate');
    expect(text).not.toContain('123456');
  });

  it('prázdnou konfiguraci nechá být', async () => {
    const [row] = await sql`
      SELECT config::text AS config FROM payment_methods
      WHERE tenant_id = ${tenantId} AND method_type = 'stripe'`;
    expect((row as { config: string }).config).toBe('{}');
  });

  it('druhý běh už nic nešifruje (jde pustit vícekrát)', async () => {
    const vysledek = await prevedPlatebniKonfigurace(sql, KLIC, () => {});
    expect(vysledek.zasifrovano).toBe(0);
    expect(vysledek.preskoceno).toBeGreaterThanOrEqual(1);

    // A dvojím během se data nezničila.
    const [row] = await sql`
      SELECT config FROM payment_methods
      WHERE tenant_id = ${tenantId} AND method_type = 'comgate'`;
    expect(desifrujKonfiguraci((row as { config: Record<string, unknown> }).config, KLIC)).toEqual(
      CITELNY,
    );
  });
});

describe('Vynucené heslo role app_user', () => {
  const korenDb = path.resolve(__dirname, '..', '..');

  it('migrace BEZ APP_USER_PASSWORD skončí chybou a nic nezmění', async () => {
    // Heslo se v migračním skriptu načítá PŘED připojením k databázi, takže
    // tenhle běh se databáze vůbec nedotkne — což je celý smysl: selhat dřív,
    // než se něco zapíše.
    const env: NodeJS.ProcessEnv = { ...process.env, DATABASE_URL: DB_URL };
    delete env.APP_USER_PASSWORD;

    let spadlo = false;
    let vystup = '';
    try {
      await execFileAsync('node', ['--import', 'tsx', 'src/migrate.ts'], {
        cwd: korenDb,
        env,
        timeout: 60_000,
      });
    } catch (err) {
      spadlo = true;
      const e = err as { stderr?: string; stdout?: string };
      vystup = `${e.stderr ?? ''}${e.stdout ?? ''}`;
    }

    expect(spadlo, 'migrace bez hesla měla skončit chybou').toBe(true);
    expect(vystup).toContain('APP_USER_PASSWORD');
  }, 90_000);

  it('příliš krátké heslo taky neprojde', async () => {
    const env = { ...process.env, DATABASE_URL: DB_URL, APP_USER_PASSWORD: 'krátké' };

    let spadlo = false;
    let vystup = '';
    try {
      await execFileAsync('node', ['--import', 'tsx', 'src/migrate.ts'], {
        cwd: korenDb,
        env,
        timeout: 60_000,
      });
    } catch (err) {
      spadlo = true;
      const e = err as { stderr?: string; stdout?: string };
      vystup = `${e.stderr ?? ''}${e.stdout ?? ''}`;
    }

    expect(spadlo).toBe(true);
    expect(vystup).toMatch(/12 znaků/);
  }, 90_000);
});
