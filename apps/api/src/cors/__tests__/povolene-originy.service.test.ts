import { describe, it, expect, beforeEach, vi } from 'vitest';
import { PovoleneOriginyService, type NacitacOverenychDomen } from '../povolene-originy.service.js';

// Prostředí bez jediné vlastní domény — všechno, co projde, musí přijít
// z obnovovaného seznamu, ne z proměnných.
const ENV = {
  APP_URL: 'https://app.reserved.cz',
  APP_BASE_DOMAIN: 'reserved.cz',
};

/** Zdroj domén, který si test řídí — včetně výpadku. */
class FalesnyNacitac implements NacitacOverenychDomen {
  domeny: string[] = [];
  selze = false;
  pocetVolani = 0;

  async nacti(): Promise<string[]> {
    this.pocetVolani++;
    if (this.selze) throw new Error('databáze je nedostupná');
    return this.domeny;
  }
}

describe('obnovovaný seznam vlastních domén', () => {
  let nacitac: FalesnyNacitac;
  let sluzba: PovoleneOriginyService;

  beforeEach(() => {
    nacitac = new FalesnyNacitac();
    sluzba = new PovoleneOriginyService(nacitac);
  });

  it('nová ověřená doména se projeví BEZ restartu', async () => {
    await sluzba.obnov();
    expect(sluzba.jePovolena('https://booking.salonjany.cz', ENV)).toBe(false);

    // Zákazník si doménu ověří → služba se obnoví (v provozu to vyvolá
    // `CustomDomainsService`, tady to zavoláme přímo).
    nacitac.domeny = ['booking.salonjany.cz'];
    await sluzba.obnov();

    expect(sluzba.jePovolena('https://booking.salonjany.cz', ENV)).toBe(true);
    expect(sluzba.pocet).toBe(1);
  });

  it('neověřená doména se do seznamu nedostane', async () => {
    // Načítač vrací JEN ověřené — neověřenou tedy nikdy nevrátí.
    // Tenhle test hlídá, že služba si žádnou doménu nepřidává sama.
    nacitac.domeny = [];
    await sluzba.obnov();
    expect(sluzba.jePovolena('https://jeste-neoverena.cz', ENV)).toBe(false);
    expect(sluzba.pocet).toBe(0);
  });

  it('smazaná doména ze seznamu zmizí', async () => {
    nacitac.domeny = ['booking.salonjany.cz'];
    await sluzba.obnov();
    expect(sluzba.jePovolena('https://booking.salonjany.cz', ENV)).toBe(true);

    nacitac.domeny = [];
    await sluzba.obnov();
    expect(sluzba.jePovolena('https://booking.salonjany.cz', ENV)).toBe(false);
  });

  it('VÝPADEK DATABÁZE seznam NEVYPRÁZDNÍ', async () => {
    nacitac.domeny = ['booking.salonjany.cz', 'rezervace.kadernictvi.cz'];
    await sluzba.obnov();
    expect(sluzba.pocet).toBe(2);

    // Databáze spadne…
    nacitac.selze = true;
    await sluzba.obnov();

    // …a obě domény musí dál fungovat.
    expect(sluzba.pocet, 'seznam se nesmí vyprázdnit').toBe(2);
    expect(sluzba.jePovolena('https://booking.salonjany.cz', ENV)).toBe(true);
    expect(sluzba.jePovolena('https://rezervace.kadernictvi.cz', ENV)).toBe(true);

    // A po obnovení databáze se seznam zase aktualizuje.
    nacitac.selze = false;
    nacitac.domeny = ['booking.salonjany.cz'];
    await sluzba.obnov();
    expect(sluzba.pocet).toBe(1);
  });

  it('výpadek při ÚPLNĚ PRVNÍM načtení nechá seznam prázdný, ale vyjmenované adresy fungují', async () => {
    nacitac.selze = true;
    await sluzba.obnov();

    expect(sluzba.pocet).toBe(0);
    // Podstatné: administrace ani subdomény tenantů tím nevypadnou.
    expect(sluzba.jePovolena('https://app.reserved.cz', ENV)).toBe(true);
    expect(sluzba.jePovolena('https://fitness.reserved.cz', ENV)).toBe(true);
  });

  it('ruční proměnná zůstává pojistkou a funguje i bez databáze', async () => {
    nacitac.selze = true;
    await sluzba.obnov();

    const envSPojistkou = { ...ENV, CORS_EXTRA_ORIGINS: 'https://rucne.doplnena.cz' };
    expect(sluzba.jePovolena('https://rucne.doplnena.cz', envSPojistkou)).toBe(true);
  });

  it('cizí web neprojde ani s načteným seznamem', async () => {
    nacitac.domeny = ['booking.salonjany.cz'];
    await sluzba.obnov();
    expect(sluzba.jePovolena('https://zlotrily.example.com', ENV)).toBe(false);
  });

  it('povoluje jen https, ne http na téže doméně', async () => {
    nacitac.domeny = ['booking.salonjany.cz'];
    await sluzba.obnov();
    expect(sluzba.jePovolena('https://booking.salonjany.cz', ENV)).toBe(true);
    expect(sluzba.jePovolena('http://booking.salonjany.cz', ENV)).toBe(false);
  });

  it('časovač po startu drží seznam aktuální a nebrání ukončení procesu', async () => {
    vi.useFakeTimers();
    try {
      nacitac.domeny = ['prvni.cz'];
      await sluzba.onModuleInit();
      expect(nacitac.pocetVolani).toBe(1);

      nacitac.domeny = ['prvni.cz', 'druha.cz'];
      await vi.advanceTimersByTimeAsync(60_000);
      expect(nacitac.pocetVolani).toBe(2);
      expect(sluzba.pocet).toBe(2);

      sluzba.onModuleDestroy();
      await vi.advanceTimersByTimeAsync(120_000);
      expect(nacitac.pocetVolani, 'po ukončení se už nesmí obnovovat').toBe(2);
    } finally {
      vi.useRealTimers();
    }
  });
});
