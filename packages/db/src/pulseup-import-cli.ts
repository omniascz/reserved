// CLI pro PulseUp import (sprint 10.4).
// Usage: DATABASE_URL=... tsx src/pulseup-import-cli.ts <tenantId> <export.json> [--dry-run]

import { readFileSync } from 'node:fs';
import postgres from 'postgres';
import { importPulseUp, type PulseUpExport } from './pulseup-import.js';

async function main(): Promise<void> {
  const [tenantId, file, ...flags] = process.argv.slice(2);
  if (!tenantId || !file) {
    console.error('Usage: tsx src/pulseup-import-cli.ts <tenantId> <export.json> [--dry-run]');
    process.exit(1);
  }
  const dryRun = flags.includes('--dry-run');
  const url = process.env.DATABASE_URL;
  if (!url) throw new Error('DATABASE_URL is not set');

  const data = JSON.parse(readFileSync(file, 'utf8')) as PulseUpExport;
  const sql = postgres(url, { max: 1 });
  try {
    const report = await importPulseUp(sql, { tenantId, data, dryRun });
    console.log(`PulseUp import ${dryRun ? '(DRY-RUN) ' : ''}hotovo:`);
    console.log(JSON.stringify(report, null, 2));
  } finally {
    await sql.end();
  }
}

main().catch((err) => {
  console.error('Import selhal:', err);
  process.exit(1);
});
