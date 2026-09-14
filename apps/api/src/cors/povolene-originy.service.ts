// Seznam adres, ze kterých smí prohlížeč volat API — včetně VLASTNÍCH DOMÉN
// zákazníků, které jsou uložené v databázi.
//
// ── PROČ TOHLE VZNIKLO ──────────────────────────────────────────────────────
// Dřív se seznam skládal jen z proměnných prostředí, které se čtou při startu.
// Vlastní domény zákazníků jsou ale v databázi, takže každý nový zákazník
// znamenal ruční zásah do konfigurace a RESTART API. Při desítkách zákazníků
// to není provozovatelné.
//
// ── JAK TO FUNGUJE ──────────────────────────────────────────────────────────
// Ověřené domény se drží v paměti a obnovují:
//   - jednou za minutu,
//   - a OKAMŽITĚ po nastavení, ověření nebo smazání domény.
// Kontrola adresy pak nestojí žádný dotaz do databáze — je to hledání v množině.
//
// ── CO SE STANE PŘI VÝPADKU DATABÁZE ────────────────────────────────────────
// Podrží se PŘEDCHOZÍ seznam a chyba se zaloguje. Naivní řešení by seznam
// vyprázdnilo a shodilo rezervace všem zákazníkům s vlastní doménou naráz.
//
// Výjimka, kterou je potřeba znát: když selže ÚPLNĚ PRVNÍ načtení po startu,
// není co podržet a seznam zůstane prázdný. Není to tichý stav — loguje se
// jako chyba a za minutu se zkouší znovu. Vyjmenované adresy z proměnných
// prostředí fungují i v té chvíli, takže administrace ani widget nevypadnou.

import {
  Inject,
  Injectable,
  Logger,
  type OnModuleDestroy,
  type OnModuleInit,
} from '@nestjs/common';
import { jePovolenyOrigin, type CorsEnv } from '../cors.js';

/** Jak často se seznam obnovuje sám od sebe. */
const INTERVAL_OBNOVY_MS = 60_000;

/**
 * Zdroj ověřených vlastních domén.
 *
 * Je to rozhraní schválně: test tím může podstrčit výpadek databáze BEZ
 * databáze — prostě vrátí odmítnutý příslib. Stejný vzor používá vyhledávání
 * tenanta (`TenantLookup` + `DrizzleTenantLookup`).
 */
export interface NacitacOverenychDomen {
  /** Vrátí názvy hostitelů ověřených domén, např. `['booking.salonjany.cz']`. */
  nacti(): Promise<string[]>;
}

export const NACITAC_OVERENYCH_DOMEN = Symbol('NACITAC_OVERENYCH_DOMEN');

@Injectable()
export class PovoleneOriginyService implements OnModuleInit, OnModuleDestroy {
  private readonly logger = new Logger(PovoleneOriginyService.name);

  /** Poslední úspěšně načtený seznam. Při chybě se NEMAŽE. */
  private domeny = new Set<string>();

  /** Proběhlo už aspoň jedno úspěšné načtení? */
  private nacteno = false;

  private casovac: NodeJS.Timeout | null = null;

  constructor(@Inject(NACITAC_OVERENYCH_DOMEN) private readonly nacitac: NacitacOverenychDomen) {}

  async onModuleInit(): Promise<void> {
    await this.obnov();
    this.casovac = setInterval(() => {
      void this.obnov();
    }, INTERVAL_OBNOVY_MS);
    // Bez `unref` by časovač držel proces naživu a zdržoval ukončení
    // (v testech i při nasazení nové verze).
    this.casovac.unref?.();
  }

  onModuleDestroy(): void {
    if (this.casovac) {
      clearInterval(this.casovac);
      this.casovac = null;
    }
  }

  /**
   * Načte seznam znovu.
   *
   * Volá se z časovače a OKAMŽITĚ po změně domény (nastavení, ověření, smazání),
   * aby zákazník nemusel čekat na další kolo.
   */
  async obnov(): Promise<void> {
    let hostitele: string[];
    try {
      hostitele = await this.nacitac.nacti();
    } catch (chyba) {
      if (this.nacteno) {
        this.logger.warn(
          `Ověřené vlastní domény se nepodařilo načíst (${(chyba as Error).message}). ` +
            `Ponechávám předchozí seznam (${this.domeny.size} domén) — nevyprazdňuji ho.`,
        );
      } else {
        this.logger.error(
          `Ověřené vlastní domény se nepodařilo načíst ANI JEDNOU od startu ` +
            `(${(chyba as Error).message}). Seznam je zatím prázdný, zkusím to za minutu. ` +
            `Adresy z proměnných prostředí fungují dál.`,
        );
      }
      return;
    }

    this.domeny = new Set(
      hostitele.map((h) => this.jakoOrigin(h)).filter((o): o is string => o !== null),
    );
    this.nacteno = true;
  }

  /**
   * Smí prohlížeč z téhle adresy volat API?
   *
   * Nejdřív se ptá na vyjmenované adresy z proměnných prostředí (administrace,
   * portál, widget… a ruční doplnění), pak na ověřené vlastní domény.
   * Ruční proměnná tedy zůstává jako pojistka — tohle ji jen DOPLŇUJE.
   */
  jePovolena(origin: string | undefined, env: CorsEnv = process.env): boolean {
    if (jePovolenyOrigin(origin, env)) return true;
    if (!origin) return false;
    return this.domeny.has(this.normalizuj(origin));
  }

  /** Kolik ověřených domén je zrovna v seznamu (pro testy a diagnostiku). */
  get pocet(): number {
    return this.domeny.size;
  }

  /**
   * Z názvu hostitele udělá adresu tak, jak ji posílá prohlížeč.
   *
   * ZÁMĚRNĚ JEN `https://`. V databázi je uložený holý název hostitele bez
   * protokolu. Kdybychom povolili i `http://`, mohla by API volat i stránka
   * bez šifrování na téže doméně. Kdo to opravdu potřebuje (lokální zkoušky),
   * doplní si adresu ručně do CORS_EXTRA_ORIGINS.
   */
  private jakoOrigin(hostitel: string): string | null {
    const orezany = hostitel.trim().toLowerCase();
    if (orezany === '') return null;
    try {
      return new URL(`https://${orezany}`).origin;
    } catch {
      return null;
    }
  }

  private normalizuj(origin: string): string {
    try {
      return new URL(origin).origin;
    } catch {
      return origin;
    }
  }
}
