// Sprint 10.4 — migrátor z PulseUpu do Reserved.
// Reference: Ticketarium pulseup-migration.
//
// Importuje data z PulseUp exportu (JSON) do EXISTUJÍCÍHO tenanta v Reserved.
// Vlastnosti:
//   - deterministická ID (uuid v5 z pulseup id) → re-import je idempotentní
//   - FK-aware pořadí: branches → customers → services → bookings
//   - mapování stavů rezervací CZ→EN
//   - dry-run: spočítá co by se importovalo, nic nezapíše
//
// CLI:  tsx src/pulseup-import.ts <tenantId> <export.json> [--dry-run]
// Programově: importPulseUp(sql, { tenantId, data, dryRun })

import { createHash } from 'node:crypto';
import type { Sql } from 'postgres';

const NS = 'reserved:pulseup';

/** Deterministické UUID (v5-style) z namespace + jména — stejný vstup → stejné id. */
export function deterministicUuid(name: string): string {
  const hex = createHash('sha1').update(`${NS}:${name}`).digest('hex').slice(0, 32).split('');
  hex[12] = '5'; // verze 5
  hex[16] = ['8', '9', 'a', 'b'][parseInt(hex[16]!, 16) % 4]!; // varianta
  const s = hex.join('');
  return `${s.slice(0, 8)}-${s.slice(8, 12)}-${s.slice(12, 16)}-${s.slice(16, 20)}-${s.slice(20, 32)}`;
}

// ─── Vstupní formát PulseUp exportu ──────────────────────────────────────

export interface PulseUpBranch {
  id: string;
  name: string;
  slug?: string;
  address?: string;
  city?: string;
  phone?: string;
  email?: string;
}
export interface PulseUpCustomer {
  id: string;
  firstName: string;
  lastName: string;
  email: string;
  phone?: string;
}
export interface PulseUpService {
  id: string;
  name: string;
  durationMinutes: number;
  priceHellers: number;
  capacity?: number;
  archetype?: string;
}
export interface PulseUpBooking {
  id: string;
  branchId: string;
  serviceId: string;
  customerId: string;
  startsAt: string; // ISO
  /** CZ stav z PulseUpu. */
  status?: string;
  customerName?: string;
  customerEmail?: string;
}
export interface PulseUpExport {
  branches?: PulseUpBranch[];
  customers?: PulseUpCustomer[];
  services?: PulseUpService[];
  bookings?: PulseUpBooking[];
}

/** Mapování stavů rezervace CZ → EN (Reserved booking status). */
const STATUS_MAP: Record<string, string> = {
  potvrzeno: 'confirmed',
  potvrzena: 'confirmed',
  zruseno: 'cancelled',
  zrusena: 'cancelled',
  storno: 'cancelled',
  dokonceno: 'completed',
  dokoncena: 'completed',
  absolvovano: 'completed',
  nedostavil_se: 'no_show',
  no_show: 'no_show',
  ceka: 'pending',
  ceka_na_potvrzeni: 'pending',
};
export function mapStatus(cz: string | undefined): string {
  if (!cz) return 'confirmed';
  return STATUS_MAP[cz.trim().toLowerCase()] ?? 'confirmed';
}

export interface ImportReport {
  branches: { imported: number; skipped: number };
  customers: { imported: number; skipped: number };
  services: { imported: number; skipped: number };
  bookings: { imported: number; skipped: number };
  dryRun: boolean;
}

function refCode(seed: string): string {
  const h = createHash('sha1')
    .update(seed)
    .digest('hex')
    .toUpperCase()
    .replace(/[0OIL1]/g, 'X');
  return `B-${h.slice(0, 4)}-${h.slice(4, 8)}`;
}

/**
 * Importuje PulseUp export do tenanta. Idempotentní (deterministická id +
 * existence-check). V dry-run režimu jen spočítá, nic nezapíše.
 */
