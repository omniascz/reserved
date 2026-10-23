// Společné typy synchronizace kalendářů (Google, Outlook, CalDAV).

import type { SifrovaciKlic } from '@reserved/utils';

/** Událost z externího kalendáře, převedená do jednotného tvaru. */
export interface ExternalEvent {
  /** ID události u poskytovatele (Google event id, Graph id, CalDAV UID[+výskyt]). */
  id: string;
  /** Událost byla smazaná nebo zrušená → blok odstranit. */
  cancelled: boolean;
  /** Událost je označená „volno" (Google transparency, Outlook showAs=free, TRANSP) → neblokuje. */
  transparent: boolean;
  /** Událost vznikla z rezervace v Reserved → nekopírovat zpátky (smyčka). */
  fromReserved: boolean;
  title: string;
  /** Událost s časem. */
  timed?: { start: Date; end: Date };
  /** Celodenní událost: místní data, konec je VÝLUČNÝ (jako v iCal i Google). */
  allDay?: { startDate: string; endDate: string };
}

export interface ChangeSet {
  /** 'full' = úplný výpis okna (co v něm chybí, zmizelo); 'incremental' = jen změny. */
  mode: 'full' | 'incremental';
  events: ExternalEvent[];
  /** Kurzor pro příští inkrementální stažení (syncToken / deltaLink), nebo null. */
  nextCursor: string | null;
}

export interface InboundResult {
  created: number;
  updated: number;
  deleted: number;
  skipped: number;
}

/** Rezervace k propsání do externího kalendáře. */
export interface BookingForCalendar {
  id: string;
  startsAt: Date;
  endsAt: Date;
  customerName: string;
  customerEmail: string;
  customerPhone: string | null;
  serviceName: string | null;
  referenceCode: string;
}

/** Konfigurace — adresy API jdou přepsat kvůli testům (falešné servery). */
export interface CalendarSyncConfig {
  /** Klíč pro šifrování přístupů v DB (nactiKlic z PAYMENT_CONFIG_KEY). */
  encryptionKey: SifrovaciKlic;
  google?: {
    clientId: string;
    clientSecret: string;
    apiBase?: string;
    tokenUrl?: string;
  };
  microsoft?: {
    clientId: string;
    clientSecret: string;
    redirectUri?: string;
    graphBase?: string;
    tokenUrl?: string;
  };
  /**
   * Veřejná HTTPS adresa API (bez /api/v1) pro push notifikace. Bez ní se
   * push nezakládá a změny se stahují jen pravidelně (worker).
   */
  publicApiUrl?: string | null;
  /** Tajemství pro podpis tokenu push kanálu (ověření, že notifikace je naše). */
  pushSecret?: string;
}
