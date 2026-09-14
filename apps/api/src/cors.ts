// Rozhodování o tom, ze kterých adres smí prohlížeč volat API.
//
// ── PROČ TENHLE SOUBOR VZNIKL ───────────────────────────────────────────────
// V produkci bylo nastavené `origin: process.env.APP_URL`, tedy JEDINÁ adresa —
// administrace. Jenže API z prohlížeče volají i widget, zákaznický portál,
// administrace platformy a mini-web tenanta, a každý z nich běží na vlastní
// adrese. Prohlížeč jim volání zakázal a v produkci by nefungovaly čtyři
// aplikace ze šesti, včetně veřejné rezervace.
//
// Ve vývoji se to nikdy neprojevilo, protože tam je povoleno všechno.
//
// ── PROČ SAMOSTATNÝ MODUL A NE PÁR ŘÁDKŮ V main.ts ──────────────────────────
// Aby se to dalo otestovat. `main.ts` se spouští při startu aplikace a testovat
// se dá jen naživo; tyhle funkce jsou čisté a dá se na ně napsat přesný test,
// včetně toho podstatného — že cizí adresa NEPROJDE.

/** Proměnné prostředí, ze kterých se seznam povolených adres skládá. */
export interface CorsEnv {
  /** Administrace provozovatele. */
  APP_URL?: string;
  ADMIN_BASE_URL?: string;
  /** Zákaznický portál. */
  PORTAL_BASE_URL?: string;
  /** Administrace platformy. */
  MASTER_BASE_URL?: string;
  /** Rezervační widget. */
  WIDGET_URL?: string;
  /** Mini-web tenanta. */
  TENANT_SITE_URL?: string;
  /** Marketingový web. */
  MARKETING_URL?: string;
  /**
   * Ruční doplnění, oddělené čárkami.
   *
   * Sem patří VLASTNÍ DOMÉNY TENANTŮ. Ty jsou uložené v databázi
   * (`tenants.custom_domain`) a tenhle seznam se skládá při startu, takže se
   * sem nedostanou samy. Dokud se to nevyřeší jinak, musí je provozovatel
   * platformy doplnit sem — a je to vědomé omezení, ne opomenutí.
   */
  CORS_EXTRA_ORIGINS?: string;
  /** Základní doména platformy; její subdomény se povolují automaticky. */
  APP_BASE_DOMAIN?: string;
}

/**
 * Převede adresu na tvar, ve kterém ji posílá prohlížeč v hlavičce `Origin`,
 * tedy `schéma://hostitel[:port]` — bez cesty a bez lomítka na konci.
 *
 * Díky tomu nevadí, když je v proměnné `https://app.example.com/` s lomítkem:
 * porovnání by jinak selhalo a adresa by se tiše nepovolila.
 */
function normalizuj(hodnota: string | undefined | null): string | null {
  if (!hodnota) return null;
  const orezano = hodnota.trim();
  if (orezano === '') return null;
  try {
    return new URL(orezano).origin;
  } catch {
    return null;
  }
}

/** Seznam výslovně povolených adres, bez duplicit. */
export function povoleneOrigins(env: CorsEnv): string[] {
  const zPromennych = [
    env.APP_URL,
    env.ADMIN_BASE_URL,
    env.PORTAL_BASE_URL,
    env.MASTER_BASE_URL,
    env.WIDGET_URL,
    env.TENANT_SITE_URL,
    env.MARKETING_URL,
  ];
  const rucni = (env.CORS_EXTRA_ORIGINS ?? '').split(',');
  const vse = [...zPromennych, ...rucni].map(normalizuj).filter((a): a is string => a !== null);
  return [...new Set(vse)];
}

/**
 * Je adresa subdoménou základní domény platformy (nebo přímo jí)?
 *
 * Tím se pokryjí subdomény tenantů (`fitness.reserved.cz`) i vyjmenované
 * adresy aplikací, aniž by se musely psát jedna po druhé.
 *
 * Porovnává se AŽ ZA tečkou (`.reserved.cz`), aby neprošla cizí doména, která
 * jen končí stejnými znaky — `zlyreserved.cz` subdoménou `reserved.cz` není.
 */
export function jeSubdomenaZakladni(origin: string, baseDomain?: string): boolean {
  const zaklad = baseDomain?.trim().toLowerCase();
  if (!zaklad) return false;
  // `localhost` jako základní doména by povolila libovolný port na localhostu;
  // ve vývoji je stejně povoleno všechno a v produkci by to bylo nebezpečné.
  if (zaklad === 'localhost') return false;

  let hostitel: string;
  try {
    hostitel = new URL(origin).hostname.toLowerCase();
  } catch {
    return false;
  }
  return hostitel === zaklad || hostitel.endsWith(`.${zaklad}`);
}

/**
 * Smí prohlížeč z téhle adresy volat API?
 *
 * Požadavky BEZ hlavičky `Origin` se propouštějí: tak vypadá volání ze serveru,
 * z `curl` nebo ze stejného původu. CORS je ochrana prohlížeče, ne autentizace —
 * kdo volá API přímo, hlavičku prostě nepošle a žádné omezení ho nezastaví.
 * Skutečnou ochranu dělá přihlášení, ne tenhle seznam.
 */
export function jePovolenyOrigin(origin: string | undefined, env: CorsEnv): boolean {
  if (!origin) return true;
  const normalizovany = normalizuj(origin);
  if (!normalizovany) return false;
  if (povoleneOrigins(env).includes(normalizovany)) return true;
  return jeSubdomenaZakladni(normalizovany, env.APP_BASE_DOMAIN);
}