export async function importPulseUp(
  sql: Sql,
  opts: { tenantId: string; data: PulseUpExport; dryRun?: boolean },
): Promise<ImportReport> {
  const { tenantId, data, dryRun = false } = opts;
  const report: ImportReport = {
    branches: { imported: 0, skipped: 0 },
    customers: { imported: 0, skipped: 0 },
    services: { imported: 0, skipped: 0 },
    bookings: { imported: 0, skipped: 0 },
    dryRun,
  };

  await sql
    .begin(async (tx) => {
      // RLS kontext: service role + tenant (insert/select projdou WITH CHECK).
      await tx`SELECT set_config('app.current_role', 'service', true)`;
      await tx`SELECT set_config('app.current_tenant_id', ${tenantId}, true)`;

      const exists = async (table: string, id: string): Promise<boolean> => {
        const rows = await tx.unsafe(`SELECT 1 FROM ${table} WHERE id = $1 LIMIT 1`, [id]);
        return rows.length > 0;
      };

      // 1. Branches
      for (const b of data.branches ?? []) {
        const id = deterministicUuid(`${tenantId}:branch:${b.id}`);
        if (await exists('branches', id)) {
          report.branches.skipped++;
          continue;
        }
        if (!dryRun) {
          await tx`INSERT INTO branches (id, tenant_id, name, slug, address, city, phone, email)
          VALUES (${id}, ${tenantId}, ${b.name}, ${b.slug ?? b.id},
            ${b.address ?? null}, ${b.city ?? null}, ${b.phone ?? null}, ${b.email ?? null})`;
        }
        report.branches.imported++;
      }

      // 2. Customers
      for (const c of data.customers ?? []) {
        const id = deterministicUuid(`${tenantId}:customer:${c.id}`);
        if (await exists('customers', id)) {
          report.customers.skipped++;
          continue;
        }
        if (!dryRun) {
          await tx`INSERT INTO customers (id, tenant_id, first_name, last_name, email, phone)
          VALUES (${id}, ${tenantId}, ${c.firstName}, ${c.lastName}, ${c.email}, ${c.phone ?? null})`;
        }
        report.customers.imported++;
      }

      // 3. Services
      for (const s of data.services ?? []) {
        const id = deterministicUuid(`${tenantId}:service:${s.id}`);
        if (await exists('services', id)) {
          report.services.skipped++;
          continue;
        }
        if (!dryRun) {
          await tx`INSERT INTO services
          (id, tenant_id, name, duration_minutes, price_hellers, capacity, archetype)
          VALUES (${id}, ${tenantId}, ${s.name}, ${s.durationMinutes}, ${s.priceHellers},
            ${s.capacity ?? 1}, ${s.archetype ?? null})`;
        }
        report.services.imported++;
      }

      // 4. Bookings (FK na branch/service/customer přes deterministická id)
      for (const bk of data.bookings ?? []) {
        const id = deterministicUuid(`${tenantId}:booking:${bk.id}`);
        if (await exists('bookings', id)) {
          report.bookings.skipped++;
          continue;
        }
        const branchId = deterministicUuid(`${tenantId}:branch:${bk.branchId}`);
        const serviceId = deterministicUuid(`${tenantId}:service:${bk.serviceId}`);
        const customerId = deterministicUuid(`${tenantId}:customer:${bk.customerId}`);
        const startsAt = new Date(bk.startsAt);
        // Délku dopočítáme ze služby (fallback 60 min, doladí se po importu).
        const svc = await tx.unsafe(`SELECT duration_minutes FROM services WHERE id = $1 LIMIT 1`, [
          serviceId,
        ]);
        const durationMin = (svc[0]?.duration_minutes as number | undefined) ?? 60;
        const endsAt = new Date(startsAt.getTime() + durationMin * 60_000);
        if (!dryRun) {
          await tx`INSERT INTO bookings
          (id, tenant_id, branch_id, service_id, customer_id, customer_name, customer_email,
           starts_at, ends_at, buffer_starts_at, buffer_ends_at, status, reference_code, metadata)
          VALUES (${id}, ${tenantId}, ${branchId}, ${serviceId}, ${customerId},
            ${bk.customerName ?? 'PulseUp klient'}, ${bk.customerEmail ?? 'import@pulseup.local'},
            ${startsAt}, ${endsAt}, ${startsAt}, ${endsAt}, ${mapStatus(bk.status)},
            ${refCode(`${tenantId}:${bk.id}`)}, ${sql.json({ source: 'pulseup_import', pulseupId: bk.id })})`;
        }
        report.bookings.imported++;
      }

      // Dry-run nesmí nic zapsat → rollback.
      if (dryRun) {
        throw new DryRunRollback();
      }
    })
    .catch((err: unknown) => {
      if (err instanceof DryRunRollback) return; // očekávaný rollback
      throw err;
    });

  return report;
}

class DryRunRollback extends Error {}
