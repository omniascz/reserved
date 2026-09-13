// AccountLockoutService — evidence neúspěšných přihlášení a dočasné uzamčení účtu.
//
// ── PROČ VŮBEC ──────────────────────────────────────────────────────────────
// Omezovač požadavků je první vrstva, ne poslední: brání rychlému hádání z JEDNÉ
// adresy, ale útočník s deseti adresami ho obejde a účet nemá žádnou paměť.
// Tahle služba dává paměť — počítá neúspěchy k ÚČTU, ne k adrese.
//
// ── VOLBA ČÍSEL (10 pokusů / okno 15 min / zámek 15 min) ────────────────────
// Provoz salonu: recepční se ráno přihlašuje ve spěchu, občas s Caps Lockem,
// někdy na sdíleném počítači, kde prohlížeč napoví cizí heslo. Pět pokusů je
// na tohle málo — zamykali bychom vlastní zákazníky.
// Deset pokusů za 15 minut je pořád tvrdá hranice: s patnáctiminutovým zámkem
// vyjde nejvýš ~40 pokusů za hodinu, což je proti slovníkovému útoku (statisíce
// hesel) bezcenné. Delší zámek by z překlepu udělal výpadek směny.
//
// ── ZÁMEK SE POČÍTÁ, NEUKLÁDÁ ───────────────────────────────────────────────
// Není žádný sloupec `locked_until`. Stav plyne z řádků v `login_attempts`:
// tolik a tolik nevyřešených pokusů v okně = zamčeno do (poslední pokus + zámek).
// Důsledky, které jsou tu žádoucí:
//   - jeden zdroj pravdy, nedá se rozejít s realitou,
//   - zámek vyprší sám, nikdo ho nemusí aktivně rušit,
//   - „úspěšné přihlášení nuluje počítadlo" = označení pokusů za vyřešené.
//
// ── ZÁMEK JE NA ÚČTU, NE NA IP ──────────────────────────────────────────────
// Kdyby se počítalo podle IP, stačí přepnout na mobilní data a zámek je pryč.
// IP se proto jen zaznamenává do auditu. Zamyká se dvojice (tenant, e-mail).

import { Inject, Injectable, Logger } from '@nestjs/common';
import { and, eq, gte, isNull, sql } from 'drizzle-orm';
import { schema } from '@reserved/db';
import { serviceContext } from '@reserved/rls-multitenancy';
import { DbService } from '../db/db.service.js';
import { EmailService } from '../email/email.service.js';

/** Kolik neúspěšných pokusů v okně účet uzamkne. */
export const MAX_POKUSU = 10;
/** Okno, ve kterém se pokusy sčítají (minuty). */
export const OKNO_MINUT = 15;
/** Jak dlouho zámek trvá od posledního neúspěšného pokusu (minuty). */
export const ZAMEK_MINUT = 15;

export type DuvodNeuspechu = 'bad_password' | 'unknown_user' | 'inactive_user';

export interface StavZamku {
  zamceno: boolean;
  /** Kolik nevyřešených pokusů je v okně. */
  pokusu: number;
  /** Do kdy zámek trvá (null, když není zamčeno). */
  doKdy: Date | null;
  zbyvaSekund: number;
}

export interface KontextPokusu {
  ip?: string | null;
  userAgent?: string | null;
}

@Injectable()
export class AccountLockoutService {
  private readonly logger = new Logger('AccountLockout');

  constructor(
    @Inject(DbService) private readonly dbService: DbService,
    @Inject(EmailService) private readonly email: EmailService,
  ) {}

  /**
   * Stav zámku pro (tenant, e-mail).
   *
   * Běží pod rolí `service`: v okamžiku přihlašování ještě není znám uživatel,
   * takže běžný tenant kontext by na řádky nedosáhl.
   */
  async stav(tenantId: string, email: string): Promise<StavZamku> {
    const odKdy = new Date(Date.now() - OKNO_MINUT * 60_000);

    return this.dbService.withRlsContext(serviceContext(), async (tx) => {
      const rows = await tx
        .select({
          pocet: sql<number>`count(*)::int`,
          posledni: sql<Date | null>`max(${schema.loginAttempts.createdAt})`,
        })
        .from(schema.loginAttempts)
        .where(
          and(
            eq(schema.loginAttempts.tenantId, tenantId),
            eq(schema.loginAttempts.email, email.toLowerCase()),
            isNull(schema.loginAttempts.resolvedAt),
            gte(schema.loginAttempts.createdAt, odKdy),
          ),
        );

      const pokusu = rows[0]?.pocet ?? 0;
      const posledni = rows[0]?.posledni ? new Date(rows[0].posledni) : null;

      if (pokusu < MAX_POKUSU || !posledni) {
        return { zamceno: false, pokusu, doKdy: null, zbyvaSekund: 0 };
      }

      const doKdy = new Date(posledni.getTime() + ZAMEK_MINUT * 60_000);
      const zbyvaMs = doKdy.getTime() - Date.now();

      if (zbyvaMs <= 0) {
        // Zámek doběhl sám. Nic se nemaže — řádky zůstávají kvůli auditu,
        // jen už nezamykají, protože vypadly z okna.
        return { zamceno: false, pokusu, doKdy: null, zbyvaSekund: 0 };
      }

      return { zamceno: true, pokusu, doKdy, zbyvaSekund: Math.ceil(zbyvaMs / 1000) };
    });
  }

