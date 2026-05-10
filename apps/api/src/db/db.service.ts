// DbService — obaluje Drizzle a postgres-js klienta.
//
// Poskytuje:
//   - `db`              — Drizzle ORM instance pro typed queries
//   - `withRlsContext`  — helper pro běh queries v transakci s nastaveným
//                          tenant_id + role (RLS context)
//
// Architecture rule (per CLAUDE.md):
//   - Žádné mutating queries bez tenant_id ve WHERE clause
//   - withRlsContext je default — jen výjimečně používej raw db.execute

import { Inject, Injectable, OnModuleDestroy, OnModuleInit } from '@nestjs/common';
import { drizzle, type PostgresJsDatabase } from 'drizzle-orm/postgres-js';
import { sql } from 'drizzle-orm';
import postgres from 'postgres';
import { schema } from '@reserved/db';
import { DbConfig } from './db.config.js';
import type { TenantContext } from '@reserved/rls-multitenancy';

export type Database = PostgresJsDatabase<typeof schema>;

@Injectable()
export class DbService implements OnModuleInit, OnModuleDestroy {
  private client!: postgres.Sql;
  private _db!: Database;

  constructor(@Inject(DbConfig) private readonly config: DbConfig) {}

  onModuleInit(): void {
    this.client = postgres(this.config.appUrl, {
      max: this.config.poolMax,
      idle_timeout: 20,
      connect_timeout: 10,
    });
    this._db = drizzle(this.client, { schema });
  }

  async onModuleDestroy(): Promise<void> {
    await this.client?.end();
  }

  get db(): Database {
    return this._db;
  }

  /**
   * Spustí `fn` v transakci s nastaveným RLS kontextem.
   *
   * Co se děje uvnitř transakce:
   *   1. SET LOCAL ROLE app_user (pokud je connection user privilegovaný)
   *   2. set_config('app.current_role', ctx.role, true)
   *   3. set_config('app.current_tenant_id', ctx.tenantId ?? '', true)
   *   4. set_config('app.current_user_id', ctx.userId ?? '', true)
   *   5. set_config('app.current_branch_id', ctx.branchId ?? '', true)
   *   6. fn(tx) — všechny dotazy uvnitř vidí jen data tenanta
   *   7. COMMIT (auto-reset SET LOCAL hodnot)
   */
  async withRlsContext<T>(ctx: TenantContext, fn: (tx: Database) => Promise<T>): Promise<T> {
    return this._db.transaction(async (tx) => {
      // app_user role je výchozí připojení (per DATABASE_APP_URL).
      // Pokud bychom v testu nebo CI připojeni jako dev, SET LOCAL ROLE zajistí
      // konzistentní chování i v privilegovaných sezeních.
      await tx.execute(sql.raw(`SET LOCAL ROLE app_user`));
      await tx.execute(sql`SELECT set_config('app.current_role', ${ctx.role}, true)`);
      await tx.execute(
        sql`SELECT set_config('app.current_tenant_id', ${ctx.tenantId ?? ''}, true)`,
      );
      await tx.execute(sql`SELECT set_config('app.current_user_id', ${ctx.userId ?? ''}, true)`);
      await tx.execute(
        sql`SELECT set_config('app.current_branch_id', ${ctx.branchId ?? ''}, true)`,
      );

      return fn(tx);
    });
  }
}
