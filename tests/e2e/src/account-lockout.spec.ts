// Zamykání účtu po neúspěšných přihlášeních — E2E.
//
// Všechno jde přes HTTP jako skutečný útočník nebo recepční. Do databáze se
// sahá jen tam, kde je to jediný způsob ověřit VÝSLEDEK (že se pokus zapsal)
// nebo posunout čas (že zámek po uplynutí doby sám vyprší) — čekat 15 minut
// v testu nejde.
//
// POZOR na omezovač požadavků: přihlašovací cesta má limit 20/min na dvojici
// IP+cesta. Tenhle test dělá přes 10 pokusů, takže se s ním pohybuje těsně pod
// hranicí a musí si hlídat, aby ho nepřetekl — proto má vlastní `prihlas()`,
// který 429 pozná a nahlásí srozumitelně místo toho, aby se tvářil jako chyba
// zámku.

import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import postgres from 'postgres';

const API_URL = process.env.API_URL ?? 'http://localhost:4010/api/v1';
const DB_URL = process.env.DATABASE_URL ?? 'postgresql://dev:dev@localhost:5433/reserved_dev';

const sql = postgres(DB_URL, { max: 2 });

/** Musí odpovídat konstantám v AccountLockoutService. */
const MAX_POKUSU = 10;
const ZAMEK_MINUT = 15;

function uniqueSlug(prefix: string): string {
  const ts = Date.now().toString(36);
  const rand = Math.random().toString(36).slice(2, 6);
  return `${prefix}-${ts}-${rand}`.slice(0, 32);
}

interface Odpoved {
  status: number;
  body: any;
}

async function call(path: string, init: RequestInit & { token?: string } = {}): Promise<Odpoved> {
  const headers: Record<string, string> = {
    'Content-Type': 'application/json',
    ...((init.headers as Record<string, string>) ?? {}),
  };
  if (init.token) headers['Authorization'] = `Bearer ${init.token}`;
  const res = await fetch(`${API_URL}${path}`, { ...init, headers });
  const text = await res.text();
  return { status: res.status, body: text ? JSON.parse(text) : undefined };
}

