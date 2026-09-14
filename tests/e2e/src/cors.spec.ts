import { describe, it, expect } from 'vitest';

// Ověřuje ZAPOJENÍ seznamu povolených adres do běžícího API. Samotné
// rozhodování (včetně toho, že cizí adresa neprojde) pokrývají jednotkové
// testy v apps/api/src/__tests__/cors.test.ts — ty nepotřebují běžící server.
//
// Tady jde o jinou otázku: opravdu se ten seznam při startu použil?
// Regrese, kterou to hlídá: v produkci bylo povolené jediné `APP_URL`, takže
// widget, portál, master ani mini-web tenanta nemohly API z prohlížeče volat.
//
// POZOR — DŘÍVE TU STÁLO, ŽE TEST PLATÍ V OBOU REŽIMECH. NEPLATÍ.
// Ve vývoji je povoleno všechno, takže projde cokoli. V produkci projdou jen
// adresy vyjmenované v proměnných prostředí — a tenhle test tedy vyžaduje,
// aby prostředí mělo nastavené VŠECHNY adresy aplikací, ne jen APP_URL.
//
// Stálo to jeden červený běh: v `e2e-smoke` se API spouští s NODE_ENV=production,
// ale nastavená byla jen APP_URL. Portál, master i widget proto dostaly `null`
// a test spadl, přestože aplikace byla v pořádku. Chyběla konfigurace CI.
//
// Proto se adresy berou z prostředí (s výchozími hodnotami pro lokální běh)
// a workflow je musí nastavit stejně, jako je nastavuje produkční sestava.

const API_URL = process.env.API_URL ?? 'http://localhost:4010/api/v1';

/** Adresy aplikací, jak je má zkušební i vývojová sestava. */
const ADRESY_APLIKACI = [
  { adresa: process.env.APP_URL ?? 'http://localhost:4002', popis: 'administrace' },
  { adresa: process.env.PORTAL_BASE_URL ?? 'http://localhost:4003', popis: 'zákaznický portál' },
  {
    adresa: process.env.MASTER_BASE_URL ?? 'http://localhost:4001',
    popis: 'administrace platformy',
  },
  { adresa: process.env.WIDGET_URL ?? 'http://localhost:4004', popis: 'rezervační widget' },
];

async function povolenaAdresa(origin: string): Promise<string | null> {
  const res = await fetch(`${API_URL}/health`, { headers: { Origin: origin } });
  return res.headers.get('access-control-allow-origin');
}

describe('CORS — z jakých adres smí prohlížeč volat API', () => {
  it.each(ADRESY_APLIKACI)('povolí $popis ($adresa)', async ({ adresa }) => {
    const vraceno = await povolenaAdresa(adresa);

    // POZOR NA MĚŘENÍ: nestačí ptát se „přišla hlavička?“. Při pevně nastavené
    // jediné adrese chodí hlavička VŽDY, jen v ní stojí cizí adresa — prohlížeč
    // pak volání stejně zablokuje. Porovnávat se proto musí HODNOTA.
    expect(vraceno, `API musí vrátit ${adresa}, vrátilo ${vraceno}`).toBe(adresa);
  });

  it('požadavek bez hlavičky Origin projde (volání ze serveru)', async () => {
    const res = await fetch(`${API_URL}/health`);
    expect(res.ok).toBe(true);
  });
});
