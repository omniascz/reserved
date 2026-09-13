// GDPR E2E — export osobních údajů, výmaz (anonymizace) a izolace tenantů.
//
// Test jde celý přes HTTP jako skutečný provozovatel. Do databáze sahá jen tam,
// kde je to jediný způsob, jak ověřit VÝSLEDEK výmazu — tedy že v uložených
// řádcích opravdu nezůstalo jméno ani e-mail. Kdyby se to ověřovalo jen přes
// API, test by prošel i tehdy, když endpoint vrátí hezkou odpověď a nic nesmaže.

import { describe, it, expect, beforeAll } from 'vitest';
import postgres from 'postgres';

const API_URL = process.env.API_URL ?? 'http://localhost:4010/api/v1';
const DB_URL = process.env.DATABASE_URL ?? 'postgresql://dev:dev@localhost:5433/reserved_dev';

const sql = postgres(DB_URL, { max: 2 });

function uniqueSlug(prefix: string): string {
  const ts = Date.now().toString(36);
  const rand = Math.random().toString(36).slice(2, 6);
  return `${prefix}-${ts}-${rand}`.slice(0, 32);
}

async function apiCall<T>(path: string, init: RequestInit & { token?: string } = {}): Promise<T> {
  const headers: Record<string, string> = {
    'Content-Type': 'application/json',
    ...((init.headers as Record<string, string>) ?? {}),
  };
  if (init.token) headers['Authorization'] = `Bearer ${init.token}`;
  const res = await fetch(`${API_URL}${path}`, { ...init, headers });
  const text = await res.text();
  const body = text ? JSON.parse(text) : undefined;
  if (!res.ok) throw new Error(`[${res.status}] ${path}: ${text}`);
  return body as T;
}

/** Jako apiCall, ale nehází — vrací stav i tělo, aby se daly ověřit i chyby. */
async function apiRaw(
  path: string,
  init: RequestInit & { token?: string } = {},
): Promise<{ status: number; body: any }> {
  const headers: Record<string, string> = {
    'Content-Type': 'application/json',
    ...((init.headers as Record<string, string>) ?? {}),
  };
  if (init.token) headers['Authorization'] = `Bearer ${init.token}`;
  const res = await fetch(`${API_URL}${path}`, { ...init, headers });
  const text = await res.text();
  return { status: res.status, body: text ? JSON.parse(text) : undefined };
}

interface Prostredi {
  slug: string;
  token: string;
  tenantId: string;
  svcId: string;
  empId: string;
  branchId: string;
}

/** Založí tenanta se službou, zaměstnancem a ověřeným e-mailem. */
async function zalozTenanta(prefix: string, jmeno: string): Promise<Prostredi> {
  const slug = uniqueSlug(prefix);
  const reg = await apiCall<{ tokens: { accessToken: string } }>('/auth/register', {
    method: 'POST',
    body: JSON.stringify({
      tenantSlug: slug,
      tenantName: `${jmeno} ${slug}`,
      email: `${slug}@e2e.local`,
      password: 'SecureTestPwd123!',
      firstName: 'GDPR',
      lastName: 'Owner',
      currency: 'CZK',
      locale: 'cs-CZ',
    }),
  });
  const token = reg.tokens.accessToken;

  // Nový tenant má neověřený e-mail → veřejné rezervace jsou blokované.
  await sql`UPDATE users SET email_verified_at = now()
            WHERE tenant_id = (SELECT id FROM tenants WHERE slug = ${slug})`;

  const [t] = await sql`SELECT id FROM tenants WHERE slug = ${slug}`;
  const tenantId = (t as { id: string }).id;

  const branches = await apiCall<{ data: Array<{ id: string }> }>(`/public/${slug}/branches`);
  const branchId = branches.data[0]!.id;

  const svc = await apiCall<{ data: { id: string } }>('/admin/services', {
    method: 'POST',
    token,
    body: JSON.stringify({
      name: 'Lekce GDPR',
      durationMinutes: 45,
      priceHellers: 50000,
      archetype: 'skupinova_lekce',
    }),
  });

  const emp = await apiCall<{ data: { id: string } }>('/admin/employees', {
    method: 'POST',
    token,
    body: JSON.stringify({
      firstName: 'Trenér',
      lastName: 'Gdprový',
      branchIds: [branchId],
      serviceIds: [svc.data.id],
    }),
  });

  return { slug, token, tenantId, svcId: svc.data.id, empId: emp.data.id, branchId };
}

