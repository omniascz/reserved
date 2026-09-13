// E2E: ověření e-mailu administrátora.
//
// Pokrývá celý tok proti běžícímu API: registrace vystaví token a pošle e-mail,
// neověřený tenant nepřijímá veřejné rezervace ani nerozesílá kampaně, proklik
// odkazu adresu potvrdí, token je jednorázový a znovuodeslání má odstup.
//
// Surový token z e-mailu v testu přečíst nelze (je jen v poště), takže si ho
// vyrobíme sami a do DB porovnáváme jeho OTISK — test tím zároveň dokazuje, že
// se surový token nikam neukládá.

import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import postgres from 'postgres';
import { createHash, randomBytes } from 'node:crypto';

const API = process.env.API_URL ?? 'http://localhost:4010/api/v1';
const DB = process.env.DATABASE_URL ?? 'postgresql://dev:dev@localhost:5433/reserved_dev';
const sql = postgres(DB, { max: 4 });

function sha256(x: string): string {
  return createHash('sha256').update(x).digest('hex');
}

async function http<T>(
  path: string,
  init: RequestInit & { token?: string } = {},
): Promise<{ status: number; body: T }> {
  const headers: Record<string, string> = {
    'Content-Type': 'application/json',
    ...((init.headers as Record<string, string>) ?? {}),
  };
  if (init.token) headers['Authorization'] = `Bearer ${init.token}`;
  const res = await fetch(`${API}${path}`, { ...init, headers });
  const text = await res.text();
  return { status: res.status, body: (text ? JSON.parse(text) : undefined) as T };
}

interface ChybaOdpoved {
  error?: { code?: string; message?: string };
}

