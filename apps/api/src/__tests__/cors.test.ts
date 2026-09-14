import { describe, it, expect } from 'vitest';
import { jePovolenyOrigin, jeSubdomenaZakladni, povoleneOrigins } from '../cors.js';

// Produkční sada proměnných, jak by vypadala na serveru.
const PRODUKCE = {
  APP_URL: 'https://app.reserved.cz',
  PORTAL_BASE_URL: 'https://portal.reserved.cz',
  MASTER_BASE_URL: 'https://master.reserved.cz',
  WIDGET_URL: 'https://widget.reserved.cz',
  TENANT_SITE_URL: 'https://reserved.cz',
  APP_BASE_DOMAIN: 'reserved.cz',
};

describe('povolené adresy pro volání API z prohlížeče', () => {
  it('propustí všechny aplikace, ne jen administraci', () => {
    // REGRESE: dřív bylo nastavené `origin: APP_URL`, tedy jediná adresa.
    // Widget, portál, master i mini-web tenanta volají API z prohlížeče a
    // v produkci jim to prohlížeč zakázal — čtyři aplikace ze šesti nefungovaly.
    for (const adresa of [
      'https://app.reserved.cz',
      'https://portal.reserved.cz',
      'https://master.reserved.cz',
      'https://widget.reserved.cz',
    ]) {
      expect(jePovolenyOrigin(adresa, PRODUKCE), `${adresa} musí projít`).toBe(true);
    }
  });

  it('nepropustí cizí web', () => {
    expect(jePovolenyOrigin('https://zlotrily.example.com', PRODUKCE)).toBe(false);
  });

  it('nepropustí doménu, která se jen podobá', () => {
    // `zlyreserved.cz` končí na „reserved.cz“, ale subdoménou není.
    expect(jePovolenyOrigin('https://zlyreserved.cz', PRODUKCE)).toBe(false);
    expect(jeSubdomenaZakladni('https://zlyreserved.cz', 'reserved.cz')).toBe(false);
  });

  it('povolí subdoménu tenanta automaticky', () => {
    expect(jePovolenyOrigin('https://fitness.reserved.cz', PRODUKCE)).toBe(true);
  });

  it('propustí požadavek bez hlavičky Origin (volání ze serveru, curl)', () => {
    // CORS je ochrana prohlížeče. Kdo volá API přímo, hlavičku nepošle —
    // zastavit ho musí přihlášení, ne tenhle seznam.
    expect(jePovolenyOrigin(undefined, PRODUKCE)).toBe(true);
  });

  it('nevadí lomítko na konci adresy v proměnné', () => {
    const env = { APP_URL: 'https://app.reserved.cz/' };
    expect(jePovolenyOrigin('https://app.reserved.cz', env)).toBe(true);
  });

  it('rozlišuje port — jiný port je jiná adresa', () => {
    const env = { APP_URL: 'http://localhost:4002' };
    expect(jePovolenyOrigin('http://localhost:4002', env)).toBe(true);
    expect(jePovolenyOrigin('http://localhost:4004', env)).toBe(false);
  });

  it('umí doplnit vlastní domény tenantů ručním výčtem', () => {
    // Vlastní domény jsou v databázi (`tenants.custom_domain`) a seznam se
    // skládá při startu, takže se sem samy nedostanou. Je to vědomé omezení.
    const env = { ...PRODUKCE, CORS_EXTRA_ORIGINS: 'https://rezervace.salonjana.cz' };
    expect(jePovolenyOrigin('https://rezervace.salonjana.cz', env)).toBe(true);
  });

  it('základní doména `localhost` nesmí otevřít všechny porty', () => {
    // Jinak by `APP_BASE_DOMAIN=localhost` v produkci povolilo cokoli na localhostu.
    expect(jeSubdomenaZakladni('http://localhost:9999', 'localhost')).toBe(false);
  });

  it('seznam neobsahuje duplicity ani prázdné hodnoty', () => {
    const env = {
      APP_URL: 'https://app.reserved.cz',
      ADMIN_BASE_URL: 'https://app.reserved.cz',
      PORTAL_BASE_URL: '',
      CORS_EXTRA_ORIGINS: ' , ,https://extra.cz, ',
    };
    expect(povoleneOrigins(env)).toEqual(['https://app.reserved.cz', 'https://extra.cz']);
  });
});
