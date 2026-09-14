// Custom domains — správa vlastních domén tenantů (např. booking.salonpetra.cz).
//
// Verifikace probíhá přes DNS TXT záznam:
//   _reserved-verification.<custom_domain>  TXT  "<verification_token>"
//
// Tenant si v admin UI přidá doménu, dostane token + DNS instrukce.
// Po nakonfigurování DNS spustí verifikaci. Pokud TXT match, marking
// custom_domain_verified_at = now() a middleware začne routovat traffic
// z té domény k tomuhle tenantovi.
//
// ── OKAMŽITÉ OBNOVENÍ SEZNAMU PRO CORS ──────────────────────────────────────
// Ověřené domény drží `PovoleneOriginyService` v paměti, aby se prohlížeči
// nemusel při každém požadavku dělat dotaz do databáze. Sama se obnovuje jednou
// za minutu; tady se navíc obnovuje OKAMŽITĚ po každé změně, aby zákazník
// nemusel po ověření čekat. Bez toho by mu rezervace na vlastní doméně
// nefungovala až minutu — nebo dřív vůbec, dokud se seznam bral z konfigurace
// a musel se kvůli tomu restartovat celý API.

import { Inject, Injectable, BadRequestException, ConflictException } from '@nestjs/common';
import { and, eq, ne, sql } from 'drizzle-orm';
import { promises as dns } from 'node:dns';
import { randomBytes } from 'node:crypto';
import { schema } from '@reserved/db';
import { serviceContext } from '@reserved/rls-multitenancy';
import { DbService } from '../db/db.service.js';
import { PovoleneOriginyService } from '../cors/povolene-originy.service.js';

export interface CustomDomainStatus {
  customDomain: string | null;
  verifiedAt: string | null;
  verificationToken: string | null;
  /** Hostname, kam musí TXT záznam ukazovat (pro instrukce v UI). */
  verificationRecord: string | null;
  /** CNAME target, kam má tenant nasměrovat doménu (pro hosting). */
  dnsTarget: string;
}

