// Calendar sync worker — kalendáře zaměstnanců (Google, Outlook, CalDAV).
//
// Každou minutu se podívá, komu je čas: připojení, kde přišel push „něco se
// změnilo", nebo kde od poslední synchronizace uplynul interval (výchozí
// 15 min — CalDAV push nemá vůbec, a bez veřejného HTTPS ani Google/Outlook).
// Stáhne změny a propíše je do bloků dostupnosti; obnoví push kanály, kterým
// končí platnost. Logika je v @reserved/calendar-sync (sdílí ji i API).
//
// Dřív se Google události stahovaly jen ručním tlačítkem v administraci.

import {
  syncDueConnections,
  type CalendarSyncConfig,
  type DueSummary,
} from '@reserved/calendar-sync';
import { nactiKlic } from '@reserved/utils';
import type { Env } from '../config.js';
import type { Database } from '../db.js';

/** Konfigurace z prostředí, nebo null, když chybí šifrovací klíč. */
export function calendarSyncConfig(env: Env): CalendarSyncConfig | null {
  if (!env.PAYMENT_CONFIG_KEY) return null;
  return {
    encryptionKey: nactiKlic(env.PAYMENT_CONFIG_KEY, 'PAYMENT_CONFIG_KEY'),
    ...(env.GOOGLE_CLIENT_ID &&
      env.GOOGLE_CLIENT_SECRET && {
        google: {
          clientId: env.GOOGLE_CLIENT_ID,
          clientSecret: env.GOOGLE_CLIENT_SECRET,
          apiBase: env.GOOGLE_API_BASE,
          tokenUrl: env.GOOGLE_TOKEN_URL,
        },
      }),
    ...(env.MICROSOFT_CLIENT_ID &&
      env.MICROSOFT_CLIENT_SECRET && {
        microsoft: {
          clientId: env.MICROSOFT_CLIENT_ID,
          clientSecret: env.MICROSOFT_CLIENT_SECRET,
          graphBase: env.MICROSOFT_GRAPH_BASE,
          tokenUrl: env.MICROSOFT_TOKEN_URL,
        },
      }),
    publicApiUrl: env.API_URL ?? null,
    pushSecret: env.CALENDAR_PUSH_SECRET ?? env.PAYMENT_CONFIG_KEY,
  };
}

export class CalendarSyncWorker {
  constructor(
    private readonly db: Database,
    private readonly cfg: CalendarSyncConfig,
    private readonly intervalMinutes: number,
  ) {}

  async tick(): Promise<DueSummary> {
    const summary = await syncDueConnections(
      {
        db: this.db,
        cfg: this.cfg,
        // eslint-disable-next-line no-console
        log: (m) => console.warn(m),
      },
      { intervalMinutes: this.intervalMinutes },
    );
    if (summary.synced + summary.failed + summary.pushRenewed > 0) {
      // eslint-disable-next-line no-console
      console.log(
        `[calendar-sync] synchronizováno ${summary.synced}, chyby ${summary.failed}, ` +
          `obnoveno push ${summary.pushRenewed}`,
      );
    }
    return summary;
  }
}
