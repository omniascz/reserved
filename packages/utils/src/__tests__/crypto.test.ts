// Testy šifrování citlivých hodnot.
//
// Nejde jen o „zašifruj a rozšifruj". Podstatné jsou tři vlastnosti, na kterých
// stojí bezpečnost i to, že se při nasazení nic neztratí:
//   1. zašifrovaná hodnota nesmí obsahovat původní text,
//   2. poškozená nebo cizím klíčem šifrovaná data musí SKONČIT CHYBOU,
//      ne vrátit tiše nesmysl,
//   3. dosud nezašifrovaná konfigurace musí projít beze změny (jinak by se
//      při nedoběhnutém převodu ztratily přístupy k platebním branám).

import { describe, expect, it } from 'vitest';
import {
  desifruj,
  desifrujKonfiguraci,
  jeZasifrovano,
  konfiguraceJeZasifrovana,
  nactiKlic,
  zasifruj,
  zasifrujKonfiguraci,
} from '../crypto';

const KLIC_HEX = 'a'.repeat(64);
const KLIC = nactiKlic(KLIC_HEX, 'TEST_KEY');
const JINY_KLIC = nactiKlic('b'.repeat(64), 'TEST_KEY');

describe('nactiKlic', () => {
  it('přijme 64 hex znaků', () => {
    expect(nactiKlic(KLIC_HEX, 'X').raw.length).toBe(32);
  });

  it('přijme base64 o 32 bajtech', () => {
    const base64 = Buffer.alloc(32, 7).toString('base64');
    expect(nactiKlic(base64, 'X').raw.length).toBe(32);
  });

  it('odmítne prázdnou hodnotu a poradí, jak klíč vyrobit', () => {
    expect(() => nactiKlic(undefined, 'PAYMENT_CONFIG_KEY')).toThrow(/PAYMENT_CONFIG_KEY/);
    expect(() => nactiKlic('', 'PAYMENT_CONFIG_KEY')).toThrow(/openssl rand -hex 32/);
  });

  it('odmítne krátký klíč místo toho, aby ho tiše dopočítal', () => {
    // Odvození delšího klíče z krátkého tajemství by zamaskovalo, že
    // provozovatel nastavil slabou hodnotu.
    expect(() => nactiKlic('kratke', 'PAYMENT_CONFIG_KEY')).toThrow(/32 bajtů/);
  });
});

describe('zasifruj / desifruj', () => {
  it('vrátí původní text', () => {
    const text = 'secret_password_123';
    expect(desifruj(zasifruj(text, KLIC), KLIC)).toBe(text);
  });

  it('zašifrovaná hodnota neobsahuje původní text', () => {
    const sifra = zasifruj('merchant-987654', KLIC);
    expect(sifra).not.toContain('merchant-987654');
    expect(jeZasifrovano(sifra)).toBe(true);
  });

  it('stejný vstup dá pokaždé jiný výstup (náhodný IV)', () => {
    // Kdyby byl výstup pokaždé stejný, šlo by z databáze poznat, které tenanty
    // mají stejné přihlašovací údaje.
    expect(zasifruj('stejne', KLIC)).not.toBe(zasifruj('stejne', KLIC));
  });

  it('zvládne diakritiku i delší text', () => {
    const text = 'Příliš žluťoučký kůň — ' + 'x'.repeat(5000);
    expect(desifruj(zasifruj(text, KLIC), KLIC)).toBe(text);
  });

  it('CIZÍM KLÍČEM se dešifrovat nedá', () => {
    const sifra = zasifruj('tajemstvi', KLIC);
    expect(() => desifruj(sifra, JINY_KLIC)).toThrow(/Dešifrování selhalo/);
  });

  it('POŠKOZENÁ data skončí chybou, ne tichým nesmyslem', () => {
    const sifra = zasifruj('tajemstvi', KLIC);
    // Změníme jediný znak v šifrovaném textu — ověřovací značka to musí chytit.
    const poskozena =
      sifra.slice(0, -3) + (sifra.slice(-3, -2) === 'A' ? 'B' : 'A') + sifra.slice(-2);
    expect(() => desifruj(poskozena, KLIC)).toThrow();
  });

  it('hodnota bez prefixu se odmítne', () => {
    expect(() => desifruj('obycejny text', KLIC)).toThrow(/prefix/);
    expect(jeZasifrovano('obycejny text')).toBe(false);
  });
});

describe('konfigurace platební brány', () => {
  const config = { merchant: '123456', secret: 'heslo-brany', test: false };

  it('zašifruje celý objekt, ne jen vybrané klíče', () => {
    const ulozene = zasifrujKonfiguraci(config, KLIC);
    const text = JSON.stringify(ulozene);
    // Ani identifikátor obchodníka nesmí zůstat čitelný.
    expect(text).not.toContain('123456');
    expect(text).not.toContain('heslo-brany');
    expect(konfiguraceJeZasifrovana(ulozene)).toBe(true);
  });

  it('po rozbalení sedí hodnoty i typy', () => {
    const zpet = desifrujKonfiguraci(zasifrujKonfiguraci(config, KLIC), KLIC);
    expect(zpet).toEqual(config);
    // `test` musí zůstat boolean — kdyby se z něj stal text "false",
    // brána by ho vyhodnotila jako PRAVDU a zapnula testovací režim.
    expect(zpet.test).toBe(false);
  });

  it('NEZAŠIFROVANOU konfiguraci vrátí beze změny', () => {
    // Tolerance ke starým záznamům: kdyby převod nedoběhl, přístupy k branám
    // se nesmí ztratit.
    const stara = { merchant: '999', secret: 'plain' };
    expect(desifrujKonfiguraci(stara, KLIC)).toEqual(stara);
    expect(konfiguraceJeZasifrovana(stara)).toBe(false);
  });

  it('prázdnou konfiguraci zvládne (zakládá ji služba záloh)', () => {
    expect(desifrujKonfiguraci({}, KLIC)).toEqual({});
    expect(desifrujKonfiguraci(null, KLIC)).toEqual({});
    expect(desifrujKonfiguraci(undefined, KLIC)).toEqual({});
  });

  it('dvojí zašifrování nezničí data', () => {
    const jednou = zasifrujKonfiguraci(config, KLIC);
    const dvakrat = zasifrujKonfiguraci(jednou, KLIC);
    // Vnější vrstva se odloupne a uvnitř je pořád obálka první vrstvy.
    const vnitrni = desifrujKonfiguraci(dvakrat, KLIC);
    expect(desifrujKonfiguraci(vnitrni, KLIC)).toEqual(config);
  });
});
