// Konfigurace synchronizace kalendářů (Google, Outlook, CalDAV) z prostředí.
//
// Jen tady se čte process.env (CLAUDE.md). Adresy API Googlu / Microsoftu jdou
// přepsat proměnnými *_API_BASE / *_TOKEN_URL — JEN PRO TESTY (falešné servery).

import { Injectable } from '@nestjs/common';
import { z } from 'zod';
import { nactiKlic } from '@reserved/utils';
import type { CalendarSyncConfig } from '@reserved/calendar-sync';

const EnvSchema = z.object({
  PAYMENT_CONFIG_KEY: z.string().min(1),
  GOOGLE_CLIENT_ID: z.string().optional(),
  GOOGLE_CLIENT_SECRET: z.string().optional(),
  GOOGLE_API_BASE: z.string().url().optional(),
  GOOGLE_TOKEN_URL: z.string().url().optional(),
  MICROSOFT_CLIENT_ID: z.string().optional(),
  MICROSOFT_CLIENT_SECRET: z.string().optional(),
  MICROSOFT_REDIRECT_URI: z.string().url().optional(),
  MICROSOFT_GRAPH_BASE: z.string().url().optional(),
  MICROSOFT_TOKEN_URL: z.string().url().optional(),
  /** Veřejná adresa API (bez /api/v1) — push notifikace jen na https. */
  API_URL: z.string().optional(),
  /** Podpis tokenů push kanálů; bez něj se použije PAYMENT_CONFIG_KEY. */
  CALENDAR_PUSH_SECRET: z.string().optional(),
  /** Podpis OAuth `state` (stejně jako u Google integrace). */
  GOOGLE_STATE_SECRET: z.string().optional(),
  JWT_SECRET: z.string().optional(),
  ADMIN_BASE_URL: z.string().optional(),
});

@Injectable()
export class CalendarConfig {
  readonly sync: CalendarSyncConfig;
  readonly stateSecret: string;
  readonly adminBaseUrl: string;

  constructor() {
    const env = EnvSchema.parse(process.env);
    this.sync = {
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
            redirectUri: env.MICROSOFT_REDIRECT_URI,
            graphBase: env.MICROSOFT_GRAPH_BASE,
            tokenUrl: env.MICROSOFT_TOKEN_URL,
          },
        }),
      publicApiUrl: env.API_URL ?? null,
      pushSecret: env.CALENDAR_PUSH_SECRET ?? env.PAYMENT_CONFIG_KEY,
    };
    this.stateSecret = env.GOOGLE_STATE_SECRET ?? env.JWT_SECRET ?? env.PAYMENT_CONFIG_KEY;
    this.adminBaseUrl = (env.ADMIN_BASE_URL ?? 'http://localhost:4002').replace(/\/+$/, '');
  }
}
