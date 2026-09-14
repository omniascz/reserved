// Jednorázový převod: zašifruje existující `payment_methods.config`.
//
// Spustit PO migraci a PŘED spuštěním nové verze API:
//   DATABASE_URL=... PAYMENT_CONFIG_KEY=... pnpm --filter @reserved/db db:encrypt-payments
//
// ── PROČ SAMOSTATNÝ SKRIPT, A NE SQL MIGRACE ────────────────────────────────
// Čisté SQL nemá jak přečíst proměnnou prostředí ani spočítat AES-GCM. Šifrovat
// v migraci by znamenalo dostat klíč do databáze — tedy přesně to, čemu se
// šifrování vyhýbá.
//
// ── BEZPEČNÉ OPAKOVÁNÍ ──────────────────────────────────────────────────────
// Převod přeskakuje řádky, které už zašifrované jsou. Dá se pustit vícekrát
// bez rizika dvojího zašifrování. Nic nemaže — při chybě zůstane původní
// hodnota.
//
// Logika je ZÁMĚRNĚ oddělená od spouštěče (funkce `prevedPlatebniKonfigurace`),
// aby šla zavolat z testu. Skript, který jde spustit jen jako proces, se
// testuje mizerně — a tenhle sahá na přístupy k cizím penězům.

import type { Sql } from 'postgres';
import postgres from 'postgres';
import {
  konfiguraceJeZasifrovana,
  nactiKlic,
  zasifrujKonfiguraci,
  type SifrovaciKlic,
} from '@reserved/utils';

export interface VysledekPrevodu {
  zasifrovano: number;
  preskoceno: number;
  prazdne: number;
}

/**
 * Zašifruje všechny dosud nezašifrované konfigurace platebních bran.
 *
 * @param sql  otevřené připojení (volající ho i zavírá)
 * @param klic šifrovací klíč
 * @param log  kam vypisovat průběh (v testu se dá umlčet)
 */
export async function prevedPlatebniKonfigurace(
  sql: Sql,
  klic: SifrovaciKlic,
  log: (zprava: string) => void = console.log,
): Promise<VysledekPrevodu> {
  const radky = await sql<Array<{ id: string; method_type: string; config: unknown }>>`
    SELECT id, method_type, config FROM payment_methods ORDER BY created_at`;

  const vysledek: VysledekPrevodu = { zasifrovano: 0, preskoceno: 0, prazdne: 0 };

  for (const radek of radky) {
    if (konfiguraceJeZasifrovana(radek.config)) {
      vysledek.preskoceno++;
      continue;
    }

    const config = (radek.config ?? {}) as Record<string, unknown>;
    if (Object.keys(config).length === 0) {
      // Prázdnou konfiguraci nemá smysl šifrovat (zakládá ji propojení
      // Stripe Connect). Ať je v databázi vidět, že tam opravdu nic není.
      vysledek.prazdne++;
      continue;
    }

    const zabalene = zasifrujKonfiguraci(config, klic);
    // `sql.json` chce užší typ než obecný Record — obálka je vždy
    // `{ __enc: string }`, takže přetypování odpovídá skutečnosti.
    // (Mimo kontejner to prošlo, protože se balíček nepřekládal; v obrazu ano.)
    await sql`UPDATE payment_methods
              SET config = ${sql.json(zabalene as Record<string, string>)}, updated_at = now()
              WHERE id = ${radek.id}`;
    vysledek.zasifrovano++;
    log(`  ✓ ${radek.method_type} (${radek.id.slice(0, 8)}…) zašifrováno`);
  }

  // Kontrola po sobě: nesmí zůstat řádek s neprázdnou a nezašifrovanou konfigurací.
  const zbyva = await sql<Array<{ n: number }>>`
    SELECT count(*)::int AS n FROM payment_methods
    WHERE config <> '{}'::jsonb AND NOT (config ? '__enc')`;
  const pocet = zbyva[0]?.n ?? 0;
  if (pocet > 0) {
    throw new Error(`Po převodu zůstalo ${pocet} nezašifrovaných konfigurací — prověř ručně.`);
  }

  return vysledek;
}

async function run(): Promise<void> {
  const url = process.env.DATABASE_URL;
  if (!url) throw new Error('DATABASE_URL is not set');

  // Klíč se načítá PŘED připojením — ať skončíme chybou dřív, než se čehokoli
  // dotkneme.
  const klic = nactiKlic(process.env.PAYMENT_CONFIG_KEY, 'PAYMENT_CONFIG_KEY');

  const sql = postgres(url, { max: 1 });
  try {
    const v = await prevedPlatebniKonfigurace(sql, klic);
    console.log(
      `\nHotovo: zašifrováno ${v.zasifrovano}, přeskočeno (už zašifrované) ${v.preskoceno}, ` +
        `prázdných ponecháno ${v.prazdne}.`,
    );
    console.log('Ověřeno: žádná nezašifrovaná konfigurace v databázi nezůstala.');
  } finally {
    await sql.end();
  }
}

// Spustit jen jako skript, ne při importu z testu.
if (process.argv[1] && process.argv[1].includes('encrypt-payment-configs')) {
  run().catch((err) => {
    console.error('Převod selhal:', err);
    process.exit(1);
  });
}
