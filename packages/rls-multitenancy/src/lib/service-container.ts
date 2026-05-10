// Reserved DB adapter interface.
//
// Cíl: rls-multitenancy nezávisí na konkrétním DB klientu. Jakýkoliv klient,
// který implementuje `DbAdapter`, lze obalit do `withTenantContext`.
//
// V praxi adaptujeme Drizzle (`drizzle-orm/postgres-js`) v apps/api, ale tento
// modul to neví — testy mohou použít in-memory mock.

export interface DbQueryResult<T = unknown> {
  rows: T[];
  rowCount?: number;
}

export interface DbAdapter {
  /** Parametrizovaný SELECT. Implementace MUSÍ použít prepared statement. */
  query<T = unknown>(sql: string, params?: unknown[]): Promise<DbQueryResult<T>>;
  /** Parametrizovaný INSERT/UPDATE/DELETE bez RETURNING. */
  execute(sql: string, params?: unknown[]): Promise<void>;
  /** Otevře transakci a předá `tx` adapter callbacku. Auto-commit při úspěchu, rollback při hozené chybě. */
  transaction<T>(fn: (tx: DbAdapter) => Promise<T>): Promise<T>;
}
