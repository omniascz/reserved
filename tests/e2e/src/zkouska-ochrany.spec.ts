import { describe, it, expect } from 'vitest';

// DOČASNÝ SOUBOR — ZKOUŠKA OCHRANY VĚTVE.
//
// Tenhle test PADÁ ZÁMĚRNĚ. Slouží jen k ověření, že GitHub odmítne sloučit
// PR s červenou kontrolou. Po ověření se celá větev i tenhle soubor mažou
// a do `main` se nikdy nedostanou.
describe('zkouška ochrany větve', () => {
  it('záměrně padá, aby kontrola zčervenala', () => {
    expect(1).toBe(2);
  });
});
