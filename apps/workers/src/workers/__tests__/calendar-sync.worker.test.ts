// Worker kalendářů: konfigurace z prostředí a běh nad skutečnou DB.
// Samotná synchronizace je otestovaná v packages/calendar-sync (sync.db.test.ts).

import { afterAll, describe, expect, it } from 'vitest';
import { drizzle } from 'drizzle-orm/postgres-js';
import postgres from 'postgres';
import { schema } from '@reserved/db';
import { calendarSyncConfig, CalendarSyncWorker } from '../calendar-sync.worker.js';
import type { Env } from '../../config.js';

const DB_URL = process.env.DATABASE_URL ?? 'postgresql://dev:dev@localhost:5433/reserved_dev';
const client = postgres(DB_URL, { max: 2 });
const db = drizzle(client, { schema });
const KEY = 'a1b2c3d4e5f60718293a4b5c6d7e8f90a1b2c3d4e5f60718293a4b5c6d7e8f90'; // gitleaks:allow — testovací klíč

afterAll(async () => {
  await client.end();
});

describe('calendarSyncConfig', () => {
  it('bez šifrovacího klíče je synchronizace vypnutá (přístupy by nešly přečíst)', () => {
    expect(calendarSyncConfig({} as Env)).toBe(null);
  });

  it('s klíčem sestaví konfiguraci; Google/Microsoft jen když mají ID i tajemství', () => {
    const cfg = calendarSyncConfig({
      PAYMENT_CONFIG_KEY: KEY,
      GOOGLE_CLIENT_ID: 'g',
      GOOGLE_CLIENT_SECRET: 'gs',
      MICROSOFT_CLIENT_ID: 'm',
      API_URL: 'https://api.example.cz',
    } as Env)!;
    expect(cfg.google).toMatchObject({ clientId: 'g', clientSecret: 'gs' });
    expect(cfg.microsoft).toBeUndefined(); // chybí tajemství
    expect(cfg.publicApiUrl).toBe('https://api.example.cz');
    expect(cfg.pushSecret).toBe(KEY); // bez CALENDAR_PUSH_SECRET
  });
});

describe('CalendarSyncWorker', () => {
  it('tick proběhne nad DB a vrátí souhrn', async () => {
    const cfg = calendarSyncConfig({ PAYMENT_CONFIG_KEY: KEY } as Env)!;
    const s = await new CalendarSyncWorker(db, cfg, 15).tick();
    expect(s).toEqual(
      expect.objectContaining({
        synced: expect.any(Number),
        failed: expect.any(Number),
        pushRenewed: 0, // bez veřejného HTTPS se push nezakládá
      }),
    );
  });
});
