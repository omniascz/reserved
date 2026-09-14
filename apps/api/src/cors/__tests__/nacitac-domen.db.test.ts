// Ověřuje SAMOTNÝ DOTAZ do databáze — tedy že se načítají jen ověřené
// a nesmazané vlastní domény.
//
// Proč zvlášť, když jsou vedle jednotkové testy služby: ty si zdroj domén
// podstrkují a ověřují chování služby (obnova, podržení seznamu při výpadku).
// Podmínku „jen ověřené" ale nekontrolují — tu drží SQL dotaz, a ten se dá
// ověřit jedině proti skutečné databázi. Jinak bych testoval vlastní kopii
// podmínky, ne to, na co se databáze opravdu ptá.
//
// Vyžaduje běžící Postgres (DATABASE_URL).

import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import postgres from 'postgres';
import { DbConfig } from '../../db/db.config.js';
import { DbService } from '../../db/db.service.js';
import { DrizzleNacitacDomen } from '../nacitac-domen.service.js';

const DB = process.env.DATABASE_URL ?? 'postgresql://dev:dev@localhost:5433/reserved_test';
const sql = postgres(DB, { max: 2 });

/** Jedinečná přípona, ať se běhy navzájem neovlivňují. */
const RAZITKO = `${Date.now().toString(36)}${Math.random().toString(36).slice(2, 6)}`;

const OVERENA = `overena-${RAZITKO}.example.com`;
const NEOVERENA = `neoverena-${RAZITKO}.example.com`;
const SMAZANA = `smazana-${RAZITKO}.example.com`;

let dbService: DbService;
let nacitac: DrizzleNacitacDomen;
const zalozeni: string[] = [];

async function zalozTenanta(
  slug: string,
  domena: string,
  overena: boolean,
  smazany: boolean,
): Promise<void> {
  const radky = await sql<Array<{ id: string }>>`
    INSERT INTO tenants (slug, name, custom_domain, custom_domain_verified_at, deleted_at)
    VALUES (
      ${slug},
      ${`Zkouška ${slug}`},
      ${domena},
      ${overena ? sql`now()` : null},
      ${smazany ? sql`now()` : null}
    )
    RETURNING id`;
  // Explicitní ošetření, ne vykřičník: projekt má zapnutou přísnou kontrolu
  // indexovaného přístupu a `nest build` překládá i testy, takže by typová
  // chyba tady shodila stavbu celého API.
  const radek = radky[0];
  if (!radek) throw new Error(`Tenanta ${slug} se nepodařilo založit — INSERT nevrátil řádek.`);
  zalozeni.push(radek.id);
}

describe('načítání ověřených vlastních domén z databáze', () => {
  beforeAll(async () => {
    process.env.DATABASE_URL = DB;
    dbService = new DbService(new DbConfig());
    dbService.onModuleInit();
    nacitac = new DrizzleNacitacDomen(dbService);

    await zalozTenanta(`cors-ok-${RAZITKO}`.slice(0, 32), OVERENA, true, false);
    await zalozTenanta(`cors-ne-${RAZITKO}`.slice(0, 32), NEOVERENA, false, false);
    await zalozTenanta(`cors-del-${RAZITKO}`.slice(0, 32), SMAZANA, true, true);
  });

  afterAll(async () => {
    if (zalozeni.length > 0) {
      await sql`DELETE FROM tenants WHERE id = ANY(${zalozeni})`;
    }
    await dbService?.onModuleDestroy();
    await sql.end();
  });

  it('ověřená doména se načte', async () => {
    const domeny = await nacitac.nacti();
    expect(domeny).toContain(OVERENA);
  });

  it('NEOVĚŘENÁ doména se nenačte', async () => {
    // Tohle je bezpečnostně podstatné: kdyby stačilo doménu zapsat, mohl by si
    // kdokoli nárokovat cizí adresu a získat z ní přístup k API.
    const domeny = await nacitac.nacti();
    expect(domeny).not.toContain(NEOVERENA);
  });

  it('doména smazaného tenanta se nenačte, i když je ověřená', async () => {
    const domeny = await nacitac.nacti();
    expect(domeny).not.toContain(SMAZANA);
  });

  it('po smazání domény zmizí ze seznamu', async () => {
    expect(await nacitac.nacti()).toContain(OVERENA);

    await sql`UPDATE tenants SET custom_domain = NULL, custom_domain_verified_at = NULL
              WHERE custom_domain = ${OVERENA}`;

    expect(await nacitac.nacti()).not.toContain(OVERENA);
  });
});
