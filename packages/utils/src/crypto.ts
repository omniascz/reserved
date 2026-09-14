// Šifrování citlivých hodnot ukládaných do databáze (AES-256-GCM).
//
// ── K ČEMU ──────────────────────────────────────────────────────────────────
// Přístupové údaje platebních bran (`payment_methods.config`) se dosud ukládaly
// čitelně. Kdo získá přístup k databázi nebo k záloze, získá i klíče k cizím
// penězům. Tohle je zašifruje klíčem, který v databázi NENÍ — leží v proměnné
// prostředí, takže samotný dump databáze je k ničemu.
//
// ── PROČ GCM, A NE JEN CBC ──────────────────────────────────────────────────
// GCM je autentizované šifrování: kromě utajení hlídá i to, že se šifrovaným
// textem nikdo nezamíchal. Kdyby útočník s přístupem do databáze přepsal
// jediný bajt, dešifrování skončí chybou místo toho, aby vrátilo tiše
// poškozená data.
//
// ── FORMÁT ULOŽENÉ HODNOTY ──────────────────────────────────────────────────
//   enc.v1:<iv base64>:<authTag base64>:<šifrovaný text base64>
// Verze je v prefixu schválně: až se bude měnit algoritmus, půjde starý formát
// rozpoznat a převést, místo aby se hádalo podle délky.
//
// ── TOLERANCE K NEZAŠIFROVANÝM DATŮM ────────────────────────────────────────
// `decryptConfig` vrátí hodnotu beze změny, když v ní prefix není. To je
// záměr, ne nedbalost: kdyby převodní skript nedoběhl nebo se přidal řádek
// mimo aplikaci, přístupy k branám se nesmí ztratit. Převod se tím dá dělat
// postupně a bez výpadku.

import { createCipheriv, createDecipheriv, randomBytes } from 'node:crypto';

const ALGORITMUS = 'aes-256-gcm';
const PREFIX = 'enc.v1:';
/** Doporučená délka IV pro GCM je 12 bajtů. */
const IV_BAJTU = 12;
const KLIC_BAJTU = 32;

/** Klíč obalený v jednoduchém typu, ať se nepředá omylem obyčejný řetězec. */
export interface SifrovaciKlic {
  readonly raw: Buffer;
}

/**
 * Přečte klíč z textové podoby (proměnná prostředí).
 *
 * Přijímá 64 hexadecimálních znaků nebo base64 — po dekódování musí vyjít
 * přesně 32 bajtů. Kratší klíč se ZÁMĚRNĚ neprodlužuje odvozením: tichý
 * dopočet by zamaskoval, že provozovatel nastavil slabé tajemství.
 */
export function nactiKlic(hodnota: string | undefined, nazevPromenne: string): SifrovaciKlic {
  if (!hodnota || hodnota.trim() === '') {
    throw new Error(
      `${nazevPromenne} není nastavená. Vygeneruj klíč příkazem: openssl rand -hex 32`,
    );
  }

  const text = hodnota.trim();
  let raw: Buffer;

  if (/^[0-9a-fA-F]{64}$/.test(text)) {
    raw = Buffer.from(text, 'hex');
  } else {
    raw = Buffer.from(text, 'base64');
  }

  if (raw.length !== KLIC_BAJTU) {
    throw new Error(
      `${nazevPromenne} musí být 32 bajtů (64 hex znaků nebo base64), ` +
        `dostal jsem ${raw.length} B. Vygeneruj: openssl rand -hex 32`,
    );
  }

  return { raw };
}

/** Zašifruje text. Každé volání použije nový IV, takže stejný vstup dá jiný výstup. */
export function zasifruj(text: string, klic: SifrovaciKlic): string {
  const iv = randomBytes(IV_BAJTU);
  const cipher = createCipheriv(ALGORITMUS, klic.raw, iv);
  const sifrovano = Buffer.concat([cipher.update(text, 'utf8'), cipher.final()]);
  const tag = cipher.getAuthTag();
  return `${PREFIX}${iv.toString('base64')}:${tag.toString('base64')}:${sifrovano.toString('base64')}`;
}

