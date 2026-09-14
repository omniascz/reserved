import { describe, it, expect } from 'vitest';

// DOČASNÝ SOUBOR — ZKOUŠKA, ZDA OCHRANA VĚTVE PLATÍ I NA SPRÁVCE.
//
// Tenhle test PADÁ ZÁMĚRNĚ. Slouží výhradně k ověření, že `gh pr merge --admin`
// NEPROJDE, když je povinná kontrola červená. Obsahem je jen tenhle soubor —
// žádný produkční kód — aby i případné nechtěné sloučení nic nerozbilo.
//
// Po ověření se PR zavře a větev smaže. Do `main` se to dostat nemá.
describe('zkouška obejití ochrany přes --admin', () => {
  it('záměrně padá, aby povinná kontrola zčervenala', () => {
    expect(1).toBe(2);
  });
});