describe('Zamykání účtu po neúspěšných přihlášeních', () => {
  const slug = uniqueSlug('lock');
  const heslo = 'SecureTestPwd123!';
  const email = `${slug}@e2e.local`;
  let tenantId: string;
  let userId: string;

  /**
   * Přihlášení s volitelnou podvrženou IP. `X-Forwarded-For` je to, podle čeho
   * by se dala IP měnit — proto se jím ověřuje, že zámek na IP NESTOJÍ.
   */
  async function prihlas(pass: string, ip?: string): Promise<Odpoved> {
    const headers: Record<string, string> = { 'X-Tenant-ID': slug };
    if (ip) headers['X-Forwarded-For'] = ip;

    // ROZPOČET PŘIHLÁŠENÍ JE SDÍLENÝ, NE MŮJ.
    // Omezovač klíčuje podle IP a cesty, takže limit 20/min na `/auth/login`
    // vyčerpají i JINÉ soubory v sadě (test omezovače dělá sérii neúspěšných
    // přihlášení). Když se to stane, tenhle test se ničeho nedopočítá a padne
    // na 429 — což by vypadalo jako chyba zámku, ale je to jen vyčerpaný
    // rozpočet.
    //
    // Řešení: počkat PODLE HODNOTY, kterou omezovač sám pošle, a zkusit znovu.
    // Limit se nezvyšuje ani neobchází — test se přizpůsobuje produkční
    // ochraně, ne naopak.
    for (let pokus = 1; pokus <= 3; pokus++) {
      const r = await call('/auth/login', {
        method: 'POST',
        headers,
        body: JSON.stringify({ email, password: pass }),
      });
      if (r.status !== 429) return r;

      const sekund = r.body?.error?.details?.retryAfterSeconds ?? 60;
      // eslint-disable-next-line no-console
      console.log(`[lockout] omezovač vrátil 429, čekám ${sekund} s (pokus ${pokus}/3)`);
      await new Promise((res) => setTimeout(res, Math.min(sekund + 1, 65) * 1000));
    }
    throw new Error('Omezovač požadavků vracel 429 i na třetí pokus — test nemohl proběhnout.');
  }

  /**
   * Založí master admina přímo v databázi (hash hesla se vezme od uživatele
   * tenanta, aby se nemusel počítat argon2 v testu) a přihlásí ho.
   */
  const masterEmail = `master.${Date.now().toString(36)}@e2e.local`;
  async function zalozMasterAdminaAVratToken(): Promise<string> {
    const [u] = await sql`SELECT password_hash FROM users WHERE id = ${userId}`;
    await sql`
      INSERT INTO platform_admins (email, password_hash, first_name, last_name, is_active)
      VALUES (${masterEmail}, ${(u as { password_hash: string }).password_hash},
              'Master', 'Testovací', true)
      ON CONFLICT (email) DO NOTHING`;

    const r = await call('/platform/auth/login', {
      method: 'POST',
      body: JSON.stringify({ email: masterEmail, password: heslo }),
    });
    if (r.status >= 400) {
      throw new Error(`přihlášení master admina: [${r.status}] ${JSON.stringify(r.body)}`);
    }
    return r.body.accessToken ?? r.body.tokens?.accessToken;
  }

  /**
   * Zamkne účet zápisem pokusů přímo do evidence.
   *
   * PROČ NE PŘES HTTP: přihlašovací cesta má limit 20/min a celá sada by ho
   * vyčerpala — testy by pak padaly na 429 místo na to, co měří. Přes HTTP
   * proto jde jen ověření DŮSLEDKU (odmítnutí, odemčení), ne naplňování
   * počítadla.
   */
  async function zamkniPrimoVEvidenci(): Promise<void> {
    await sql`UPDATE login_attempts SET resolved_at = now()
              WHERE tenant_id = ${tenantId} AND resolved_at IS NULL`;
    await sql`
      INSERT INTO login_attempts (tenant_id, email, user_id, ip_address, reason)
      SELECT ${tenantId}, ${email}, ${userId}, '198.51.100.10', 'bad_password'
      FROM generate_series(1, ${MAX_POKUSU + 1})`;
  }

  /** Posune všechny nevyřešené pokusy do minulosti — simulace plynutí času. */
  async function posunPokusyDoMinulosti(minut: number): Promise<void> {
    await sql`
      UPDATE login_attempts
      SET created_at = created_at - (${String(minut)} || ' minutes')::interval
      WHERE tenant_id = ${tenantId} AND resolved_at IS NULL`;
  }

  beforeAll(async () => {
    const reg = await call('/auth/register', {
      method: 'POST',
      body: JSON.stringify({
        tenantSlug: slug,
        tenantName: `Lock Studio ${slug}`,
        email,
        password: heslo,
        firstName: 'Zámek',
        lastName: 'Testovací',
        currency: 'CZK',
        locale: 'cs-CZ',
      }),
    });
    if (reg.status >= 400) throw new Error(`registrace: [${reg.status}]`);

    const [t] = await sql`SELECT id FROM tenants WHERE slug = ${slug}`;
    tenantId = (t as { id: string }).id;
    const [u] = await sql`SELECT id FROM users WHERE tenant_id = ${tenantId} LIMIT 1`;
    userId = (u as { id: string }).id;
  }, 60_000);

  // Po sobě uklidit: master admin i testovací tenanti. Bez toho by v databázi
  // po každém běhu zůstával účet s právy nad celou platformou.
  afterAll(async () => {
    // POŘADÍ JE POVINNÉ: auditní záznam o odemčení ukazuje na master admina
    // s pravidlem RESTRICT, takže admina nejde smazat dřív než jeho stopu.
    // (Na tomhle úklid poprvé spadl a v databázi zůstávaly účty s právy nad
    // celou platformou.)
    await sql`
      DELETE FROM platform_admin_actions
      WHERE admin_id IN (SELECT id FROM platform_admins WHERE email = ${masterEmail})`;
    await sql`DELETE FROM platform_admins WHERE email = ${masterEmail}`;
    await sql`DELETE FROM tenants WHERE slug LIKE 'lock-%' OR slug LIKE 'lock2-%'`;
  });

  // ─── EVIDENCE ────────────────────────────────────────────────────────────

  it('neúspěšný pokus se zaznamená — kdy, k jakému účtu, odkud', async () => {
    const r = await prihlas('UplneSpatneHeslo1!', '198.51.100.7');
    expect(r.status).toBe(401);
    expect(r.body.error.code).toBe('INVALID_CREDENTIALS');

    const rows = await sql`
      SELECT email, user_id, ip_address, reason, resolved_at, created_at
      FROM login_attempts WHERE tenant_id = ${tenantId} ORDER BY created_at DESC LIMIT 1`;
    expect(rows.length).toBe(1);
    const z = rows[0] as Record<string, unknown>;
    expect(z.email).toBe(email.toLowerCase());
    expect(z.user_id).toBe(userId);
    expect(z.reason).toBe('bad_password');
    expect(z.resolved_at).toBeNull();
    expect(z.created_at).toBeInstanceOf(Date);
    // IP se eviduje kvůli auditu.
    expect(String(z.ip_address ?? '')).not.toBe('');
  });

  it('pokus na NEEXISTUJÍCÍ e-mail se eviduje taky — a nevyzradí, že účet není', async () => {
    const neexistujici = `nikdo.${Date.now().toString(36)}@e2e.local`;
    const r = await call('/auth/login', {
      method: 'POST',
      headers: { 'X-Tenant-ID': slug },
      body: JSON.stringify({ email: neexistujici, password: 'cokoliv' }),
    });
    expect(r.status).toBe(401);
    // Stejná chyba jako u špatného hesla — jinak by šlo zjišťovat, které
    // e-maily v systému existují.
    expect(r.body.error.code).toBe('INVALID_CREDENTIALS');

    const [z] = await sql`
      SELECT reason, user_id FROM login_attempts
      WHERE tenant_id = ${tenantId} AND email = ${neexistujici} LIMIT 1`;
    expect((z as { reason: string }).reason).toBe('unknown_user');
    expect((z as { user_id: string | null }).user_id).toBeNull();
  });

  // ─── ÚSPĚCH NULUJE POČÍTADLO ─────────────────────────────────────────────

  it('úspěšné přihlášení vynuluje počítadlo', async () => {
    const pred = await sql`
      SELECT count(*)::int AS n FROM login_attempts
      WHERE tenant_id = ${tenantId} AND email = ${email} AND resolved_at IS NULL`;
    expect((pred[0] as { n: number }).n).toBeGreaterThan(0);

    const ok = await prihlas(heslo);
    expect(ok.status).toBe(200);

    const po = await sql`
      SELECT count(*)::int AS n FROM login_attempts
      WHERE tenant_id = ${tenantId} AND email = ${email} AND resolved_at IS NULL`;
    expect((po[0] as { n: number }).n).toBe(0);

    // Řádky se ale NEMAŽOU — zůstávají kvůli auditu, jen už nezamykají.
    const audit = await sql`
      SELECT count(*)::int AS n FROM login_attempts
      WHERE tenant_id = ${tenantId} AND email = ${email} AND resolved_at IS NOT NULL`;
    expect((audit[0] as { n: number }).n).toBeGreaterThan(0);
  });

  // ─── ZÁMEK ───────────────────────────────────────────────────────────────

  it(`po ${MAX_POKUSU} chybných pokusech se účet zamkne a chyba to srozumitelně řekne`, async () => {
    // ROZPOČET PŘIHLÁŠENÍ: přihlašovací cesta má limit 20/min na IP a celá sada
    // ho v jednom běhu snadno vyčerpá. Utrácí se proto tam, kde na tom záleží:
    // prvních 9 shodných pokusů je jen výplň a zapíše se do evidence přímo,
    // ale HRANICI PŘEKRAČUJE SKUTEČNÉ VOLÁNÍ API — tedy se pořád ověřuje, že
    // reálná přihlašovací cesta pokus zaznamená i vyhodnotí.
    await sql`UPDATE login_attempts SET resolved_at = now()
              WHERE tenant_id = ${tenantId} AND resolved_at IS NULL`;
    await sql`
      INSERT INTO login_attempts (tenant_id, email, user_id, ip_address, reason)
      SELECT ${tenantId}, ${email}, ${userId}, '198.51.100.10', 'bad_password'
      FROM generate_series(1, ${MAX_POKUSU - 1})`;

    // Desátý pokus jde přes API — po něm musí být účet zamčený.
    const desaty = await prihlas('UplneSpatneHeslo1!');
    expect(desaty.status).toBe(401);
    expect(desaty.body.error.code).toBe('INVALID_CREDENTIALS');

    const zamceny = await prihlas('UplneSpatneHeslo1!');
    expect(zamceny.status).toBe(401);
    expect(zamceny.body.error.code).toBe('ACCOUNT_LOCKED');
    // Srozumitelně, ne obecné „špatné heslo".
    expect(zamceny.body.error.message).toMatch(/uzamčen/i);
    expect(zamceny.body.error.message).toMatch(/\d+ min/);
    expect(zamceny.body.error.details.retryAfterSeconds).toBeGreaterThan(0);
  }, 60_000);

  it('zámek platí i se SPRÁVNÝM heslem — jinak by nechránil nic', async () => {
    const r = await prihlas(heslo);
    expect(r.status).toBe(401);
    expect(r.body.error.code).toBe('ACCOUNT_LOCKED');
  });

  it('ZÁMEK NEJDE OBEJÍT Z JINÉ IP', async () => {
    // Jádro věci: kdyby se počítalo podle IP, stačí přepnout na mobilní data.
    //
    // POZOR NA PRÁZDNÝ TEST: API hlavičce `X-Forwarded-For` NEDŮVĚŘUJE (ověřeno
    // měřením — obě volání se zapsala jako `::1`), a je to tak správně, jinak
    // by si útočník adresu podvrhl. Posílat různé hlavičky by tedy nedokázalo
    // vůbec nic: všechny pokusy vypadají stejně.
    //
    // Proto se různé adresy zapíšou PŘÍMO DO EVIDENCE a teprve pak se ověří,
    // že zámek platí dál. Tím se měří to, oč jde: vyhodnocení zámku s IP vůbec
    // nepracuje.
    await sql`UPDATE login_attempts SET resolved_at = now()
              WHERE tenant_id = ${tenantId} AND resolved_at IS NULL`;

    const adresy = [
      '203.0.113.1',
      '203.0.113.2',
      '198.51.100.99',
      '192.0.2.44',
      '203.0.113.9',
      '198.51.100.1',
      '192.0.2.7',
      '203.0.113.55',
      '198.51.100.23',
      '192.0.2.99',
      '203.0.113.200',
    ];
    for (const ip of adresy) {
      await sql`
        INSERT INTO login_attempts (tenant_id, email, ip_address, reason)
        VALUES (${tenantId}, ${email}, ${ip}, 'bad_password')`;
    }

    // Každý pokus z jiné adresy — a účet je přesto zamčený.
    const ruznych = await sql`
      SELECT count(DISTINCT ip_address)::int AS n FROM login_attempts
      WHERE tenant_id = ${tenantId} AND email = ${email} AND resolved_at IS NULL`;
    expect((ruznych[0] as { n: number }).n).toBe(adresy.length);

    // Jedno volání stačí (rozpočet přihlášení je omezený limitem 20/min):
    // pokusy pocházejí z 11 různých adres a účet je přesto zamčený.
    const r = await prihlas(heslo, '203.0.113.250');
    expect(r.status).toBe(401);
    expect(r.body.error.code, 'zámek by šel obejít rozprostřením pokusů po IP').toBe(
      'ACCOUNT_LOCKED',
    );
  }, 60_000);

  it('majitel účtu dostane upozornění — a jen jedno za zámek', async () => {
    const zpravy = await sql`
      SELECT count(*)::int AS n FROM notifications
      WHERE tenant_id = ${tenantId} AND template_code = 'account_locked'
        AND recipient = ${email}`;
    // Jedno upozornění, i když po zamčení přišly další pokusy z různých IP.
    expect((zpravy[0] as { n: number }).n).toBe(1);

    const [telo] = await sql`
      SELECT subject, body FROM notifications
      WHERE tenant_id = ${tenantId} AND template_code = 'account_locked' LIMIT 1`;
    expect(String((telo as { subject: string }).subject)).toMatch(/uzamčen/i);
    expect(String((telo as { body: string }).body)).toContain(String(ZAMEK_MINUT));
  });

  // ─── AUTOMATICKÉ ODEMČENÍ ────────────────────────────────────────────────

  it('po uplynutí doby se účet odemkne sám', async () => {
    // Posun času: pokusy se tváří jako starší než okno, takže přestanou zamykat.
    await posunPokusyDoMinulosti(ZAMEK_MINUT + 5);

    const r = await prihlas(heslo);
    expect(r.status).toBe(200);
    expect(r.body.accessToken).toBeTruthy();
  });

  // ─── RUČNÍ ODEMČENÍ (MASTER ADMIN) ───────────────────────────────────────

  it('master admin účet odemkne ručně a zůstane po tom auditní stopa', async () => {
    // Zamknutí se vyrábí ZÁPISEM DO EVIDENCE, ne opakovaným voláním API.
    // Přes HTTP by to znamenalo dalších 11 přihlášení a celá sada by přetekla
    // omezovač (20/min) — test by pak padal na 429 a měřil něco jiného, než
    // tvrdí. Přes HTTP jde jen to podstatné: že zamčený účet je odmítnut a že
    // po odemčení projde.
    await zamkniPrimoVEvidenci();
    const zamceny = await prihlas(heslo);
    expect(zamceny.body.error.code).toBe('ACCOUNT_LOCKED');

    // Master admina si test ZAKLÁDÁ SÁM. Seed ho schválně nevytváří a žádné
    // výchozí heslo neexistuje — `seed-platform-admin.ts` má v hlavičce
    // napsáno, že e-mail ani heslo nejsou v kódu. Spoléhat na vymyšlené
    // přihlašovací údaje by znamenalo test, který spadne na přihlášení a bude
    // to vypadat jako chyba odemykání.
    const adminToken = await zalozMasterAdminaAVratToken();

    const odemceni = await call(`/platform/tenants/${tenantId}/users/${userId}/unlock`, {
      method: 'POST',
      token: adminToken,
    });
    expect(odemceni.status).toBe(201);
    expect(odemceni.body.data.uvolnenoPokusu).toBeGreaterThan(0);

    // A hned se dá přihlásit.
    const r = await prihlas(heslo);
    expect(r.status).toBe(200);

    // Auditní stopa: kdo, kdy, nad kým.
    const [audit] = await sql`
      SELECT action, target_id, payload FROM platform_admin_actions
      WHERE action = 'tenant_user_unlocked' AND target_id = ${tenantId}
      ORDER BY created_at DESC LIMIT 1`;
    expect(audit).toBeDefined();
    expect((audit as { payload: Record<string, unknown> }).payload.userId).toBe(userId);
  }, 90_000);

  it('cizí tenant účet neodemkne', async () => {
    const adminToken = await zalozMasterAdminaAVratToken();

    // Uživatel patří jinému tenantovi než ten v URL → 404, a neprozradí se,
    // že takový účet existuje.
    //
    // Cizího tenanta si test ZAKLÁDÁ SÁM. Dřív ho hledal dotazem „vezmi
    // jakéhokoli jiného tenanta", jenže na čisté databázi žádný jiný být
    // nemusí — test pak spadl na nedefinované hodnotě, ne na tom, co měří.
    const cizi = uniqueSlug('lock-cizi');
    const [ct] = await sql`
      INSERT INTO tenants (slug, name, plan, status)
      VALUES (${cizi}, ${'Cizí ' + cizi}, 'starter', 'active')
      RETURNING id`;
    const ciziTenantId = (ct as { id: string }).id;

    const r = await call(`/platform/tenants/${ciziTenantId}/users/${userId}/unlock`, {
      method: 'POST',
      token: adminToken,
    });
    expect(r.status).toBe(404);
    expect(r.body.error.code).toBe('USER_NOT_FOUND');

    await sql`DELETE FROM tenants WHERE id = ${ciziTenantId}`;
  });

  // ─── IZOLACE TENANTŮ ─────────────────────────────────────────────────────

  it('pokusy jednoho tenanta nezamknou stejný e-mail u tenanta jiného', async () => {
    // Stejná adresa může být účtem ve dvou salonech. Zámek se váže na dvojici
    // (tenant, e-mail), takže hádání u jednoho nesmí vyřadit druhý.
    const slug2 = uniqueSlug('lock2');
    const email2 = `${slug2}@e2e.local`;
    const reg = await call('/auth/register', {
      method: 'POST',
      body: JSON.stringify({
        tenantSlug: slug2,
        tenantName: `Druhý ${slug2}`,
        email: email2,
        password: heslo,
        firstName: 'Druhý',
        lastName: 'Tenant',
        currency: 'CZK',
        locale: 'cs-CZ',
      }),
    });
    expect(reg.status).toBe(201);

    const [t2] = await sql`SELECT id FROM tenants WHERE slug = ${slug2}`;
    const tenant2 = (t2 as { id: string }).id;

    // Zamkneme účet v prvním tenantovi (přímým zápisem, ať nevyčerpáme limit).
    await zamkniPrimoVEvidenci();

    // Že je první tenant zamčený, se ověří z evidence, ne dalším voláním API —
    // rozpočet přihlášení je vyčerpaný a volání navíc by spadlo na 429.
    const [zamceno] = await sql`
      SELECT count(*)::int AS n FROM login_attempts
      WHERE tenant_id = ${tenantId} AND email = ${email} AND resolved_at IS NULL`;
    expect((zamceno as { n: number }).n).toBeGreaterThanOrEqual(MAX_POKUSU);

    // Druhý tenant se přihlásí bez problému.
    const druhy = await call('/auth/login', {
      method: 'POST',
      headers: { 'X-Tenant-ID': slug2 },
      body: JSON.stringify({ email: email2, password: heslo }),
    });
    expect(druhy.status).toBe(200);

    const [pocet] = await sql`
      SELECT count(*)::int AS n FROM login_attempts WHERE tenant_id = ${tenant2}`;
    expect((pocet as { n: number }).n).toBe(0);
  }, 60_000);
});
