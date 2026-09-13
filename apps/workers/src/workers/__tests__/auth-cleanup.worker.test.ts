// Test úklidu evidence neúspěšných přihlášení.
//
// Data si test vytváří sám a posouvá `created_at` do minulosti — čekat 30 dní
// nejde. Ověřuje obojí: že staré záznamy zmizí A že čerstvé zůstanou. Kdyby se
// kontrolovalo jen mazání, prošel by i worker, který vymaže úplně všechno.

import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { drizzle } from 'drizzle-orm/postgres-js';
import postgres from 'postgres';
import { schema } from '@reserved/db';
import { AuthCleanupWorker } from '../auth-cleanup.worker.js';

const DB_URL = process.env.DATABASE_URL ?? 'postgresql://dev:dev@localhost:5433/reserved_dev';
const client = postgres(DB_URL, { max: 3 });
const db = drizzle(client, { schema });

const znacka = `ac-${Date.now().toString(36)}`;
let tenantId: string;

async function pocetZaznamu(): Promise<number> {
  const r =
    await client`SELECT count(*)::int AS n FROM login_attempts WHERE tenant_id = ${tenantId}`;
  return (r[0] as { n: number }).n;
}

describe('AuthCleanupWorker', () => {
  beforeAll(async () => {
    const [t] = await client`
      INSERT INTO tenants (slug, name, plan, status)
      VALUES (${znacka}, ${'Auth Cleanup ' + znacka}, 'starter', 'active')
      RETURNING id`;
    tenantId = (t as { id: string }).id;

    // Tři staré (mimo retenci) a dva čerstvé.
    await client`
      INSERT INTO login_attempts (tenant_id, email, reason, created_at)
      VALUES
        (${tenantId}, ${'stary1@e2e.local'}, 'bad_password', now() - interval '40 days'),
        (${tenantId}, ${'stary2@e2e.local'}, 'unknown_user', now() - interval '31 days'),
        (${tenantId}, ${'stary3@e2e.local'}, 'bad_password', now() - interval '90 days'),
        (${tenantId}, ${'cerstvy1@e2e.local'}, 'bad_password', now() - interval '2 days'),
        (${tenantId}, ${'cerstvy2@e2e.local'}, 'bad_password', now())`;
  });

  afterAll(async () => {
    await client`DELETE FROM login_attempts WHERE tenant_id = ${tenantId}`;
    await client`DELETE FROM tenants WHERE id = ${tenantId}`;
    await client.end();
  });

  it('smaže záznamy starší než 30 dní', async () => {
    expect(await pocetZaznamu()).toBe(5);

    const worker = new AuthCleanupWorker(db);
    const vysledek = await worker.tick();

    expect(vysledek.smazano).toBeGreaterThanOrEqual(3);
    expect(await pocetZaznamu()).toBe(2);
  });

  it('čerstvé záznamy NECHÁ být — jinak by zámek přestal fungovat', async () => {
    const zbyle = await client`
      SELECT email FROM login_attempts WHERE tenant_id = ${tenantId} ORDER BY email`;
    expect(zbyle.map((r) => (r as { email: string }).email)).toEqual([
      'cerstvy1@e2e.local',
      'cerstvy2@e2e.local',
    ]);
  });

  it('druhý běh už nemá co mazat (je idempotentní)', async () => {
    const worker = new AuthCleanupWorker(db);
    const vysledek = await worker.tick();
    expect(await pocetZaznamu()).toBe(2);
    expect(vysledek).toHaveProperty('smazano');
  });
});
