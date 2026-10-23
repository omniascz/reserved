// Opakování odchozích webhooků z fronty v DB.
//
// Malý HTTP server v testu odpovídá podle cesty (/ok → 200, /chyba → 500,
// /spatne → 404). Ověřuje se:
//   - zralé 'pending' doručení se doručí → 'sent' a počítadlo chyb se vynuluje,
//   - 5xx → zůstane 'pending', attempts +1, další pokus až za 5 min,
//   - 4xx → 'failed' hned (nemá smysl opakovat),
//   - poslední povolený pokus → 'failed' a počítadlo webhooku +1,
//   - pozastavený webhook → 'failed' bez odeslání,
//   - nezralé doručení (next_attempt_at v budoucnu) se nechá být (protikontrola).

import { createServer, type Server } from 'node:http';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { drizzle } from 'drizzle-orm/postgres-js';
import postgres from 'postgres';
import { schema } from '@reserved/db';
import { signWebhookBody } from '@reserved/utils';
import { WebhookDeliveriesWorker } from '../webhook-deliveries.worker.js';

const DB_URL = process.env.DATABASE_URL ?? 'postgresql://dev:dev@localhost:5433/reserved_dev';
const client = postgres(DB_URL, { max: 3 });
const db = drizzle(client, { schema });

const znacka = `wd-${Date.now().toString(36)}`;
let tenantId: string;
let server: Server;
let base: string;
const prijato: Array<{ path: string; body: string; signature: string; attempt: string }> = [];

async function webhook(path: string, opts: { active?: boolean; errors?: number } = {}) {
  const [w] = await client`
    INSERT INTO outgoing_webhooks (tenant_id, name, url, secret, event_types, is_active, consecutive_errors)
    VALUES (${tenantId}, ${path}, ${base + path}, 'tajne', '["booking.rescheduled"]'::jsonb,
      ${opts.active ?? true}, ${opts.errors ?? 0})
    RETURNING id`;
  return (w as unknown as { id: string }).id;
}

async function doruceni(
  webhookId: string,
  attempts: number,
  zralost = "now() - interval '1 second'",
) {
  const [d] = await client.unsafe(
    `INSERT INTO webhook_deliveries (tenant_id, webhook_id, event_type, payload, status, attempts, next_attempt_at)
     VALUES ($1, $2, 'booking.rescheduled', '{"bookingId":"b-1"}'::jsonb, 'pending', $3, ${zralost})
     RETURNING id`,
    [tenantId, webhookId, attempts],
  );
  return (d as unknown as { id: string }).id;
}

async function stav(id: string) {
  const [r] = await client`
    SELECT status, attempts, next_attempt_at, response_status FROM webhook_deliveries WHERE id = ${id}`;
  return r as {
    status: string;
    attempts: number;
    next_attempt_at: Date | null;
    response_status: number | null;
  };
}

describe('WebhookDeliveriesWorker', () => {
  beforeAll(async () => {
    server = createServer((req, res) => {
      let body = '';
      req.on('data', (c) => (body += c));
      req.on('end', () => {
        prijato.push({
          path: req.url ?? '',
          body,
          signature: String(req.headers['x-reserved-signature'] ?? ''),
          attempt: String(req.headers['x-reserved-attempt'] ?? ''),
        });
        const status = req.url === '/ok' ? 200 : req.url === '/spatne' ? 404 : 500;
        res.writeHead(status).end();
      });
    });
    await new Promise<void>((r) => server.listen(0, '127.0.0.1', r));
    const addr = server.address();
    base = `http://127.0.0.1:${typeof addr === 'object' && addr ? addr.port : 0}`;

    const [t] = await client`
      INSERT INTO tenants (slug, name, plan, status)
      VALUES (${znacka}, ${'Webhooky ' + znacka}, 'starter', 'active') RETURNING id`;
    tenantId = (t as { id: string }).id;
  });

  afterAll(async () => {
    await client`DELETE FROM webhook_deliveries WHERE tenant_id = ${tenantId}`;
    await client`DELETE FROM outgoing_webhooks WHERE tenant_id = ${tenantId}`;
    await client`DELETE FROM tenants WHERE id = ${tenantId}`;
    await client.end();
    await new Promise<void>((r) => server.close(() => r()));
  });

  it('doručí, odloží, vzdá a nezralé nechá být', async () => {
    const wOk = await webhook('/ok', { errors: 3 });
    const wChyba = await webhook('/chyba');
    const wSpatne = await webhook('/spatne');
    const wPosledni = await webhook('/chyba', { errors: 4 });
    const wPozastaveny = await webhook('/ok', { active: false });

    const dOk = await doruceni(wOk, 1);
    const dChyba = await doruceni(wChyba, 1);
    const dSpatne = await doruceni(wSpatne, 1);
    const dPosledni = await doruceni(wPosledni, 5); // 6. pokus = poslední
    const dPozastaveny = await doruceni(wPozastaveny, 1);
    const dNezrale = await doruceni(wOk, 1, "now() + interval '10 minutes'");

    const worker = new WebhookDeliveriesWorker(db);
    // Fronta je sdílená — tikej, dokud naše zralá doručení nezpracuje.
    for (let i = 0; i < 5 && (await stav(dOk)).status === 'pending'; i++) await worker.tick();

    // Doručeno: 2. pokus, platný podpis, počítadlo chyb vynulované.
    expect(await stav(dOk)).toMatchObject({ status: 'sent', attempts: 2, response_status: 200 });
    const req = prijato.find((p) => p.path === '/ok')!;
    expect(req.attempt).toBe('2');
    expect(req.signature).toBe(`sha256=${signWebhookBody(req.body, 'tajne')}`);
    const [ok] = await client`SELECT consecutive_errors FROM outgoing_webhooks WHERE id = ${wOk}`;
    expect(ok?.consecutive_errors).toBe(0);

    // 5xx → znovu později (2. pokus → další až za 5 min).
    const chyba = await stav(dChyba);
    expect(chyba).toMatchObject({ status: 'pending', attempts: 2, response_status: 500 });
    const zaMin = (new Date(chyba.next_attempt_at!).getTime() - Date.now()) / 60_000;
    expect(zaMin).toBeGreaterThan(4);
    expect(zaMin).toBeLessThan(6);

    // 4xx → vzdát hned.
    expect(await stav(dSpatne)).toMatchObject({ status: 'failed', attempts: 2 });

    // Poslední pokus nevyšel → 'failed' a webhook se pozastaví (4 + 1 = 5).
    expect(await stav(dPosledni)).toMatchObject({ status: 'failed', attempts: 6 });
    const [posl] = await client`
      SELECT consecutive_errors, is_active FROM outgoing_webhooks WHERE id = ${wPosledni}`;
    expect(posl).toMatchObject({ consecutive_errors: 5, is_active: false });

    // Pozastavený webhook → nic se neposílá.
    expect(await stav(dPozastaveny)).toMatchObject({ status: 'failed', attempts: 1 });

    // Nezralé doručení zůstalo netknuté.
    expect(await stav(dNezrale)).toMatchObject({ status: 'pending', attempts: 1 });
    expect(prijato.filter((p) => p.path === '/ok')).toHaveLength(1);
  });
});
