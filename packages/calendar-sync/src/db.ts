// Přístup do DB pro synchronizaci kalendářů — sdílí ho API i worker.
//
// Běží v service kontextu (RLS politiky ho pustí ke všem tenantům, stejně
// jako ostatní workery), ale tenanta nastavuje taky, ať defenzivní filtry
// a audit sedí.

import { sql } from 'drizzle-orm';
import type { PostgresJsDatabase } from 'drizzle-orm/postgres-js';
import type { schema } from '@reserved/db';

export type Db = PostgresJsDatabase<typeof schema>;
/** Transakce drizzle (pro typ parametru `tx`). */
export type Tx = Parameters<Parameters<Db['transaction']>[0]>[0];

export async function withService<T>(
  db: Db,
  tenantId: string | null,
  fn: (tx: Tx) => Promise<T>,
): Promise<T> {
  return db.transaction(async (tx) => {
    await tx.execute(sql`SELECT set_config('app.current_role', 'service', true)`);
    await tx.execute(sql`SELECT set_config('app.current_tenant_id', ${tenantId ?? ''}, true)`);
    return fn(tx);
  });
}
