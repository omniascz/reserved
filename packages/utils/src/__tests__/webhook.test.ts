import { createServer, type IncomingMessage, type Server } from 'node:http';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import {
  buildWebhookBody,
  postWebhook,
  signWebhookBody,
  webhookRetryDelayMs,
  WEBHOOK_MAX_ATTEMPTS,
} from '../webhook.js';

// Malý HTTP server: status odpovědi řídí cesta (/200, /500, /429, /404).
let server: Server;
let base: string;
const received: Array<{ headers: IncomingMessage['headers']; body: string }> = [];

beforeAll(async () => {
  server = createServer((req, res) => {
    let body = '';
    req.on('data', (c) => (body += c));
    req.on('end', () => {
      received.push({ headers: req.headers, body });
      const status = Number(req.url?.slice(1)) || 200;
      res.writeHead(status).end(`odpoved ${status}`);
    });
  });
  await new Promise<void>((r) => server.listen(0, '127.0.0.1', r));
  const addr = server.address();
  base = `http://127.0.0.1:${typeof addr === 'object' && addr ? addr.port : 0}`;
});

afterAll(async () => {
  await new Promise<void>((r) => server.close(() => r()));
});

const zaklad = {
  secret: 'tajemstvi',
  webhookId: 'w-1',
  deliveryId: 'd-1',
  eventType: 'booking.rescheduled',
  tenantId: 't-1',
  payload: { bookingId: 'b-1' },
  timestamp: new Date('2027-01-01T10:00:00.000Z'),
  attempt: 2,
  userAgent: 'Reserved-Webhook/1.0',
};

describe('postWebhook', () => {
  it('pošle podepsané tělo a hlavičky; příjemce podpis ověří', async () => {
    const r = await postWebhook({ ...zaklad, url: `${base}/200` });
    expect(r).toMatchObject({ success: true, responseStatus: 200, retryable: false });

    const req = received.at(-1)!;
    const expectedBody = buildWebhookBody(zaklad);
    expect(req.body).toBe(expectedBody);
    expect(req.headers['x-reserved-signature']).toBe(
      `sha256=${signWebhookBody(expectedBody, 'tajemstvi')}`,
    );
    expect(req.headers['x-reserved-event-type']).toBe('booking.rescheduled');
    expect(req.headers['x-reserved-delivery-id']).toBe('d-1');
    expect(req.headers['x-reserved-attempt']).toBe('2');
    expect(JSON.parse(req.body)).toMatchObject({
      timestamp: '2027-01-01T10:00:00.000Z',
      version: '1',
    });
  });

  it('5xx a 429 → zkusit znovu; 404 → trvalá chyba', async () => {
    expect((await postWebhook({ ...zaklad, url: `${base}/500` })).retryable).toBe(true);
    expect((await postWebhook({ ...zaklad, url: `${base}/429` })).retryable).toBe(true);
    const r404 = await postWebhook({ ...zaklad, url: `${base}/404` });
    expect(r404).toMatchObject({ success: false, responseStatus: 404, retryable: false });
  });

  it('nedostupný server → chyba ve výsledku (nehází) a zkusit znovu', async () => {
    const r = await postWebhook({ ...zaklad, url: 'http://127.0.0.1:1/x', timeoutMs: 2000 });
    expect(r.success).toBe(false);
    expect(r.retryable).toBe(true);
    expect(r.error).toBeTruthy();
  });
});

describe('webhookRetryDelayMs', () => {
  it('rostoucí odstupy a po posledním pokusu konec', () => {
    expect(webhookRetryDelayMs(1)).toBe(60_000);
    expect(webhookRetryDelayMs(2)).toBe(300_000);
    expect(webhookRetryDelayMs(5)).toBe(6 * 3600_000);
    expect(webhookRetryDelayMs(WEBHOOK_MAX_ATTEMPTS)).toBe(null);
  });
});
