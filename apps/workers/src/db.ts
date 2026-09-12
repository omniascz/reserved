import { drizzle, type PostgresJsDatabase } from 'drizzle-orm/postgres-js';
import postgres from 'postgres';
import { schema } from '@reserved/db';

export type Database = PostgresJsDatabase<typeof schema>;

export function createDb(connectionString: string): { db: Database; close: () => Promise<void> } {
  const client = postgres(connectionString, {
    max: 5,
    idle_timeout: 20,
    connect_timeout: 10,
  });
  const db = drizzle(client, { schema });
  return {
    db,
    close: () => client.end(),
  };
}
