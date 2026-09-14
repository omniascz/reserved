// Reserved utility helpers — bez závislostí na NestJS / Next.js.
// Jen pure funkce.

// POZOR NA PŘÍPONY `.js`: přeložený kód se v produkci spouští čistým Nodem
// v režimu ESM, a ten import bez přípony NEUMÍ (ERR_MODULE_NOT_FOUND).
// Lokálně to neselže, protože dev server běží přes tsx, který si příponu
// domyslí — chyba se tak projeví až v kontejneru nebo v CI.
export { sleep } from './async.js';

// Značka — název produktu a doména z proměnných prostředí, na jednom místě.
// Bez nastavených proměnných vychází současný stav („Reserved", reserved.cz).
export {
  VYCHOZI_NAZEV_PRODUKTU,
  VYCHOZI_DOMENA,
  nazevProduktu,
  zakladniDomena,
  webovaAdresa,
  subdomena,
  kontaktniEmail,
  zakazanePripony,
  type ZnackaEnv,
} from './znacka.js';

// Šifrování citlivých hodnot v databázi (přístupy k platebním branám).
// Používá jen vestavěný node:crypto, takže balíček zůstává bez závislostí.
export {
  nactiKlic,
  zasifruj,
  desifruj,
  jeZasifrovano,
  zasifrujKonfiguraci,
  desifrujKonfiguraci,
  konfiguraceJeZasifrovana,
  type SifrovaciKlic,
} from './crypto.js';
