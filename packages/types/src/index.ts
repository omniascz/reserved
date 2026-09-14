// Přípony `.js` jsou povinné: přeložený kód běží v produkci čistým Nodem
// v režimu ESM, který import bez přípony neumí (ERR_MODULE_NOT_FOUND).
// Lokálně se chyba neprojeví, protože dev server jede přes tsx.
export * from './money.js';
export * from './api.js';
