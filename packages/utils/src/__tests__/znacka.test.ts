import { describe, it, expect } from 'vitest';
import {
  VYCHOZI_DOMENA,
  VYCHOZI_NAZEV_PRODUKTU,
  kontaktniEmail,
  nazevProduktu,
  subdomena,
  webovaAdresa,
  zakazanePripony,
  zakladniDomena,
} from '../znacka.js';

describe('značka — název produktu a doména z proměnných', () => {
  it('BEZ nastavených proměnných vychází současný stav', () => {
    // Tohle je podmínka celé změny: zavedení proměnných nesmí nic rozbít.
    expect(nazevProduktu({})).toBe('Reserved');
    expect(zakladniDomena({})).toBe('reserved.cz');
    expect(webovaAdresa({})).toBe('https://reserved.cz');
    expect(kontaktniEmail('podpora', {})).toBe('podpora@reserved.cz');
    expect(subdomena('widget', {})).toBe('https://widget.reserved.cz');
  });

  it('změna JEDNÉ proměnné přepíše doménu všude', () => {
    const env = { APP_BASE_DOMAIN: 'objednavky.cz' };
    expect(zakladniDomena(env)).toBe('objednavky.cz');
    expect(webovaAdresa(env)).toBe('https://objednavky.cz');
    expect(subdomena('widget', env)).toBe('https://widget.objednavky.cz');
    expect(kontaktniEmail('sales', env)).toBe('sales@objednavky.cz');
  });

  it('změna JEDNÉ proměnné přepíše název produktu', () => {
    expect(nazevProduktu({ PRODUCT_NAME: 'Objednávky' })).toBe('Objednávky');
  });

  it('frontendová proměnná má přednost (zapéká se při sestavení)', () => {
    expect(nazevProduktu({ PRODUCT_NAME: 'Server', NEXT_PUBLIC_PRODUCT_NAME: 'Frontend' })).toBe(
      'Frontend',
    );
    expect(
      zakladniDomena({ APP_BASE_DOMAIN: 'server.cz', NEXT_PUBLIC_BASE_DOMAIN: 'frontend.cz' }),
    ).toBe('frontend.cz');
  });

  it('protokol a lomítko v proměnné nevadí', () => {
    // Do proměnné pro doménu se snadno vloží celá adresa. Bez ošetření by
    // z toho vznikly odkazy typu `https://https://objednavky.cz/`.
    expect(zakladniDomena({ APP_BASE_DOMAIN: 'https://objednavky.cz/' })).toBe('objednavky.cz');
    expect(webovaAdresa({ APP_BASE_DOMAIN: 'https://objednavky.cz/' })).toBe(
      'https://objednavky.cz',
    );
  });

  it('prázdná nebo mezerová hodnota se chová jako nenastavená', () => {
    expect(nazevProduktu({ PRODUCT_NAME: '   ' })).toBe('Reserved');
    expect(zakladniDomena({ APP_BASE_DOMAIN: '' })).toBe('reserved.cz');
  });

  it('doména se normalizuje na malá písmena', () => {
    expect(zakladniDomena({ APP_BASE_DOMAIN: 'Objednavky.CZ' })).toBe('objednavky.cz');
  });

  it('zakázané přípony se odvozují z domény, ne z natvrdo psaného seznamu', () => {
    // Dřív tu bylo ['reserved.cz', 'reserved.com', 'localhost'] — po změně
    // domény by to přestalo chránit novou doménu platformy.
    expect(zakazanePripony({})).toEqual(['reserved.cz', 'reserved.com', 'localhost']);
    expect(zakazanePripony({ APP_BASE_DOMAIN: 'objednavky.cz' })).toEqual([
      'objednavky.cz',
      'objednavky.com',
      'localhost',
    ]);
  });

  it('výchozí hodnoty jsou vystavené jako konstanty (pro dokumentaci a testy)', () => {
    expect(VYCHOZI_NAZEV_PRODUKTU).toBe('Reserved');
    expect(VYCHOZI_DOMENA).toBe('reserved.cz');
  });
});
