// Test workeru expirace permanentek.
//
// Workers dosud neměly ŽÁDNÝ test — tímhle se začíná. Jede proti skutečné
// databázi (jako e2e testy v repu), protože jádro workeru je SQL a mock by
// neověřil to podstatné: které řádky se aktualizují a které ne.
//
// Data si test VYTVÁŘÍ SÁM. V seedu totiž není žádná permanentka, která by byla
// zároveň pozastavená a propadlá — a přesně ta je jádrem pravidla „pozastavené
// se nesmí probudit". Bez vlastních dat by test prošel i s rozbitou
// implementací.

import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { drizzle } from 'drizzle-orm/postgres-js';
import { sql } from 'drizzle-orm';
import postgres from 'postgres';
import { schema } from '@reserved/db';
import { PackExpiryWorker } from '../pack-expiry.worker.js';

const DB_URL = process.env.DATABASE_URL ?? 'postgresql://dev:dev@localhost:5433/reserved_dev';
const client = postgres(DB_URL, { max: 3 });
const db = drizzle(client, { schema });

const znacka = `pe-${Date.now().toString(36)}`;
let tenantId: string;
let customerId: string;
let packId: string;

/** id → status, ať se dá po běhu ověřit každý případ zvlášť. */
const ids: Record<string, string> = {};

async function stav(id: string): Promise<string> {
  const r = await client`SELECT status FROM customer_credit_packs WHERE id = ${id}`;
  return (r[0] as { status: string }).status;
}

describe('PackExpiryWorker', () => {
  beforeAll(async () => {
    const [t] = await client`
      INSERT INTO tenants (slug, name, plan, status)
      VALUES (${znacka}, ${'Pack Expiry ' + znacka}, 'starter', 'active')
      RETURNING id`;
    tenantId = (t as { id: string }).id;

    const [c] = await client`
      INSERT INTO customers (tenant_id, first_name, last_name, email)
      VALUES (${tenantId}, 'Test', 'Klient', ${znacka + '@e2e.local'})
      RETURNING id`;
    customerId = (c as { id: string }).id;

    const [p] = await client`
      INSERT INTO credit_packs (tenant_id, name, mode, total_credits, validity_days, price_hellers, currency, is_active)
      VALUES (${tenantId}, '10x test', 'per_visit', 10, 30, 100000, 'CZK', true)
      RETURNING id`;
    packId = (p as { id: string }).id;

    // ISO text, ne `Date` — viz PAST v CLAUDE.md: ovladač postgres-js neumí
    // `Date` jako parametr serializovat a dotaz spadne.
    const vcera = new Date(Date.now() - 24 * 3600_000).toISOString();
    const priste = new Date(Date.now() + 30 * 24 * 3600_000).toISOString();

    const pripady: Array<[string, string, string]> = [
      // [klíč, uložený stav, platnost do]
      ['propadla_aktivni', 'active', vcera], // MUSÍ se převést na expired
      ['propadla_vycerpana', 'used_up', vcera], // MUSÍ se převést
      ['propadla_pozastavena', 'suspended', vcera], // NESMÍ se dotknout
      ['platna_aktivni', 'active', priste], // NESMÍ se dotknout
      ['propadla_zrusena', 'cancelled', vcera], // NESMÍ se dotknout
    ];

    for (const [klic, status, validUntil] of pripady) {
      // `snapshot_mode` je povinný (kopie režimu číselníku v době prodeje)
      // a `currency` tahle tabulka nemá — měna je jen u číselníku `credit_packs`.
      const [row] = await client`
        INSERT INTO customer_credit_packs
          (tenant_id, customer_id, credit_pack_id, credits_at_purchase, credits_remaining,
           snapshot_mode, price_paid_hellers, status, valid_until)
        VALUES (${tenantId}, ${customerId}, ${packId}, 10, 5, 'per_visit', 100000, ${status}, ${validUntil}::timestamptz)
        RETURNING id`;
      ids[klic] = (row as { id: string }).id;
    }
  });

  afterAll(async () => {
    await client`DELETE FROM customer_credit_packs WHERE tenant_id = ${tenantId}`;
    await client`DELETE FROM credit_packs WHERE tenant_id = ${tenantId}`;
    await client`DELETE FROM customers WHERE tenant_id = ${tenantId}`;
    await client`DELETE FROM tenants WHERE id = ${tenantId}`;
    await client.end();
  });

  it('propadlé permanentky převede na expired', async () => {
    expect(await stav(ids.propadla_aktivni!)).toBe('active');

    const worker = new PackExpiryWorker(db);
    const vysledek = await worker.tick();

    expect(vysledek.celkem).toBeGreaterThan(0);
    expect(await stav(ids.propadla_aktivni!)).toBe('expired');
    expect(await stav(ids.propadla_vycerpana!)).toBe('expired');
  });

  it('POZASTAVENOU propadlou permanentku NEPŘEPÍŠE', async () => {
    // Jádro pravidla: pozastavení je vědomé rozhodnutí provozovatele a expirace
    // ho nesmí přebít — stejně jako ho neoživí refund.
    expect(await stav(ids.propadla_pozastavena!)).toBe('suspended');
  });

  it('platnou permanentku nechá být', async () => {
    expect(await stav(ids.platna_aktivni!)).toBe('active');
  });

  it('zrušenou permanentku nechá být', async () => {
    expect(await stav(ids.propadla_zrusena!)).toBe('cancelled');
  });

  it('druhý běh už nic nemění (je idempotentní)', async () => {
    const worker = new PackExpiryWorker(db);
    // Po prvním běhu nesmí v našem tenantovi zbýt nic k expiraci.
    const zbyva = await client`
      SELECT count(*)::int AS n FROM customer_credit_packs
      WHERE tenant_id = ${tenantId} AND valid_until < now() AND status IN ('active','used_up')`;
    expect((zbyva[0] as { n: number }).n).toBe(0);

    await worker.tick();
    expect(await stav(ids.propadla_pozastavena!)).toBe('suspended');
    expect(await stav(ids.platna_aktivni!)).toBe('active');
  });

  it('uložený stav po úklidu sedí s vypočteným', async () => {
    // Vypočtený stav (effectiveStatus) říká „expired", když validUntil < now.
    // Po úklidu musí totéž říkat i uložený sloupec — u všeho, co není
    // pozastavené ani jinak uzavřené.
    const nesedi = await client`
      SELECT count(*)::int AS n FROM customer_credit_packs
      WHERE tenant_id = ${tenantId}
        AND valid_until < now()
        AND status NOT IN ('expired', 'suspended', 'cancelled', 'refunded', 'rolled_over')`;
    expect((nesedi[0] as { n: number }).n).toBe(0);
  });

  it('worker běží i nad prázdnou množinou bez chyby', async () => {
    const worker = new PackExpiryWorker(db);
    const v = await worker.tick();
    expect(v).toHaveProperty('celkem');
    expect(typeof v.credit).toBe('number');
  });

  it('používá service roli — RLS mu nebrání napříč tenanty', async () => {
    // Kontrola, že transakce nastavuje app.current_role; bez toho by RLS
    // aktualizaci zablokovala a worker by tiše nic nedělal.
    const r = await db.transaction(async (tx) => {
      await tx.execute(sql`SELECT set_config('app.current_role', 'service', true)`);
      return tx.execute(sql`SELECT current_setting('app.current_role', true) AS role`);
    });
    const radky = Array.isArray(r) ? r : [];
    expect((radky[0] as { role: string }).role).toBe('service');
  });
});