/** Pozná, jestli hodnota prošla `zasifruj`. */
export function jeZasifrovano(hodnota: unknown): hodnota is string {
  return typeof hodnota === 'string' && hodnota.startsWith(PREFIX);
}

/**
 * Dešifruje hodnotu vytvořenou funkcí `zasifruj`.
 *
 * Hází, když je hodnota poškozená nebo šifrovaná jiným klíčem — tiché
 * vracení nesmyslů by znamenalo, že se platba pokusí odejít s rozbitými
 * přihlašovacími údaji a chyba se projeví až u brány.
 */
export function desifruj(hodnota: string, klic: SifrovaciKlic): string {
  if (!jeZasifrovano(hodnota)) {
    throw new Error('Hodnota není v očekávaném formátu (chybí prefix enc.v1:).');
  }

  const casti = hodnota.slice(PREFIX.length).split(':');
  if (casti.length !== 3) {
    throw new Error('Poškozená šifrovaná hodnota: očekávám iv:tag:data.');
  }

  const [ivB64, tagB64, dataB64] = casti as [string, string, string];
  const decipher = createDecipheriv(ALGORITMUS, klic.raw, Buffer.from(ivB64, 'base64'));
  decipher.setAuthTag(Buffer.from(tagB64, 'base64'));

  try {
    return Buffer.concat([
      decipher.update(Buffer.from(dataB64, 'base64')),
      decipher.final(),
    ]).toString('utf8');
  } catch {
    // Rozlišení „špatný klíč" od „poškozená data" schválně nevydáváme —
    // útočníkovi by to napovídalo, jak si ověřit uhodnutý klíč.
    throw new Error('Dešifrování selhalo: špatný klíč nebo poškozená data.');
  }
}

// ── Obálka pro celý objekt konfigurace ──────────────────────────────────────
//
// Šifruje se CELÝ objekt, ne jednotlivé klíče. Důvod: seznam „co je tajné" by
// se musel udržovat pro každou novou bránu zvlášť, a na první zapomenutý klíč
// by se přišlo až únikem. Takhle je tajné všechno, včetně identifikátoru
// obchodníka.

/** Klíč obálky v uloženém jsonb. */
const OBALKA = '__enc';

/** Zabalí objekt do tvaru `{ __enc: "enc.v1:..." }` pro uložení do jsonb. */
export function zasifrujKonfiguraci(
  config: Record<string, unknown>,
  klic: SifrovaciKlic,
): Record<string, unknown> {
  return { [OBALKA]: zasifruj(JSON.stringify(config), klic) };
}

/**
 * Rozbalí uloženou konfiguraci.
 *
 * Když obálka chybí, vrací vstup beze změny — viz poznámka o toleranci
 * v hlavičce souboru.
 */
export function desifrujKonfiguraci(
  ulozeno: Record<string, unknown> | null | undefined,
  klic: SifrovaciKlic,
): Record<string, unknown> {
  if (!ulozeno || typeof ulozeno !== 'object') return {};

  const obalka = (ulozeno as Record<string, unknown>)[OBALKA];
  if (!jeZasifrovano(obalka)) {
    // Ještě nezašifrovaný (starý) záznam.
    return ulozeno;
  }

  const rozbaleno = JSON.parse(desifruj(obalka, klic)) as unknown;
  return rozbaleno && typeof rozbaleno === 'object' ? (rozbaleno as Record<string, unknown>) : {};
}

/** Pozná, jestli uložená konfigurace už je zašifrovaná (pro převodní skript). */
export function konfiguraceJeZasifrovana(ulozeno: unknown): boolean {
  return (
    !!ulozeno &&
    typeof ulozeno === 'object' &&
    jeZasifrovano((ulozeno as Record<string, unknown>)[OBALKA])
  );
}
