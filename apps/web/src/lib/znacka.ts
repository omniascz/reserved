// Značka pro administraci — název produktu a doména.
//
// ── PROČ TENHLE SOUBOR EXISTUJE, KDYŽ LOGIKA JE VE SDÍLENÉM BALÍČKU ─────────
// Next zapéká do prohlížečového balíku jen proměnné s předponou `NEXT_PUBLIC_`,
// a to POUZE tam, kde jsou napsané doslova jako `process.env.NEXT_PUBLIC_X`.
// Kdyby si je přečetla až sdílená funkce (`process.env` uvnitř balíčku), Next
// by neměl co dosadit a hodnota by v prohlížeči zůstala prázdná — takže by se
// navždy použila výchozí („Reserved", reserved.cz) a vypadalo by to, že
// proměnná nefunguje.
//
// Proto se tady proměnné přečtou DOSLOVA a předají se dál. Pravidla (výchozí
// hodnoty, ořez protokolu, skládání adres) zůstávají na jednom místě
// v `@reserved/utils`, ne zkopírovaná v každé aplikaci.

import {
  kontaktniEmail,
  nazevProduktu,
  subdomena,
  webovaAdresa,
  zakladniDomena,
  type ZnackaEnv,
} from '@reserved/utils';

// POZOR: tyhle dva řádky musí zůstat doslovné. Nenahrazovat cyklem ani
// pomocnou funkcí — Next by pak neměl co zapéct.
const ENV: ZnackaEnv = {
  NEXT_PUBLIC_PRODUCT_NAME: process.env.NEXT_PUBLIC_PRODUCT_NAME,
  NEXT_PUBLIC_BASE_DOMAIN: process.env.NEXT_PUBLIC_BASE_DOMAIN,
};

/** Název produktu pro texty, které uvidí zákazník. */
export const NAZEV_PRODUKTU = nazevProduktu(ENV);

/** Základní doména platformy, například `reserved.cz`. */
export const DOMENA = zakladniDomena(ENV);

/** Veřejná adresa webu, například `https://reserved.cz`. */
export const WEB_ADRESA = webovaAdresa(ENV);

/** Adresa subdomény, například `adresaSubdomeny('widget')`. */
export function adresaSubdomeny(jmeno: string): string {
  return subdomena(jmeno, ENV);
}

/** Kontaktní e-mail na doméně platformy, například `kontakt('podpora')`. */
export function kontakt(schranka: string): string {
  return kontaktniEmail(schranka, ENV);
}
