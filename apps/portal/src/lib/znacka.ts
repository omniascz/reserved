// Značka pro zákaznický portál — název produktu a doména.
//
// Proměnné `NEXT_PUBLIC_*` se musí číst DOSLOVA, jinak je Next nemá co zapéct
// do prohlížečového balíku a v prohlížeči by vyšla výchozí hodnota — vypadalo
// by to, že proměnná nefunguje. Pravidla zůstávají v `@reserved/utils`.

import {
  kontaktniEmail,
  nazevProduktu,
  subdomena,
  webovaAdresa,
  zakladniDomena,
  type ZnackaEnv,
} from '@reserved/utils/znacka';

// Doslovné čtení — nenahrazovat cyklem ani pomocnou funkcí.
const ENV: ZnackaEnv = {
  NEXT_PUBLIC_PRODUCT_NAME: process.env.NEXT_PUBLIC_PRODUCT_NAME,
  NEXT_PUBLIC_BASE_DOMAIN: process.env.NEXT_PUBLIC_BASE_DOMAIN,
};

export const NAZEV_PRODUKTU = nazevProduktu(ENV);
export const DOMENA = zakladniDomena(ENV);
export const WEB_ADRESA = webovaAdresa(ENV);

export function adresaSubdomeny(jmeno: string): string {
  return subdomena(jmeno, ENV);
}

export function kontakt(schranka: string): string {
  return kontaktniEmail(schranka, ENV);
}