// Validace formátu domény. Vyžaduje plně kvalifikovanou (FQDN) bez schématu, bez cesty.
const DOMAIN_REGEX = /^(?=.{1,253}$)(?:[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?\.)+[a-z]{2,63}$/i;

// Domény, které nelze použít jako custom (předchází kolizi a sebevandalismu).
const RESERVED_SUFFIXES = ['reserved.cz', 'reserved.com', 'localhost'];

@Injectable()
export class CustomDomainsService {
  /** Cílový hostname, kam tenant nasměruje CNAME. Pro produkci z env. */
  private readonly dnsTarget: string;

  constructor(
    @Inject(DbService) private readonly dbService: DbService,
    @Inject(PovoleneOriginyService) private readonly originy: PovoleneOriginyService,
  ) {
    this.dnsTarget = process.env.RESERVED_CNAME_TARGET ?? 'cname.reserved.cz';
  }

  async getStatus(tenantId: string): Promise<CustomDomainStatus> {
    const tenant = await this.loadTenant(tenantId);
    return {
      customDomain: tenant.customDomain,
      verifiedAt: tenant.customDomainVerifiedAt
        ? tenant.customDomainVerifiedAt.toISOString()
        : null,
      verificationToken: tenant.customDomainVerificationToken,
      verificationRecord: tenant.customDomain
        ? `_reserved-verification.${tenant.customDomain}`
        : null,
      dnsTarget: this.dnsTarget,
    };
  }

  async setDomain(tenantId: string, domain: string): Promise<CustomDomainStatus> {
    const normalized = domain.toLowerCase().trim();
    this.validateDomain(normalized);

    // Kolize s jinym tenantem
    await this.dbService.withRlsContext(serviceContext(), async (tx) => {
      const collision = await tx
        .select({ id: schema.tenants.id })
        .from(schema.tenants)
        .where(and(eq(schema.tenants.customDomain, normalized), ne(schema.tenants.id, tenantId)))
        .limit(1);
      if (collision.length > 0) {
        throw new ConflictException({
          error: {
            code: 'DOMAIN_TAKEN',
            message: 'Tato doména je už registrovaná u jiného účtu.',
          },
        });
      }
    });

    // Generuj nový token a uloz domenu (unverified)
    const token = randomBytes(16).toString('hex');
    await this.dbService.withRlsContext(serviceContext(tenantId), async (tx) => {
      await tx
        .update(schema.tenants)
        .set({
          customDomain: normalized,
          customDomainVerifiedAt: null,
          customDomainVerificationToken: token,
          updatedAt: new Date(),
        })
        .where(eq(schema.tenants.id, tenantId));
    });

    // Nastavení domény ji NEOVĚŘUJE — do seznamu se tedy nedostane. Obnovit se
    // ale musí: tenant mohl mít předtím jinou, už ověřenou doménu, a ta právě
    // přestala platit. Bez obnovení by z ní šlo API volat dál.
    await this.originy.obnov();

    return this.getStatus(tenantId);
  }

  async removeDomain(tenantId: string): Promise<void> {
    await this.dbService.withRlsContext(serviceContext(tenantId), async (tx) => {
      await tx
        .update(schema.tenants)
        .set({
          customDomain: null,
          customDomainVerifiedAt: null,
          customDomainVerificationToken: null,
          updatedAt: new Date(),
        })
        .where(eq(schema.tenants.id, tenantId));
    });

    // Smazaná doména musí ze seznamu zmizet hned, ne až za minutu.
    await this.originy.obnov();
  }

  async verify(tenantId: string): Promise<CustomDomainStatus> {
    const tenant = await this.loadTenant(tenantId);

    if (!tenant.customDomain || !tenant.customDomainVerificationToken) {
      throw new BadRequestException({
        error: {
          code: 'NO_DOMAIN_SET',
          message: 'Nejdřív si nastav vlastní doménu a teprve potom ji ověř.',
        },
      });
    }

    const txtHost = `_reserved-verification.${tenant.customDomain}`;
    let records: string[];
    try {
      const result = await dns.resolveTxt(txtHost);
      records = result.flat();
    } catch (err) {
      const code = (err as NodeJS.ErrnoException).code ?? 'UNKNOWN';
      throw new BadRequestException({
        error: {
          code: 'DNS_LOOKUP_FAILED',
          message: `TXT záznam pro ${txtHost} se nepodařilo načíst (${code}). Zkontroluj nastavení DNS u registrátora.`,
        },
      });
    }

    const matchingRecord = records.find((r) => r === tenant.customDomainVerificationToken);
    if (!matchingRecord) {
      throw new BadRequestException({
        error: {
          code: 'TOKEN_MISMATCH',
          message: `TXT záznam pro ${txtHost} neobsahuje očekávanou hodnotu. Najdeš ji v sekci 'Vlastní doména' v admin nastavení.`,
        },
      });
    }

    // OK — označit jako ověřenou
    await this.dbService.withRlsContext(serviceContext(tenantId), async (tx) => {
      await tx
        .update(schema.tenants)
        .set({
          customDomainVerifiedAt: new Date(),
          updatedAt: new Date(),
        })
        .where(eq(schema.tenants.id, tenantId));
    });

    // TOHLE JE TEN PODSTATNÝ OKAMŽIK: doména je právě ověřená a zákazník
    // očekává, že mu rezervace na ní hned funguje. Obnovení bez restartu API.
    await this.originy.obnov();

    return this.getStatus(tenantId);
  }

  private validateDomain(domain: string): void {
    if (!DOMAIN_REGEX.test(domain)) {
      throw new BadRequestException({
        error: {
          code: 'INVALID_DOMAIN',
          message:
            'Doména musí být ve formátu booking.tvojesite.cz (FQDN, bez https://, bez cesty).',
        },
      });
    }
    for (const suffix of RESERVED_SUFFIXES) {
      if (domain === suffix || domain.endsWith(`.${suffix}`)) {
        throw new BadRequestException({
          error: {
            code: 'RESERVED_SUFFIX',
            message: `Doménu končící na .${suffix} si použít nemůžeš (kolize s platformou).`,
          },
        });
      }
    }
  }

  private async loadTenant(tenantId: string): Promise<{
    id: string;
    customDomain: string | null;
    customDomainVerifiedAt: Date | null;
    customDomainVerificationToken: string | null;
  }> {
    const rows = await this.dbService.withRlsContext(serviceContext(tenantId), async (tx) => {
      return tx
        .select({
          id: schema.tenants.id,
          customDomain: schema.tenants.customDomain,
          customDomainVerifiedAt: schema.tenants.customDomainVerifiedAt,
          customDomainVerificationToken: schema.tenants.customDomainVerificationToken,
        })
        .from(schema.tenants)
        .where(eq(schema.tenants.id, tenantId))
        .limit(1);
    });
    if (!rows[0]) {
      throw new BadRequestException({
        error: { code: 'TENANT_NOT_FOUND', message: 'Tenant neexistuje.' },
      });
    }
    return rows[0];
  }
}
