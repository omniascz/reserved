// Integration test PulseUp migrátoru (sprint 10.4). Vyžaduje běžící Postgres.

import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import postgres from 'postgres';
import { randomUUID } from 'node:crypto';
import {
  importPulseUp,
  deterministicUuid,
  mapStatus,
  type PulseUpExport,
} from '../pulseup-import.js';

const DATABASE_URL = process.env.DATABASE_URL ?? 'postgresql://dev:dev@localhost:5432/reserved_dev';
const sql = postgres(DATABASE_URL, { max: 4 });

const tenantImport = randomUUID();
const tenantDry = randomUUID();

const SAMPLE: PulseUpExport = {
  branches: [
    { id: 'pu-b1', name: 'Praha', slug: 'praha', city: 'Praha' },
    { id: 'pu-b2', name: 'Brno' },
  ],
  customers: [
    { id: 'pu-c1', firstName: 'Jan', lastName: 'Novák', email: 'jan@pu.local', phone: '+420111' },
    { id: 'pu-c2', firstName: 'Eva', lastName: 'Malá', email: 'eva@pu.local' },
  ],
  services: [
    {
      id: 'pu-s1',
      name: 'EMS',
      durationMinutes: 20,
      priceHellers: 50000,
      capacity: 1,
      archetype: 'ems_pristrojovy',
    },
    { id: 'pu-s2', name: 'Skupina', durationMinutes: 60, priceHellers: 25000, capacity: 12 },
  ],
  bookings: [
    {
      id: 'pu-bk1',
      branchId: 'pu-b1',
      serviceId: 'pu-s1',
      customerId: 'pu-c1',
      startsAt: '2031-10-01T10:00:00.000Z',
      status: 'potvrzeno',
    },
    {
      id: 'pu-bk2',
      branchId: 'pu-b1',
      serviceId: 'pu-s2',
      customerId: 'pu-c2',
      startsAt: '2031-10-01T12:00:00.000Z',
      status: 'zruseno',
    },
    {
      id: 'pu-bk3',
      branchId: 'pu-b2',
      serviceId: 'pu-s1',
      customerId: 'pu-c1',
      startsAt: '2031-10-02T09:00:00.000Z',
      status: 'nedostavil_se',
    },
  ],
};

async function count(table: string, tenantId: string): Promise<number> {
  const rows = await sql.unsafe(`SELECT count(*)::int AS n FROM ${table} WHERE tenant_id = $1`, [
    tenantId,
  ]);
  return (rows[0] as unknown as { n: number }).n;
}

describe('PulseUp import (e2e)', () => {
  beforeAll(async () => {
    await sql`INSERT INTO tenants (id, slug, name) VALUES
      (${tenantImport}, ${'pu-imp-' + tenantImport.slice(0, 8)}, 'PU Import'),
      (${tenantDry}, ${'pu-dry-' + tenantDry.slice(0, 8)}, 'PU Dry')`;
  });

  afterAll(async () => {
    for (const t of [tenantImport, tenantDry]) {
      await sql`DELETE FROM bookings WHERE tenant_id = ${t}`;
      await sql`DELETE FROM services WHERE tenant_id = ${t}`;
      await sql`DELETE FROM customers WHERE tenant_id = ${t}`;
      await sql`DELETE FROM branches WHERE tenant_id = ${t}`;
      await sql`DELETE FROM tenants WHERE id = ${t}`;
    }
    await sql.end();
  });

  it('deterministické UUID je stabilní a validní', () => {
    const a = deterministicUuid('x:branch:1');
    const b = deterministicUuid('x:branch:1');
    expect(a).toBe(b);
    expect(a).toMatch(/^[0-9a-f]{8}-[0-9a-f]{4}-5[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/);
  });

  it('mapuje stavy CZ→EN', () => {
    expect(mapStatus('potvrzeno')).toBe('confirmed');
    expect(mapStatus('zruseno')).toBe('cancelled');
    expect(mapStatus('nedostavil_se')).toBe('no_show');
    expect(mapStatus(undefined)).toBe('confirmed');
    expect(mapStatus('neznamy_stav')).toBe('confirmed');
  });

  it('naimportuje branches/customers/services/bookings', async () => {
    const report = await importPulseUp(sql, { tenantId: tenantImport, data: SAMPLE });
    expect(report.branches.imported).toBe(2);
    expect(report.customers.imported).toBe(2);
    expect(report.services.imported).toBe(2);
    expect(report.bookings.imported).toBe(3);

    expect(await count('branches', tenantImport)).toBe(2);
    expect(await count('customers', tenantImport)).toBe(2);
    expect(await count('services', tenantImport)).toBe(2);
    expect(await count('bookings', tenantImport)).toBe(3);

    // Stav rezervace zmapován + deterministické id sedí.
    const bkId = deterministicUuid(`${tenantImport}:booking:pu-bk2`);
    const rows = await sql.unsafe(`SELECT status FROM bookings WHERE id = $1`, [bkId]);
    expect((rows[0] as unknown as { status: string }).status).toBe('cancelled');

    // Archetyp služby se přenesl.
    const svcId = deterministicUuid(`${tenantImport}:service:pu-s1`);
    const svc = await sql.unsafe(`SELECT archetype, capacity FROM services WHERE id = $1`, [svcId]);
    const svcRow = svc[0] as unknown as { archetype: string; capacity: number };
    expect(svcRow.archetype).toBe('ems_pristrojovy');
    expect(svcRow.capacity).toBe(1);
  });

  it('re-import je idempotentní (vše skipped, žádné duplikáty)', async () => {
    const report = await importPulseUp(sql, { tenantId: tenantImport, data: SAMPLE });
    expect(report.branches.imported).toBe(0);
    expect(report.branches.skipped).toBe(2);
    expect(report.bookings.imported).toBe(0);
    expect(report.bookings.skipped).toBe(3);

    expect(await count('bookings', tenantImport)).toBe(3); // pořád 3, ne 6
    expect(await count('branches', tenantImport)).toBe(2);
  });

  it('dry-run spočítá, ale NIC nezapíše', async () => {
    const report = await importPulseUp(sql, { tenantId: tenantDry, data: SAMPLE, dryRun: true });
    expect(report.dryRun).toBe(true);
    expect(report.branches.imported).toBe(2);
    expect(report.bookings.imported).toBe(3);

    // V DB nic.
    expect(await count('branches', tenantDry)).toBe(0);
    expect(await count('customers', tenantDry)).toBe(0);
    expect(await count('bookings', tenantDry)).toBe(0);
  });
});
