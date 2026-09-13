// Auth cleanup worker — úklid evidence neúspěšných přihlášení.
//
// PROČ: bez úklidu tabulka roste donekonečna. Jediný útok na jeden účet = tisíce
// řádků, a ty tam po vyřešení nemají co dělat — zámek se počítá jen z okna
// posledních 15 minut, takže starší záznamy už nic neovlivňují. Zůstávají jen
// kvůli auditu, a ten má rozumnou dobu platnosti.
//
// RETENCE 30 DNÍ: dost dlouho na to, aby se dal dohledat incident („v úterý se
// nám někdo hrabal v účtu"), a zároveň krátko na to, aby se z evidence stal
// sklad e-mailů a IP adres. Tabulka obsahuje osobní údaje, takže ji držet déle,
// než je k něčemu, by bylo zbytečné riziko.

import { sql } from 'drizzle-orm';
import type { Database } from '../db.js';

/** Po kolika dnech se záznam o pokusu maže. */
const RETENCE_DNI = 30;

export interface AuthCleanupVysledek {
  smazano: number;
}

export class AuthCleanupWorker {
  constructor(private readonly db: Database) {}

  async tick(): Promise<AuthCleanupVysledek> {
    const smazano = await this.db.transaction(async (tx) => {
      // service role — úklid jde napříč všemi tenanty.
      await tx.execute(sql`SELECT set_config('app.current_role', 'service', true)`);

      const res = await tx.execute(
        sql`DELETE FROM login_attempts
            WHERE created_at < now() - (${RETENCE_DNI}::text || ' days')::interval
            RETURNING id`,
      );
      return Array.isArray(res) ? res.length : 0;
    });

    if (smazano > 0) {
      // eslint-disable-next-line no-console
      console.log(`[auth-cleanup] smazáno ${smazano} starých záznamů o přihlášení`);
    }

    return { smazano };
  }
}
