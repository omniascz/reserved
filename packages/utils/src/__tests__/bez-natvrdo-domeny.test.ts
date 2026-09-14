import { describe, it, expect } from 'vitest';
import { readFileSync, readdirSync, statSync } from 'node:fs';
import { join, relative, sep } from 'node:path';

// HLÍDÁ, ŽE SE NATVRDO ZAPSANÁ DOMÉNA NEVRÁTÍ DO KÓDU.
//
// „Reserved" je pracovní název a `reserved.cz` pracovní doména. Až přijdou
// skutečné, mění se hodnota proměnné — ne padesát míst v kódu. Tenhle test
// hlídá, že se ta práce nerozpadne prvním commitem, který doménu zase napíše
// natvrdo.
//
// Když test spadne, NEODSTRAŇUJ ho. Buď doménu vezmi ze `@reserved/utils`
// (`zakladniDomena()`, `webovaAdresa()`, `kontaktniEmail()`), nebo — pokud jde
// o legitimní výjimku — dopiš ji do seznamu níž i s důvodem.

const KOREN = join(__dirname, '..', '..', '..', '..');

/** Co se prohledává. */
const PROHLEDAT = ['apps', 'packages'];

/** Přípony, které dávají smysl kontrolovat. */
const PRIPONY = ['.ts', '.tsx', '.mjs', '.js'];

/** Složky, do kterých se nechodí. */
const VYNECHAT_SLOZKY = new Set(['node_modules', 'dist', '.next', '.turbo', 'build', 'coverage']);

/**
 * Soubory, kde doména zůstat SMÍ — i s důvodem.
 *
 * Testovací přípravky: test potřebuje pevnou hodnotu, jinak by neměl co
 * ověřovat. Kdyby braly doménu z proměnné, testovaly by samy sebe.
 */
const POVOLENE_SOUBORY = [
  // Testy CORS a rozpoznávání tenanta pracují s konkrétní doménou jako se vstupem.
  'apps/api/src/__tests__/cors.test.ts',
  'apps/api/src/cors/__tests__/povolene-originy.service.test.ts',
  'apps/api/src/tenant/__tests__/tenant.resolver.test.ts',
  // Zdroj pravdy o značce — výchozí hodnoty tu být MUSÍ.
  'packages/utils/src/znacka.ts',
  'packages/utils/src/__tests__/znacka.test.ts',
  // Tenhle test sám (obsahuje hledaný řetězec v pravidlech).
  'packages/utils/src/__tests__/bez-natvrdo-domeny.test.ts',
  // Spojky ve frontendech: v komentářích vysvětlují, co je výchozí hodnota.
  'apps/web/src/lib/znacka.ts',
  'apps/portal/src/lib/znacka.ts',
  'apps/widget/src/lib/znacka.ts',
  'apps/master/src/lib/znacka.ts',
  'apps/marketing/src/lib/znacka.ts',
  'apps/tenant-site/src/lib/znacka.ts',
];

function projdi(slozka: string, nalezene: string[] = []): string[] {
  for (const polozka of readdirSync(slozka)) {
    if (VYNECHAT_SLOZKY.has(polozka)) continue;
    const cesta = join(slozka, polozka);
    if (statSync(cesta).isDirectory()) {
      projdi(cesta, nalezene);
    } else if (PRIPONY.some((p) => polozka.endsWith(p))) {
      nalezene.push(cesta);
    }
  }
  return nalezene;
}

/** Vrátí `cestu/s/lomítky` bez ohledu na operační systém. */
function normalizuj(cesta: string): string {
  return relative(KOREN, cesta).split(sep).join('/');
}

describe('natvrdo zapsaná doména se nesmí vrátit do kódu', () => {
  const soubory = PROHLEDAT.flatMap((s) => projdi(join(KOREN, s)));

  it('prohledává rozumný počet souborů (pojistka proti prázdnému běhu)', () => {
    // Bez tohohle by test mlčky „procházel“, kdyby se rozbilo procházení
    // složek — zelená, která nic neměří, je horší než červená.
    expect(soubory.length).toBeGreaterThan(100);
  });

  it('nikde není natvrdo `reserved.cz`', () => {
    const provineni: string[] = [];

    for (const soubor of soubory) {
      const relativni = normalizuj(soubor);
      if (POVOLENE_SOUBORY.includes(relativni)) continue;

      const obsah = readFileSync(soubor, 'utf8');
      obsah.split('\n').forEach((radek, i) => {
        if (!/reserved\.cz/i.test(radek)) return;
        // Komentáře popisují chování a doménu zmiňují jako příklad — ty jsou
        // v pořádku, protože se nikdy nedostanou k zákazníkovi.
        const orezany = radek.trim();
        if (orezany.startsWith('//') || orezany.startsWith('*') || orezany.startsWith('/*')) return;
        provineni.push(`${relativni}:${i + 1}  ${orezany.slice(0, 100)}`);
      });
    }

    expect(
      provineni,
      'Doména patří do proměnné, ne do kódu. Použij `zakladniDomena()`, ' +
        '`webovaAdresa()` nebo `kontaktniEmail()` z @reserved/utils. ' +
        'Legitimní výjimku dopiš do POVOLENE_SOUBORY i s důvodem.\n' +
        provineni.join('\n'),
    ).toEqual([]);
  });
});
