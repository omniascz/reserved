// Pack expiry worker — propadlé permanentky převede do stavu 'expired'.
//
// PROČ: uložený sloupec `status` u propadlých permanentek lhal — zůstávaly
// navždy 'active', protože je nikdo neuklízel. Čtení to dnes obchází
// vypočteným stavem (`effectiveStatus`), ale ten je pojistka, ne náhrada
// úklidu: hlášení, exporty i cizí dotazy nad DB vidí surový sloupec.
//
// PRAVIDLO: POZASTAVENÉ (`suspended`) se NESMÍ dotknout. Pozastavení je vědomé
// rozhodnutí provozovatele a expirace ho nesmí přepsat — stejné pravidlo jako
// u refundu, který pozastavenou permanentku také neoživí. Proto se aktualizují
// jen stavy 'active' a 'used_up'; 'cancelled', 'refunded' a 'rolled_over'
// zůstávají rovněž nedotčené.
//
// Běží napříč všemi tenanty jedním dotazem (jako slot-holds), ne per-tenant —
// worker nemá seznam tenantů a `set_config('app.current_role','service')`
// kontext obslouží.

import { sql } from 'drizzle-orm';
import type { Database } from '../db.js';

/** Tabulky permanentek — všechny tři mají shodně `valid_until` i `status`. */
const TABULKY = ['customer_credit_packs', 'customer_bundle_packs', 'customer_time_packs'] as const;

export interface PackExpiryVysledek {
  credit: number;
  bundle: number;
  time: number;
  celkem: number;
}

export class PackExpiryWorker {
  constructor(private readonly db: Database) {}

  async tick(): Promise<PackExpiryVysledek> {
    const vysledek = await this.db.transaction(async (tx) => {
      await tx.execute(sql`SELECT set_config('app.current_role', 'service', true)`);

      const pocty: number[] = [];
      for (const tabulka of TABULKY) {
        const res = await tx.execute(
          sql`UPDATE ${sql.identifier(tabulka)}
              SET status = 'expired', updated_at = now()
              WHERE valid_until IS NOT NULL
                AND valid_until < now()
                AND status IN ('active', 'used_up')
              RETURNING id`,
        );
        pocty.push(Array.isArray(res) ? res.length : 0);
      }
      return pocty;
    });

    const [credit = 0, bundle = 0, time = 0] = vysledek;
    const celkem = credit + bundle + time;

    if (celkem > 0) {
      // eslint-disable-next-line no-console
      console.log(
        `[pack-expiry] expired ${celkem} pack(s) — credit: ${credit}, bundle: ${bundle}, time: ${time}`,
      );
    }

    return { credit, bundle, time, celkem };
  }
}
