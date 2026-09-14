// Značka pro marketingový web — název produktu a doména.
//
// Proměnné `NEXT_PUBLIC_*` se musí číst DOSLOVA, jinak je Next nemá co zapéct
// do prohlížečového balíku a v prohlížeči by vyšla výchozí hodnota — vypadalo
// by to, že proměnná nefunguje. Pravidla zůstávají v `@reserved/utils`.
//
// Marketing je z celého repozitáře nejcitlivější: název produktu a doména jsou
// tu v desítkách textů (patička, ceník, kontakty, časté dotazy). Texty proto
// místo natvrdo psaného názvu používají zástupný symbol a dosazuje se sem.

import {
  kontaktniEmail,
  nazevProduktu,
  subdomena,
  webovaAdresa,
  zakladniDomena,
  type ZnackaEnv,
} from '@reserved/utils';

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

/**
 * Dosadí značku do textu překladu.
 *
 * V překladech se píše `{produkt}` a `{domena}` místo „Reserved" a
 * „reserved.cz". Volá se to z JEDINÉHO místa — `i18n/request.ts`, kde se
 * překlady načítají — a to záměrně: pro next-intl je `{produkt}` parametr
 * zprávy, takže dosazení až u vykreslení je pozdě. `t('klic')` by spadlo na
 * `FORMATTING_ERROR` a místo textu by se ukázal název klíče. Podrobnosti
 * i s doloženým chováním jsou v komentáři v `i18n/request.ts`.
 *
 * Nevolat ručně u vykreslení. Texty přicházejí ze `useTranslations()`
 * i `useMessages()` už dosazené.
 */
export function dosadZnacku(text: string): string {
  return text.replaceAll('{produkt}', NAZEV_PRODUKTU).replaceAll('{domena}', DOMENA);
}