describe('GDPR — export a výmaz osobních údajů', () => {
  let a: Prostredi; // tenant, kterému se maže
  let b: Prostredi; // cizí tenant — nesmí na data tenanta A vůbec dosáhnout

  let customerId: string;
  const zakaznikEmail = `pepa.${Date.now().toString(36)}@e2e.local`;
  const zakaznikJmeno = 'Pepa Novák';
  let hodina = 8;

  /** Přihlášením na lekci vznikne zákazník (findOrCreate) i rezervace. */
  async function prihlasNaLekci(p: Prostredi, jmeno: string, email: string): Promise<void> {
    const startsAt = `2032-05-${String(++hodina).padStart(2, '0')}T08:00:00.000Z`;
    const s = await apiCall<{ data: { id: string } }>('/admin/class-sessions', {
      method: 'POST',
      token: p.token,
      body: JSON.stringify({ serviceId: p.svcId, employeeId: p.empId, startsAt, capacity: 5 }),
    });
    await apiCall(`/public/${p.slug}/class-sessions/${s.data.id}/join`, {
      method: 'POST',
      body: JSON.stringify({ customerName: jmeno, customerEmail: email }),
    });
  }

  beforeAll(async () => {
    a = await zalozTenanta('gdpr-a', 'GDPR Studio');
    b = await zalozTenanta('gdpr-b', 'Cizí Studio');

    await prihlasNaLekci(a, zakaznikJmeno, zakaznikEmail);

    const list = await apiCall<{ data: Array<{ id: string; email: string }> }>(
      `/admin/customers?search=${encodeURIComponent(zakaznikEmail)}`,
      { token: a.token },
    );
    const found = list.data.find((c) => c.email.toLowerCase() === zakaznikEmail.toLowerCase());
    if (!found) throw new Error('Zákazník po přihlášení na lekci nevznikl');
    customerId = found.id;

    // Notifikaci zakládáme SAMI. Přihlášení na lekci přes veřejný endpoint
    // zákazníkovi žádný e-mail do fronty nedává (ověřeno dotazem do DB: jediná
    // notifikace u nového tenanta je ověřovací e-mail vlastníka). Bez tohohle
    // řádku by kontrola „po výmazu nezůstal e-mail ve frontě" procházela
    // NAPRÁZDNO — nebylo by co čistit a test by nic neměřil.
    await sql`
      INSERT INTO notifications (tenant_id, channel, template_code, recipient, subject, body, status)
      VALUES (${a.tenantId}, 'email', 'booking_confirmed', ${zakaznikEmail},
              ${`Potvrzení rezervace pro ${zakaznikJmeno}`},
              ${`Dobrý den ${zakaznikJmeno}, vaše rezervace na adrese ${zakaznikEmail} je potvrzená.`},
              'pending')`;

    // Štítek a poznámka — čisté osobní údaje, které musí výmaz smazat úplně.
    await apiCall(`/admin/customers/${customerId}/tags`, {
      method: 'POST',
      token: a.token,
      body: JSON.stringify({ tag: 'alergie na ořechy', color: null }),
    });
    await apiCall(`/admin/customers/${customerId}/notes`, {
      method: 'POST',
      token: a.token,
      body: JSON.stringify({ note: 'Klient má potíže se zády.', category: 'medical' }),
    });
  }, 60_000);

  // ─── EXPORT ──────────────────────────────────────────────────────────────

  it('export vydá profil zákazníka i jeho záznamy', async () => {
    const r = await apiCall<{ data: any }>(`/admin/gdpr/customers/${customerId}/export`, {
      token: a.token,
    });
    const exportData = r.data;

    expect(exportData.format).toBe('reserved.gdpr.export.v1');
    expect(exportData.subject).toEqual({ type: 'customer', id: customerId });
    expect(String(exportData.customer.email).toLowerCase()).toBe(zakaznikEmail.toLowerCase());
    expect(exportData.customer.first_name).toBe('Pepa');

    // Rezervace z přihlášení na lekci, štítek i poznámka musí být uvnitř.
    expect(exportData.data.bookings.length).toBeGreaterThanOrEqual(1);
    expect(exportData.data.customer_tags.length).toBe(1);
    expect(exportData.data.customer_notes.length).toBe(1);
    expect(exportData.data.customer_notes[0].note).toContain('potíže se zády');
  });

  it('export obsahuje i tabulky, které nemají vazbu na zákazníka', async () => {
    const r = await apiCall<{ data: any }>(`/admin/gdpr/customers/${customerId}/export`, {
      token: a.token,
    });
    // Tyhle klíče se hledají podle e-mailu, ne podle customer_id. Kdyby v exportu
    // chyběly, byl by tiše neúplný — právě tady se to nejsnáz přehlédne.
    for (const klic of [
      'booking_series',
      'notifications',
      'gift_vouchers',
      'referral_redemptions',
      'customer_magic_links',
      'logistics_jobs',
    ]) {
      expect(Object.keys(r.data.data)).toContain(klic);
    }
    // Notifikace na jeho adresu (viz beforeAll) → musí být v exportu vidět.
    expect(r.data.pocty.notifications).toBeGreaterThanOrEqual(1);
    expect(JSON.stringify(r.data.data.notifications)).toContain(zakaznikJmeno);
  });

  it('export je strojově čitelný — projde serializací na JSON a zpět', async () => {
    const r = await apiCall<{ data: any }>(`/admin/gdpr/customers/${customerId}/export`, {
      token: a.token,
    });
    const kolecko = JSON.parse(JSON.stringify(r.data));
    expect(kolecko.pocty).toEqual(r.data.pocty);
  });

  // ─── IZOLACE TENANTŮ (schválně PŘED výmazem) ────────────────────────────

  it('cizí tenant zákazníka nevyexportuje — a nedozví se, že existuje', async () => {
    const res = await apiRaw(`/admin/gdpr/customers/${customerId}/export`, { token: b.token });
    expect(res.status).toBe(404);
    expect(res.body.error.code).toBe('CUSTOMER_NOT_FOUND');
  });

  it('cizí tenant zákazníka nevymaže', async () => {
    const res = await apiRaw(`/admin/gdpr/customers/${customerId}/erase`, {
      method: 'POST',
      token: b.token,
      body: JSON.stringify({ confirm: true }),
    });
    expect(res.status).toBe(404);

    // A hlavně: data tenanta A jsou pořád nedotčená.
    const [zak] = await sql`SELECT email, first_name FROM customers WHERE id = ${customerId}`;
    expect(String((zak as { email: string }).email).toLowerCase()).toBe(
      zakaznikEmail.toLowerCase(),
    );
  });

  it('bez výslovného potvrzení se nemaže', async () => {
    const res = await apiRaw(`/admin/gdpr/customers/${customerId}/erase`, {
      method: 'POST',
      token: a.token,
      body: JSON.stringify({ confirm: false }),
    });
    expect(res.status).toBe(400);

    const [zak] = await sql`SELECT email FROM customers WHERE id = ${customerId}`;
    expect(String((zak as { email: string }).email).toLowerCase()).toBe(
      zakaznikEmail.toLowerCase(),
    );
  });

  // ─── VÝMAZ ───────────────────────────────────────────────────────────────

  it('výmaz proběhne a vrátí přehled, co se smazalo a co anonymizovalo', async () => {
    const r = await apiCall<{ data: any }>(`/admin/gdpr/customers/${customerId}/erase`, {
      method: 'POST',
      token: a.token,
      body: JSON.stringify({ confirm: true, reason: 'žádost zákazníka' }),
    });

    expect(r.data.anonymizedEmail).toMatch(/^anon-[0-9a-f-]+@anonymized\.invalid$/);
    expect(r.data.anonymizovano.customers).toBe(1);
    expect(r.data.smazano.customer_tags).toBe(1);
    expect(r.data.smazano.customer_notes).toBe(1);
    expect(r.data.ponechano.length).toBeGreaterThan(0);
  });

  it('v profilu zákazníka nezůstalo jméno, e-mail ani telefon', async () => {
    const [zak] = await sql`
      SELECT first_name, last_name, email, phone, date_of_birth, password_hash,
             metadata, deleted_at, is_active
      FROM customers WHERE id = ${customerId}`;
    const z = zak as Record<string, unknown>;

    expect(z.first_name).toBe('Smazaný');
    expect(z.last_name).toBe('zákazník');
    expect(String(z.email)).toMatch(/^anon-[0-9a-f-]+@anonymized\.invalid$/);
    expect(z.phone).toBeNull();
    expect(z.date_of_birth).toBeNull();
    expect(z.password_hash).toBeNull();
    expect(z.deleted_at).not.toBeNull();
    expect(z.is_active).toBe(false);
  });

  it('anonymizovaný zákazník se nedá dohledat podle původního e-mailu ani jména', async () => {
    // Tohle je jádro věci: kdyby zůstal otisk e-mailu nebo odvozená hodnota,
    // šlo by původní adresu uhodnout zkoušením. Proto se hledá napříč VŠEMI
    // textovými sloupci tabulky zákazníků.
    const nalezeno = await sql`
      SELECT count(*)::int AS n FROM customers
      WHERE id = ${customerId}
        AND (email ILIKE ${'%' + zakaznikEmail.split('@')[0] + '%'}
             OR first_name ILIKE ${'%Pepa%'}
             OR last_name ILIKE ${'%Novák%'}
             OR metadata::text ILIKE ${'%' + zakaznikEmail + '%'})`;
    expect((nalezeno[0] as { n: number }).n).toBe(0);

    // A ani přes API ho podle původního e-mailu nenajdeme.
    const list = await apiCall<{ data: Array<{ id: string }> }>(
      `/admin/customers?search=${encodeURIComponent(zakaznikEmail)}`,
      { token: a.token },
    );
    expect(list.data.find((c) => c.id === customerId)).toBeUndefined();
  });

  it('rezervace zůstala, ale bez osobních údajů — účetnictví se nerozbilo', async () => {
    const rows = await sql`
      SELECT customer_id, customer_name, customer_email, customer_phone,
             customer_note, internal_note, price_paid_hellers, status
      FROM bookings WHERE tenant_id = ${a.tenantId} AND customer_id = ${customerId}`;

    expect(rows.length).toBeGreaterThanOrEqual(1);
    for (const r of rows) {
      const b = r as Record<string, unknown>;
      // Vazba schválně zůstává — drží cizí klíče, souhrny i reporty.
      expect(b.customer_id).toBe(customerId);
      expect(b.customer_name).toBe('Smazaný zákazník');
      expect(String(b.customer_email)).toMatch(/@anonymized\.invalid$/);
      expect(b.customer_phone).toBeNull();
      expect(b.customer_note).toBeNull();
      expect(b.internal_note).toBeNull();
      // Částka a stav zůstávají — to je ten účetní záznam.
      expect(b.price_paid_hellers).not.toBeNull();
      expect(b.status).not.toBeNull();
    }
  });

  it('původní e-mail nezůstal nikde ve frontě notifikací', async () => {
    const zbytky = await sql`
      SELECT count(*)::int AS n FROM notifications
      WHERE tenant_id = ${a.tenantId}
        AND (lower(recipient) = ${zakaznikEmail.toLowerCase()}
             OR body ILIKE ${'%' + zakaznikEmail + '%'}
             OR body ILIKE ${'%Pepa Novák%'}
             OR coalesce(subject, '') ILIKE ${'%Pepa Novák%'})`;
    expect((zbytky[0] as { n: number }).n).toBe(0);

    // Kontrapól: notifikace tam pořád JE, jen anonymizovaná. Bez tohohle
    // ověření by test prošel i tehdy, kdyby se řádek prostě nikdy nezaložil
    // — a neměřil by vůbec nic.
    const anonymizovane = await sql`
      SELECT recipient, subject, body FROM notifications
      WHERE tenant_id = ${a.tenantId} AND recipient LIKE 'anon-%@anonymized.invalid'`;
    expect(anonymizovane.length).toBeGreaterThanOrEqual(1);
    expect(String((anonymizovane[0] as { body: string }).body)).toContain('obsah smazán');
    expect((anonymizovane[0] as { subject: string | null }).subject).toBeNull();
  });

  it('štítky a poznámky jsou pryč, zůstala jen auditní stopa o výmazu', async () => {
    const [t] =
      await sql`SELECT count(*)::int AS n FROM customer_tags WHERE customer_id = ${customerId}`;
    expect((t as { n: number }).n).toBe(0);

    const pozn =
      await sql`SELECT note, category FROM customer_notes WHERE customer_id = ${customerId}`;
    expect(pozn.length).toBe(1);
    expect(String((pozn[0] as { note: string }).note)).toContain('GDPR');
    expect(String((pozn[0] as { note: string }).note)).toContain('žádost zákazníka');
    // Původní zdravotní poznámka nesmí zůstat.
    expect(String((pozn[0] as { note: string }).note)).not.toContain('zády');
  });

  it('výmaz nerozbil cizí klíče — databáze je konzistentní', async () => {
    const osirele = await sql`
      SELECT count(*)::int AS n FROM bookings b
      WHERE b.tenant_id = ${a.tenantId}
        AND b.customer_id IS NOT NULL
        AND NOT EXISTS (SELECT 1 FROM customers c WHERE c.id = b.customer_id)`;
    expect((osirele[0] as { n: number }).n).toBe(0);
  });

  it('data cizího tenanta zůstala po výmazu netknutá', async () => {
    const [pocet] = await sql`
      SELECT count(*)::int AS n FROM customers
      WHERE tenant_id = ${b.tenantId} AND deleted_at IS NOT NULL`;
    expect((pocet as { n: number }).n).toBe(0);
  });

  // ─── OPRÁVNĚNÍ ───────────────────────────────────────────────────────────

  it('recepční na osobní údaje nesmí — ani je vyexportovat, ani smazat', async () => {
    // Osobní údaje celého zákazníka jsou citlivější než běžná práce s rezervací,
    // proto je smí vydat a mazat jen vlastník nebo manažer.
    //
    // JAK SE SEM DOSTANE TOKEN RECEPČNÍ — a proč zrovna takhle:
    //   - přihlášení (`/auth/login`) nejde: limit 20/min na dvojici IP+cesta
    //     celá e2e sada vyčerpá a čekání na uvolnění je delší než limit testu,
    //   - registrace + přepsání role v databázi nestačí: ROLE JE SOUČÁSTÍ UŽ
    //     VYDANÉHO TOKENU, takže ten původní dál nese `owner` a projde
    //     (přesně na tohle test poprvé spadl — vrátilo 200 místo 403),
    //   - řešení: po přepsání role si vyžádat NOVÝ token přes `/auth/refresh`.
    //     Obnovení roli načítá znovu z databáze, takže nový token už nese
    //     `receptionist`. Cesta navíc nemá přísný limit.
    const recSlug = uniqueSlug('gdpr-rec');
    const recReg = await apiCall<{ tokens: { accessToken: string; refreshToken: string } }>(
      '/auth/register',
      {
        method: 'POST',
        body: JSON.stringify({
          tenantSlug: recSlug,
          tenantName: `Recepce ${recSlug}`,
          email: `${recSlug}@e2e.local`,
          password: 'SecureTestPwd123!',
          firstName: 'Recepce',
          lastName: 'Nováková',
          currency: 'CZK',
          locale: 'cs-CZ',
        }),
      },
    );

    await sql`UPDATE users SET role = 'receptionist'
              WHERE tenant_id = (SELECT id FROM tenants WHERE slug = ${recSlug})`;

    const obnoveno = await apiCall<{ accessToken: string }>('/auth/refresh', {
      method: 'POST',
      body: JSON.stringify({ refreshToken: recReg.tokens.refreshToken }),
    });
    const recToken = obnoveno.accessToken;

    // Kontrola na VLASTNÍM zákazníkovi toho tenanta: kdyby se test ptal na
    // zákazníka tenanta A, vrátilo by se 404 (cizí tenant) a test by prošel
    // z úplně jiného důvodu, než tvrdí.
    const [recTenant] = await sql`SELECT id FROM tenants WHERE slug = ${recSlug}`;
    const [vlastniZakaznik] = await sql`
      INSERT INTO customers (tenant_id, first_name, last_name, email)
      VALUES (${(recTenant as { id: string }).id}, 'Vlastní', 'Klient',
              ${`${recSlug}-klient@e2e.local`})
      RETURNING id`;
    const cilId = (vlastniZakaznik as { id: string }).id;

    const exportRes = await apiRaw(`/admin/gdpr/customers/${cilId}/export`, {
      token: recToken,
    });
    expect(exportRes.status).toBe(403);
    expect(exportRes.body.error.code).toBe('INSUFFICIENT_ROLE');

    const eraseRes = await apiRaw(`/admin/gdpr/customers/${cilId}/erase`, {
      method: 'POST',
      token: recToken,
      body: JSON.stringify({ confirm: true }),
    });
    expect(eraseRes.status).toBe(403);

    // A zákazník po jejím pokusu zůstal nedotčený.
    const [po] = await sql`SELECT email FROM customers WHERE id = ${cilId}`;
    expect(String((po as { email: string }).email)).not.toContain('anonymized.invalid');
  });

  // ─── ZAMĚSTNANEC ─────────────────────────────────────────────────────────

  it('zaměstnance lze vyexportovat i anonymizovat', async () => {
    const exp = await apiCall<{ data: any }>(`/admin/gdpr/employees/${a.empId}/export`, {
      token: a.token,
    });
    expect(exp.data.subject).toEqual({ type: 'employee', id: a.empId });
    expect(exp.data.employee.first_name).toBe('Trenér');
    // Přístupové tokeny do exportu nepatří. Kontrolujeme DATA, ne celý dokument —
    // řetězec „refresh_token" je totiž i ve vysvětlení, PROČ se tokeny nevydávají,
    // a hledání v celém JSONu tak padalo na vlastní poznámce.
    expect(JSON.stringify(exp.data.data)).not.toContain('refresh_token');
    expect(JSON.stringify(exp.data.data)).not.toContain('access_token');
    expect(JSON.stringify(exp.data.data)).not.toContain('password_hash');

    const er = await apiCall<{ data: any }>(`/admin/gdpr/employees/${a.empId}/erase`, {
      method: 'POST',
      token: a.token,
      body: JSON.stringify({ confirm: true, reason: 'ukončení spolupráce' }),
    });
    expect(er.data.anonymizovano.employees).toBe(1);

    const [zam] = await sql`SELECT first_name, last_name, email, phone, deleted_at
                            FROM employees WHERE id = ${a.empId}`;
    const z = zam as Record<string, unknown>;
    expect(z.first_name).toBe('Smazaný');
    expect(String(z.email)).toMatch(/@anonymized\.invalid$/);
    expect(z.phone).toBeNull();
    expect(z.deleted_at).not.toBeNull();
  });

  it('cizí tenant zaměstnance nevymaže', async () => {
    const res = await apiRaw(`/admin/gdpr/employees/${a.empId}/erase`, {
      method: 'POST',
      token: b.token,
      body: JSON.stringify({ confirm: true }),
    });
    expect(res.status).toBe(404);
  });
});
