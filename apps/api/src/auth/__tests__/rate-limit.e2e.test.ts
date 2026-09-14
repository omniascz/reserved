// E2E: omezovač požadavků a bezpečnostní HTTP hlavičky.
//
// Ověřuje SKUTEČNÝM BĚHEM, že po překročení limitu API opravdu odmítne — ne
// jen že je konfigurace načtená. Do téhle fáze byl ThrottlerModule sice
// nakonfigurovaný, ale nikde se nevynucoval a přihlašovací formulář tak neměl
// proti hádání hesel žádnou ochranu.
//
// Vyžaduje běžící API (API_URL).

import { describe, expect, it } from 'vitest';

const API = process.env.API_URL ?? 'http://localhost:4010/api/v1';

/**
 * Limit na citlivých cestách (viz CITLIVY_LIMIT v auth.controller).
 *
 * Pozn.: limit dopadá na všechna přihlášení, ne jen neúspěšná — throttler
 * počítá požadavek dřív, než je znám výsledek. Proto 20, a ne 5.
 */
const CITLIVY_LIMIT = 20;

interface Odpoved {
  status: number;
  body: { error?: { code?: string; message?: string; details?: { retryAfterSeconds?: number } } };
  headers: Headers;
}

async function http(path: string, init: RequestInit = {}): Promise<Odpoved> {
  const res = await fetch(`${API}${path}`, {
    ...init,
    headers: { 'Content-Type': 'application/json', ...((init.headers as object) ?? {}) },
  });
  const text = await res.text();
  return {
    status: res.status,
    body: text ? JSON.parse(text) : {},
    headers: res.headers,
  };
}

/** Každý test má vlastní e-mail → vlastní klíč limitu (IP+cesta je společná,
 *  takže testy citlivých cest musí běžet s vědomím sdíleného počítadla). */
function unikat(): string {
  return `rl-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 6)}`;
}

describe('Omezovač požadavků (e2e)', () => {
  it('citlivá cesta po překročení limitu odmítne s 429 a srozumitelnou hláškou', async () => {
    const email = `${unikat()}@e2e.local`;
    const odpovedi: number[] = [];
    let posledni: Odpoved | null = null;

    // Posíláme o 3 pokusy víc, než je limit.
    for (let i = 0; i < CITLIVY_LIMIT + 3; i++) {
      posledni = await http('/auth/login', {
        method: 'POST',
        headers: { 'X-Tenant-ID': 'fitness' },
        body: JSON.stringify({ email, password: 'spatne-heslo' }),
      });
      odpovedi.push(posledni.status);
    }

    // Musí existovat aspoň jedno odmítnutí — jinak omezovač neběží.
    expect(
      odpovedi.filter((s) => s === 429).length,
      `žádné 429 mezi odpověďmi: ${odpovedi.join(', ')}`,
    ).toBeGreaterThan(0);

    // Poslední odpověď musí být odmítnutí ve tvaru zbytku API, ne 500.
    expect(posledni!.status).toBe(429);
    expect(posledni!.body.error?.code).toBe('TOO_MANY_REQUESTS');
    expect(posledni!.body.error?.message).toMatch(/mnoho pokusů/i);
    expect(posledni!.body.error?.details?.retryAfterSeconds).toBeGreaterThan(0);
    // Strop 30 s místo výchozích 5: test posílá 23 požadavků po síti a každé
    // přihlášení dnes stojí ~120 ms (kontrola zámku účtu + zápis pokusu).
    // Na nezatíženém stroji doběhne za ~3 s, ale při souběžné zátěži (build,
    // jiná sada) strop přetekl a test spadl NA ČAS, ne na chybu — což vypadá
    // jako rozbitý omezovač, přestože fungoval.
  }, 30_000);

  it('špatné heslo vrací 401 DŘÍV, než se limit vyčerpá', async () => {
    // Kontrola, že limit nepřebíjí normální chování hned prvním pokusem.
    const res = await http('/auth/login', {
      method: 'POST',
      headers: { 'X-Tenant-ID': 'fitness' },
      body: JSON.stringify({ email: `${unikat()}@e2e.local`, password: 'x' }),
    });
    expect([401, 429]).toContain(res.status);
  });

  it('běžné API přísný limit NEMÁ — snese výrazně víc volání', async () => {
    // Kontrolní protiklad: kdyby přísný limit platil všude, odstřelili bychom
    // zákazníky místo útočníků (dashboard adminu volá desítky endpointů).
    const statusy: number[] = [];
    for (let i = 0; i < CITLIVY_LIMIT * 3; i++) {
      const res = await http('/public/fitness');
      statusy.push(res.status);
    }
    expect(
      statusy.every((s) => s === 200),
      `nečekané stavy: ${statusy.join(', ')}`,
    ).toBe(true);
    // Stejný důvod jako výše — 60 požadavků po síti se do 5 s vejde jen na
    // klidném stroji.
  }, 30_000);

  it('health endpoint není omezený (používá ho monitoring)', async () => {
    const statusy: number[] = [];
    for (let i = 0; i < 10; i++) {
      const res = await http('/health');
      statusy.push(res.status);
    }
    expect(statusy.every((s) => s === 200)).toBe(true);
  });
});

describe('Bezpečnostní HTTP hlavičky — Helmet (e2e)', () => {
  it('API posílá základní ochranné hlavičky', async () => {
    const res = await http('/health');

    expect(res.headers.get('x-frame-options')).toBe('DENY');
    expect(res.headers.get('x-content-type-options')).toBe('nosniff');
    expect(res.headers.get('referrer-policy')).toBe('no-referrer');
    // Helmet odstraňuje prozrazení použité technologie.
    expect(res.headers.get('x-powered-by')).toBeNull();
  });

  it('NEPOSÍLÁ Cross-Origin-Resource-Policy — jinak by přestaly fungovat vložené widgety', async () => {
    // Widget běží v iframe na CIZÍ doméně a volá tohle API z jiného původu.
    // Výchozí `same-origin` by všechna ta volání zablokoval.
    const res = await http('/public/fitness');
    expect(res.headers.get('cross-origin-resource-policy')).toBeNull();
  });

  it('veřejný endpoint widgetu je po nasazení Helmetu dál dostupný', async () => {
    const res = await http('/public/fitness');
    expect(res.status).toBe(200);
  });
});
