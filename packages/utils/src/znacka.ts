// Značka: název produktu a doména na JEDNOM místě.
//
// ── PROČ TOHLE EXISTUJE ─────────────────────────────────────────────────────
// „Reserved" je pracovní název a `reserved.cz` pracovní doména. Skutečné přijdou
// později. Před tímhle souborem byly natvrdo rozeseté po celém repozitáři —
// 109 výskytů domény a 157 výskytů názvu. Změna by znamenala archeologii
// v kódu, ne úpravu konfigurace.
//
// Nově se obojí bere odsud a odsud jen z proměnných prostředí.
//
// ── VÝCHOZÍ HODNOTY JSOU SOUČASNÝ STAV ──────────────────────────────────────
// Bez nastavených proměnných vychází přesně to, co bylo natvrdo předtím.
// Zavedení téhle vrstvy tedy nic nemění — jen zpřístupňuje vypínač.
//
// ── PROČ DVOJÍ NÁZVY PROMĚNNÝCH ─────────────────────────────────────────────
// Next.js zapéká do prohlížečového balíku jen proměnné s předponou
// `NEXT_PUBLIC_`. Server (API, workers) používá krátké názvy. Čte se proto
// obojí, s předností pro `NEXT_PUBLIC_` — ta je při sestavení konkrétnější.

/** Proměnné, ze kterých se značka skládá. */
export interface ZnackaEnv {
  /** Název produktu pro server (API, workers). */
  PRODUCT_NAME?: string;
  /** Název produktu zapečený do frontendu při sestavení. */
  NEXT_PUBLIC_PRODUCT_NAME?: string;
  /** Základní doména platformy pro server. */
  APP_BASE_DOMAIN?: string;
  /** Základní doména zapečená do frontendu při sestavení. */
  NEXT_PUBLIC_BASE_DOMAIN?: string;
}

/**
 * Současný název produktu. Až přijde skutečný, změní se hodnota proměnné —
 * ne tahle konstanta a ne padesát míst v kódu.
 */
export const VYCHOZI_NAZEV_PRODUKTU = 'Reserved';

/** Současná pracovní doména. Platí totéž co u názvu. */
export const VYCHOZI_DOMENA = 'reserved.cz';

function prvniVyplnena(...hodnoty: Array<string | undefined>): string | null {
  for (const h of hodnoty) {
    if (typeof h === 'string' && h.trim() !== '') return h.trim();
  }
  return null;
}

/** Název produktu tak, jak ho uvidí zákazník (e-maily, titulky, patičky). */
export function nazevProduktu(env: ZnackaEnv = process.env as ZnackaEnv): string {
  return prvniVyplnena(env.NEXT_PUBLIC_PRODUCT_NAME, env.PRODUCT_NAME) ?? VYCHOZI_NAZEV_PRODUKTU;
}

/**
 * Základní doména bez protokolu a bez `www` — například `reserved.cz`.
 *
 * Případný protokol nebo lomítko se odřízne: do proměnné se snadno vloží
 * `https://…` a tichá chyba by se pak objevila až v odkazech v e-mailech.
 */
export function zakladniDomena(env: ZnackaEnv = process.env as ZnackaEnv): string {
  const syrova = prvniVyplnena(env.NEXT_PUBLIC_BASE_DOMAIN, env.APP_BASE_DOMAIN) ?? VYCHOZI_DOMENA;
  return syrova
    .replace(/^https?:\/\//i, '')
    .replace(/\/+$/, '')
    .toLowerCase();
}

/** Veřejná adresa webu, například `https://reserved.cz`. */
export function webovaAdresa(env: ZnackaEnv = process.env as ZnackaEnv): string {
  return `https://${zakladniDomena(env)}`;
}

/**
 * Adresa subdomény, například `subdomena('widget')` → `https://widget.reserved.cz`.
 *
 * Používá se pro ukázky v nápovědě (adresa widgetu, adresa tenanta) — tedy
 * pro texty, které zákazník čte a kopíruje.
 */
export function subdomena(jmeno: string, env: ZnackaEnv = process.env as ZnackaEnv): string {
  return `https://${jmeno}.${zakladniDomena(env)}`;
}

/**
 * Kontaktní e-mail na doméně platformy, například `kontakt('podpora')`
 * → `podpora@reserved.cz`.
 */
export function kontaktniEmail(
  schranka: string,
  env: ZnackaEnv = process.env as ZnackaEnv,
): string {
  return `${schranka}@${zakladniDomena(env)}`;
}

/**
 * Přípony, které si tenant NESMÍ nárokovat jako vlastní doménu.
 *
 * Skládá se ze základní domény a jejích obvyklých variant. Dřív to byl
 * natvrdo zapsaný seznam `['reserved.cz', 'reserved.com', 'localhost']`, který
 * by po změně domény přestal chránit to, co má.
 */
export function zakazanePripony(env: ZnackaEnv = process.env as ZnackaEnv): string[] {
  const domena = zakladniDomena(env);
  const bezTld = domena.replace(/\.[a-z]+$/i, '');
  return [...new Set([domena, `${bezTld}.com`, 'localhost'])];
}