  /**
   * Zaznamená neúspěšný pokus. Když jím účet překročí hranici, pošle majiteli
   * upozornění — ale jen JEDNOU za zámek, ne při každém dalším pokusu.
   */
  async zaznamenejNeuspech(
    tenantId: string,
    email: string,
    duvod: DuvodNeuspechu,
    ctx: KontextPokusu,
    user?: { id: string; firstName: string; lastName: string } | null,
  ): Promise<void> {
    const normalizovany = email.toLowerCase();

    await this.dbService.withRlsContext(serviceContext(), async (tx) => {
      await tx.insert(schema.loginAttempts).values({
        tenantId,
        email: normalizovany,
        userId: user?.id ?? null,
        ipAddress: ctx.ip ?? null,
        userAgent: ctx.userAgent ?? null,
        reason: duvod,
      });
    });

    const poZapisu = await this.stav(tenantId, normalizovany);
    if (!poZapisu.zamceno) return;

    // Upozornění jen existujícímu účtu — na neexistující adresu nemá kam jít
    // a rozesílat poštu na cizí adresy podle toho, co někdo napsal do formuláře,
    // je samo o sobě zneužitelné.
    if (!user) return;

    await this.posliUpozorneni(tenantId, normalizovany, user, poZapisu, ctx);
  }

  /** Úspěšné přihlášení — pokusy se označí za vyřešené, počítadlo je na nule. */
  async vynulujPoUspechu(tenantId: string, email: string): Promise<number> {
    return this.oznacVyresene(tenantId, email.toLowerCase());
  }

  /**
   * Ruční odemčení (master admin). Vrací počet uvolněných pokusů.
   * Technicky totéž co úspěšné přihlášení — pokusy přestanou počítat.
   */
  async odemkni(tenantId: string, email: string): Promise<number> {
    const uvolneno = await this.oznacVyresene(tenantId, email.toLowerCase());
    this.logger.log(`Ruční odemčení ${email} (tenant ${tenantId}): ${uvolneno} pokusů uvolněno`);
    return uvolneno;
  }

  private async oznacVyresene(tenantId: string, email: string): Promise<number> {
    return this.dbService.withRlsContext(serviceContext(), async (tx) => {
      const res = await tx
        .update(schema.loginAttempts)
        .set({ resolvedAt: new Date() })
        .where(
          and(
            eq(schema.loginAttempts.tenantId, tenantId),
            eq(schema.loginAttempts.email, email),
            isNull(schema.loginAttempts.resolvedAt),
          ),
        )
        .returning({ id: schema.loginAttempts.id });
      return res.length;
    });
  }

  private async posliUpozorneni(
    tenantId: string,
    email: string,
    user: { id: string; firstName: string; lastName: string },
    stav: StavZamku,
    ctx: KontextPokusu,
  ): Promise<void> {
    // Jeden e-mail na jeden zámek. Kontrola jde do fronty notifikací přes
    // metadata — stejný postup jako u připomínek ověření e-mailu. Bez ní by
    // útočník každým dalším pokusem vyvolal další e-mail a udělal by z
    // upozornění nástroj na zahlcení schránky.
    const odKdy = new Date(Date.now() - ZAMEK_MINUT * 60_000);

    const jizPoslano = await this.dbService.withRlsContext(serviceContext(), async (tx) => {
      const res = await tx.execute(
        sql`SELECT 1 FROM notifications
            WHERE tenant_id = ${tenantId}
              AND template_code = 'account_locked'
              AND recipient = ${email}
              AND created_at >= ${odKdy.toISOString()}::timestamptz
            LIMIT 1`,
      );
      return Array.isArray(res) && res.length > 0;
    });

    if (jizPoslano) return;

    const tenantName = await this.dbService.withRlsContext(serviceContext(), async (tx) => {
      const rows = await tx
        .select({ name: schema.tenants.name })
        .from(schema.tenants)
        .where(eq(schema.tenants.id, tenantId))
        .limit(1);
      return rows[0]?.name ?? 'vašeho provozu';
    });

    // enqueue nikdy nehází — při nefunkčním SMTP zapíše 'failed' a vrátí stav.
    // Zámek na odeslání e-mailu NESMÍ záviset, proto se výsledek jen loguje.
    const res = await this.email.enqueue({
      tenantId,
      templateCode: 'account_locked',
      recipient: email,
      vars: {
        userName: `${user.firstName} ${user.lastName}`.trim() || 'uživateli',
        tenantName,
        attempts: stav.pokusu,
        lockMinutes: ZAMEK_MINUT,
        lastIp: ctx.ip ?? 'neznámé',
      },
    });

    if (res.status !== 'sent') {
      this.logger.warn(`Upozornění na zámek účtu ${email} skončilo jako '${res.status}'.`);
    }
  }
}
