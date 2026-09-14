import { drizzle } from 'drizzle-orm/postgres-js';
import { migrate } from 'drizzle-orm/postgres-js/migrator';
import postgres from 'postgres';

/**
 * Heslo aplikační databázové role `app_user`.
 *
 * PROČ TADY A NE V SQL: migrace 0003 roli zakládá, ale čisté SQL nemá jak
 * přečíst proměnnou prostředí — heslo tam proto bylo natvrdo (`app`). Kdyby
 * to tak zůstalo, měla by produkční databáze veřejně známé heslo k roli, pod
 * kterou běží celá aplikace.
 *
 * Přepsat samotnou migraci 0003 nejde bezpečně: je už použitá a změna souboru
 * rozbije kontrolní součet v existujících databázích. Heslo se proto nastaví
 * TADY, hned po doběhnutí migrací — a bez proměnné migrace skončí chybou.
 *
 * Hodnota se musí shodovat s heslem uvnitř `DATABASE_APP_URL`, pod kterou se
 * aplikace připojuje.
 */
function nactiHesloAppUser(): string {
  const heslo = process.env.APP_USER_PASSWORD;
  if (!heslo || heslo.trim() === '') {
    throw new Error(
      'APP_USER_PASSWORD není nastavené. Bez něj by databázová role `app_user` ' +
        'zůstala s výchozím heslem z migrace. Vygeneruj: openssl rand -base64 24',
    );
  }
  if (heslo.length < 12) {
    throw new Error('APP_USER_PASSWORD je kratší než 12 znaků — zvol delší heslo.');
  }
  return heslo;
}

async function run(): Promise<void> {
  const url = process.env.DATABASE_URL;
  if (!url) {
    throw new Error('DATABASE_URL is not set');
  }

  // Načítá se PŘED migrací schválně: ať skončíme chybou dřív, než se do
  // databáze cokoli zapíše, a ne až na půl cesty.
  const hesloAppUser = nactiHesloAppUser();

  const migrationClient = postgres(url, { max: 1 });
  const db = drizzle(migrationClient);

  console.log('Running migrations...');
  await migrate(db, { migrationsFolder: './drizzle' });
  console.log('Migrations completed.');

  // Role vzniká v migraci 0003, takže tohle musí být až po migracích.
  //
  // ALTER ROLE nepřijímá vázané parametry — heslo musí jít do příkazu jako
  // SQL literál. Uvozovky se proto zdvojují (standardní escapování v SQL),
  // ať se do příkazu nedá nic propašovat.
  const role = await migrationClient`SELECT 1 FROM pg_roles WHERE rolname = 'app_user'`;
  if (role.length > 0) {
    const literal = `'${hesloAppUser.replace(/'/g, "''")}'`;
    await migrationClient.unsafe(`ALTER ROLE app_user PASSWORD ${literal}`);
    console.log('Heslo role app_user nastaveno z APP_USER_PASSWORD.');
  } else {
    console.warn('Role app_user neexistuje — heslo se nenastavovalo.');
  }

  await migrationClient.end();
}

run().catch((err) => {
  console.error('Migration failed:', err);
  process.exit(1);
});
