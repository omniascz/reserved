// Odeslání odchozího webhooku — sdílí ho API (první pokus hned) i worker
// (opakování z fronty v DB), aby podpis i tvar požadavku byly vždy stejné.
//
// Opakování podle vzoru cal.com (calcom/cal.diy@0f19cc4
// packages/features/tasker/tasks/webhookDelivery.ts — MIT): doručení je úloha
// v trvalé frontě, ne smyčka v paměti procesu. Dřív se při pádu API ztratilo.

import { createHmac } from 'node:crypto';

/** Verze tvaru těla webhooku. Při nekompatibilní změně zvýšit. */
export const WEBHOOK_PAYLOAD_VERSION = '1';

/** Kolikrát celkem zkusit doručit (1. pokus + opakování z fronty). */
export const WEBHOOK_MAX_ATTEMPTS = 6;

/** Odstupy před dalším pokusem: po 1. pokusu 1 min, pak 5 min, 30 min, 2 h, 6 h. */
const RETRY_DELAYS_MS = [60_000, 5 * 60_000, 30 * 60_000, 2 * 3600_000, 6 * 3600_000];

/** Za jak dlouho zkusit znovu po `attempts` neúspěšných pokusech; null = vzdát. */
export function webhookRetryDelayMs(attempts: number): number | null {
  if (attempts >= WEBHOOK_MAX_ATTEMPTS) return null;
  return RETRY_DELAYS_MS[attempts - 1] ?? null;
}

export interface WebhookRequestInput {
  url: string;
  secret: string;
  webhookId: string;
  deliveryId: string;
  eventType: string;
  tenantId: string;
  payload: unknown;
  /** Čas vzniku události — stejný pro všechny pokusy (příjemce podle něj deduplikuje). */
  timestamp: Date;
  attempt: number;
  userAgent: string;
  timeoutMs?: number;
}

export interface WebhookResult {
  success: boolean;
  responseStatus: number | null;
  responseBody: string | null;
  error: string | null;
  /** Má smysl to zkusit znovu? (síť, timeout, 5xx, 429 ano; ostatní 4xx ne) */
  retryable: boolean;
}

export function buildWebhookBody(input: {
  eventType: string;
  tenantId: string;
  payload: unknown;
  timestamp: Date;
}): string {
  return JSON.stringify({
    eventType: input.eventType,
    tenantId: input.tenantId,
    payload: input.payload,
    timestamp: input.timestamp.toISOString(),
    version: WEBHOOK_PAYLOAD_VERSION,
  });
}

export function signWebhookBody(body: string, secret: string): string {
  return createHmac('sha256', secret).update(body).digest('hex');
}

/** Jeden pokus o doručení. Nikdy nehází — chybu vrací ve výsledku. */
export async function postWebhook(input: WebhookRequestInput): Promise<WebhookResult> {
  const body = buildWebhookBody(input);
  const signature = signWebhookBody(body, input.secret);
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), input.timeoutMs ?? 10_000);
  try {
    const res = await fetch(input.url, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'X-Reserved-Signature': `sha256=${signature}`,
        'X-Reserved-Event-Type': input.eventType,
        'X-Reserved-Webhook-Id': input.webhookId,
        'X-Reserved-Delivery-Id': input.deliveryId,
        'X-Reserved-Attempt': String(input.attempt),
        'X-Reserved-Webhook-Version': WEBHOOK_PAYLOAD_VERSION,
        'User-Agent': input.userAgent,
      },
      body,
      signal: controller.signal,
    });
    const text = await res.text().catch(() => '');
    if (res.ok) {
      return {
        success: true,
        responseStatus: res.status,
        responseBody: text.slice(0, 2000),
        error: null,
        retryable: false,
      };
    }
    return {
      success: false,
      responseStatus: res.status,
      responseBody: text.slice(0, 2000),
      error: `HTTP ${res.status}: ${text.slice(0, 200)}`,
      // 4xx (kromě 429 rate-limit) je trvalá chyba → neopakovat.
      retryable: res.status >= 500 || res.status === 429,
    };
  } catch (err) {
    return {
      success: false,
      responseStatus: null,
      responseBody: null,
      error: err instanceof Error ? err.message : String(err),
      retryable: true,
    };
  } finally {
    clearTimeout(timeout);
  }
}