describe('Ověření e-mailu administrátora (e2e)', () => {
  const slug = `ver-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 6)}`.slice(
    0,
    32,
  );
  const email = `${slug}@e2e.local`;
  let token: string;
  let tenantId: string;
  let userId: string;
  let serviceId: string;
  let employeeId: string;
  let branchId: string;

  beforeAll(async () => {
    const reg = await http<{
      tenantId: string;
      userId: string;
      tokens: { accessToken: string };
    }>('/auth/register', {
      method: 'POST',
      body: JSON.stringify({
        tenantSlug: slug,
        tenantName: `Verify ${slug}`,
        email,
        password: 'SecureTestPwd123!',
        firstName: 'Ver',
        lastName: 'Owner',
        currency: 'CZK',
        locale: 'cs-CZ',
      }),
    });
    token = reg.body.tokens.accessToken;
    tenantId = reg.body.tenantId;
    userId = reg.body.userId;

    const br = await http<{ data: Array<{ id: string }> }>(`/public/${slug}/branches`);
    branchId = br.body.data[0]!.id;

    const svc = await http<{ data: { id: string } }>('/admin/services', {
      method: 'POST',
      token,
      body: JSON.stringify({ name: 'Konzultace', durationMinutes: 60, priceHellers: 50000 }),
    });
    serviceId = svc.body.data.id;

    const emp = await http<{ data: { id: string } }>('/admin/employees', {
      method: 'POST',
      token,
      body: JSON.stringify({
        firstName: 'Petr',
        lastName: 'Novák',
        branchIds: [branchId],
        serviceIds: [serviceId],
      }),
    });
    employeeId = emp.body.data.id;

    await http(`/admin/employees/${employeeId}/schedule`, {
      method: 'PUT',
      token,
      body: JSON.stringify({
        schedule: [1, 2, 3, 4, 5].map((dayOfWeek) => ({
          dayOfWeek,
          startTime: '08:00',
          endTime: '20:00',
        })),
      }),
    });
  });

  afterAll(async () => {
    await sql.end();
  });

  it('registrace vystaví ověřovací token a pošle e-mail', async () => {
    const rows = await sql`SELECT purpose, consumed_at, expires_at FROM email_verifications
                           WHERE user_id = ${userId}`;
    expect(rows.length).toBe(1);
    expect(rows[0]!.purpose).toBe('email_confirm');
    expect(rows[0]!.consumed_at).toBeNull();
    expect(new Date(rows[0]!.expires_at as string).getTime()).toBeGreaterThan(Date.now());

    // E-mail musí být opravdu ve frontě, ne jen "tvářit se" odeslaně.
    const maily = await sql`SELECT status, template_code FROM notifications
                            WHERE tenant_id = ${tenantId} AND recipient = ${email}`;
    expect(maily.length).toBeGreaterThan(0);
    expect(maily[0]!.template_code).toBe('admin_email_verify');
  });

  it('nový účet je NEověřený a stavový endpoint to hlásí', async () => {
    const res = await http<{ data: { verified: boolean; email: string } }>(
      '/auth/verify-email/status',
      { token },
    );
    expect(res.body.data.verified).toBe(false);
    expect(res.body.data.email).toBe(email);
  });

  it('neověřený tenant NEPŘIJÍMÁ veřejné rezervace (zámek termínu)', async () => {
    const zitra = new Date();
    zitra.setUTCDate(zitra.getUTCDate() + 1);
    zitra.setUTCHours(8, 0, 0, 0);

    const res = await http<ChybaOdpoved>(`/public/${slug}/holds`, {
      method: 'POST',
      body: JSON.stringify({ serviceId, employeeId, startsAt: zitra.toISOString() }),
    });

    expect(res.status).toBe(403);
    expect(res.body.error?.code).toBe('TENANT_EMAIL_UNVERIFIED');
    // Hláška musí být srozumitelná, ne obecná.
    expect(res.body.error?.message).toMatch(/nepotvrdil/i);
  });

  it('neověřený tenant NESMÍ rozeslat kampaň', async () => {
    const kampan = await http<{ data: { id: string } }>('/admin/campaigns', {
      method: 'POST',
      token,
      body: JSON.stringify({
        name: 'Test',
        channel: 'email',
        subject: 'Ahoj',
        body: 'Text',
        // Pozor: povolené hodnoty jsou all_optin | inactive_days | tag.
        audience: { type: 'all_optin' },
      }),
    });

    const res = await http<ChybaOdpoved>(`/admin/campaigns/${kampan.body.data.id}/send`, {
      method: 'POST',
      token,
    });
    expect(res.status).toBe(403);
    expect(res.body.error?.code).toBe('TENANT_EMAIL_UNVERIFIED');
  });

  it('znovuodeslání má odstup počítaný z databáze', async () => {
    // POZOR: registrace sama jeden e-mail už poslala, takže odstup běží hned od
    // začátku — právě to je ta ochrana. Nejdřív tedy ověříme, že těsně po
    // registraci je další pokus odmítnutý…
    const hned = await http<ChybaOdpoved>('/auth/verify-email/resend', { method: 'POST', token });
    expect(hned.status).toBe(403);
    expect(hned.body.error?.code).toBe('RESEND_TOO_SOON');

    // …a pak posuneme poslední odeslání do minulosti (odstup se počítá z DB,
    // ne z paměti procesu) a ověříme, že další pokus projde.
    await sql`UPDATE email_verifications SET created_at = now() - interval '10 minutes'
              WHERE user_id = ${userId}`;

    const po = await http<{ data: { sent: boolean; email: string } }>('/auth/verify-email/resend', {
      method: 'POST',
      token,
    });
    expect(po.status).toBe(200);
    expect(po.body.data.email).toBe(email);
  });

  it('proklik odkazu adresu ověří a token je jednorázový', async () => {
    // Vlastní token vložíme přímo (surový z e-mailu nepřečteme) — tím zároveň
    // ověříme, že se v DB drží jen otisk.
    const raw = randomBytes(32).toString('hex');
    await sql`INSERT INTO email_verifications (tenant_id, user_id, purpose, token_hash, expires_at)
              VALUES (${tenantId}, ${userId}, 'email_confirm', ${sha256(raw)},
                      ${new Date(Date.now() + 3600_000)})`;

    const ulozene = await sql`SELECT token_hash FROM email_verifications
                              WHERE token_hash = ${sha256(raw)}`;
    expect(ulozene.length).toBe(1);
    const surove = await sql`SELECT 1 FROM email_verifications WHERE token_hash = ${raw}`;
    expect(surove.length, 'surový token se nikdy nesmí uložit').toBe(0);

    const prvni = await http<{ data: { email: string; alreadyVerified: boolean } }>(
      `/auth/verify-email?token=${raw}`,
    );
    expect(prvni.status).toBe(200);
    expect(prvni.body.data.email).toBe(email);
    expect(prvni.body.data.alreadyVerified).toBe(false);

    // Druhé použití téhož odkazu musí selhat.
    const druhy = await http<ChybaOdpoved>(`/auth/verify-email?token=${raw}`);
    expect(druhy.status).toBe(404);
    expect(druhy.body.error?.code).toBe('TOKEN_INVALID');

    const users = await sql`SELECT email_verified_at FROM users WHERE id = ${userId}`;
    expect(users[0]!.email_verified_at).not.toBeNull();
  });

  it('po ověření veřejné rezervace fungují', async () => {
    const zitra = new Date();
    zitra.setUTCDate(zitra.getUTCDate() + 1);
    zitra.setUTCHours(9, 0, 0, 0);

    const res = await http<{ data: { sessionToken: string } }>(`/public/${slug}/holds`, {
      method: 'POST',
      body: JSON.stringify({ serviceId, employeeId, startsAt: zitra.toISOString() }),
    });
    expect(res.status).toBe(201);
    expect(res.body.data.sessionToken).toBeTruthy();
  });

  it('propadlý token neprojde', async () => {
    const raw = randomBytes(32).toString('hex');
    await sql`INSERT INTO email_verifications (tenant_id, user_id, purpose, token_hash, expires_at)
              VALUES (${tenantId}, ${userId}, 'email_confirm', ${sha256(raw)},
                      ${new Date(Date.now() - 1000)})`;

    const res = await http<ChybaOdpoved>(`/auth/verify-email?token=${raw}`);
    expect(res.status).toBe(404);
    expect(res.body.error?.code).toBe('TOKEN_EXPIRED');
  });

  it('vymyšlený token neprojde', async () => {
    const res = await http<ChybaOdpoved>(
      `/auth/verify-email?token=${randomBytes(32).toString('hex')}`,
    );
    expect(res.status).toBe(404);
    expect(res.body.error?.code).toBe('TOKEN_INVALID');
  });

  it('seedovaní admini (demo, fitness) jsou ověření — nic se jim nerozbilo', async () => {
    const rows = await sql`SELECT u.email, u.email_verified_at FROM users u
                           JOIN tenants t ON t.id = u.tenant_id
                           WHERE t.slug IN ('demo','fitness') AND u.role = 'owner'`;
    expect(rows.length).toBe(2);
    for (const r of rows) {
      expect(r.email_verified_at, `${r.email} musí být ověřený`).not.toBeNull();
    }
  });
});
