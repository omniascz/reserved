// Test workeru připomínek k ověření e-mailu.
//
// Ověřuje hlavně IDEMPOTENCI: poller běží po hodině, takže bez ní by
// připomínka chodila dokola. Data si test vytváří sám a posouvá `created_at`
// do minulosti — jinak by se na připomínku po 48 h muselo čekat dva dny.

import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { drizzle } from 'drizzle-orm/postgres-js';
import { createHash } from 'node:crypto';
import postgres from 'postgres';
import { schema } from '@reserved/db';
import { VerifyRemindersWorker } from '../verify-reminders.worker.js';

const DB_URL = process.env.DATABASE_URL ?? 'postgresql://dev:dev@localhost:5433/reserved_dev';
const APP_URL = 'http://localhost:4002';
const client = postgres(DB_URL, { max: 3 });
const db = drizzle(client, { schema });

const znacka = `vr-${Date.now().toString(36)}`;
let tenantId: string;
let userId: string;
/** Druhý tenant — ověřený vlastník, nesmí dostat nic. */
let overenyTenantId: string;

async function pripominky(tid: string, kind?: string): Promise<number> {
  const r = kind
    ? await client`SELECT count(*)::int AS n FROM notifications
                   WHERE tenant_id = ${tid} AND metadata->>'kind' = ${kind}`
    : await client`SELECT count(*)::int AS n FROM notifications
                   WHERE tenant_id = ${tid} AND metadata->>'kind' LIKE 'verify_reminder%'`;
  return (r[0] as { n: number }).n;
}

describe('VerifyRemindersWorker', () => {
  beforeAll(async () => {
    const [t] = await client`
      INSERT INTO tenants (slug, name, plan, status)
      VALUES (${znacka}, ${'Verify Rem ' + znacka}, 'starter', 'trial') RETURNING id`;
    tenantId = (t as { id: string }).id;

    // NEOVĚŘENÝ vlastník registrovaný před 3 dny → má dostat připomínku po 48 h.
    const [u] = await client`
      INSERT INTO users (tenant_id, email, password_hash, first_name, last_name, role, is_active, created_at)
      VALUES (${tenantId}, ${znacka + '@e2e.local'}, 'x', 'Neo', 'Vereny', 'owner', true,
              now() - interval '3 days')
      RETURNING id`;
    userId = (u as { id: string }).id;

    const [t2] = await client`
      INSERT INTO tenants (slug, name, plan, status)
      VALUES (${znacka + '-ok'}, 'Overeny', 'starter', 'trial') RETURNING id`;
    overenyTenantId = (t2 as { id: string }).id;
    await client`
      INSERT INTO users (tenant_id, email, password_hash, first_name, last_name, role, is_active,
                         created_at, email_verified_at)
      VALUES (${overenyTenantId}, ${znacka + '-ok@e2e.local'}, 'x', 'Uz', 'Overeny', 'owner', true,
              now() - interval '3 days', now())`;
  });

  afterAll(async () => {
    for (const tid of [tenantId, overenyTenantId]) {
      await client`DELETE FROM notifications WHERE tenant_id = ${tid}`;
      await client`DELETE FROM email_verifications WHERE tenant_id = ${tid}`;
      await client`DELETE FROM users WHERE tenant_id = ${tid}`;
      await client`DELETE FROM tenants WHERE id = ${tid}`;
    }
    await client.end();
  });

  it('po 48 hodinách pošle připomínku neověřenému vlastníkovi', async () => {
    expect(await pripominky(tenantId)).toBe(0);

    const worker = new VerifyRemindersWorker(db, APP_URL);
    await worker.tick();

    expect(await pripominky(tenantId, 'verify_reminder_48h')).toBe(1);
  });

  it('OVĚŘENÉMU vlastníkovi nepošle nic', async () => {
    expect(await pripominky(overenyTenantId)).toBe(0);
  });

  it('je idempotentní — druhý běh už nic nepošle', async () => {
    const worker = new VerifyRemindersWorker(db, APP_URL);
    await worker.tick();
    await worker.tick();

    // Pořád právě jedna 48h připomínka, i po třech spuštěních celkem.
    expect(await pripominky(tenantId, 'verify_reminder_48h')).toBe(1);
  });

  it('odkaz v e-mailu obsahuje token, jehož OTISK je v databázi', async () => {
    const r = await client`
      SELECT body FROM notifications
      WHERE tenant_id = ${tenantId} AND metadata->>'kind' = 'verify_reminder_48h' LIMIT 1`;
    const body = (r[0] as { body: string }).body;

    const m = body.match(/verify-email\?token=([a-f0-9]+)/);
    expect(m, `v těle e-mailu není odkaz s tokenem:\n${body}`).not.toBeNull();

    const raw = m![1]!;
    const otisk = createHash('sha256').update(raw).digest('hex');

    const v = await client`
      SELECT count(*)::int AS n FROM email_verifications
      WHERE tenant_id = ${tenantId} AND token_hash = ${otisk} AND purpose = 'email_confirm'`;
    expect((v[0] as { n: number }).n).toBe(1);

    // A surový token se nikam neuložil.
    const surovy = await client`
      SELECT count(*)::int AS n FROM email_verifications WHERE token_hash = ${raw}`;
    expect((surovy[0] as { n: number }).n).toBe(0);
  });

  it('po 7 dnech pošle druhou připomínku — a taky jen jednou', async () => {
    // Posuneme registraci hlouběji do minulosti, ať spadne i do 7denního okna.
    await client`UPDATE users SET created_at = now() - interval '8 days' WHERE id = ${userId}`;

    const worker = new VerifyRemindersWorker(db, APP_URL);
    await worker.tick();
    await worker.tick();

    expect(await pripominky(tenantId, 'verify_reminder_7d')).toBe(1);
    // 48h připomínka se neposlala znovu.
    expect(await pripominky(tenantId, 'verify_reminder_48h')).toBe(1);
  });

  it('čerstvě registrovaný vlastník připomínku nedostane', async () => {
    const [t] = await client`
      INSERT INTO tenants (slug, name, plan, status)
      VALUES (${znacka + '-new'}, 'Cerstvy', 'starter', 'trial') RETURNING id`;
    const novyTenant = (t as { id: string }).id;
    await client`
      INSERT INTO users (tenant_id, email, password_hash, first_name, last_name, role, is_active, created_at)
      VALUES (${novyTenant}, ${znacka + '-new@e2e.local'}, 'x', 'Novy', 'Ucet', 'owner', true, now())`;

    const worker = new VerifyRemindersWorker(db, APP_URL);
    await worker.tick();

    expect(await pripominky(novyTenant)).toBe(0);

    await client`DELETE FROM notifications WHERE tenant_id = ${novyTenant}`;
    await client`DELETE FROM email_verifications WHERE tenant_id = ${novyTenant}`;
    await client`DELETE FROM users WHERE tenant_id = ${novyTenant}`;
    await client`DELETE FROM tenants WHERE id = ${novyTenant}`;
  });
});
