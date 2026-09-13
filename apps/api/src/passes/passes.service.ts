// PassesService — sjednocený pohled na VYDANÉ permanentky všech tří typů
// (kredity, bundle, časové) napříč klienty, plus pozastavení a obnovení.
//
// Šablony ani odečty tady nejsou — ty zůstávají v credit-packs / bundle-packs /
// time-packs. Tento modul je čtecí vrstva nad instancemi + dvě stavové akce.
//
// KLÍČOVÉ: stav se počítá z dat (`effectiveStatus`), ne ze sloupce `status`.
// Propadlá permanentka se v DB běžně tváří jako `active`, protože expiraci
// nikdo neuklízí (odečet ji filtruje až při čtení). Ve výpisu by to lhalo.

import {
  BadRequestException,
  ForbiddenException,
  Inject,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { and, eq, sql } from 'drizzle-orm';
import { schema } from '@reserved/db';
import { type AppRole, type TenantContext } from '@reserved/rls-multitenancy';
import { DbService, type Database } from '../db/db.service.js';
import type { ListPassesQueryDto, PassType, SuspendPassDto } from './dto/passes.dto.js';

const VIEW_ROLES: AppRole[] = ['owner', 'manager', 'receptionist', 'employee'];
const ACT_ROLES: AppRole[] = ['owner', 'manager', 'receptionist'];

function ctxFor(tenantId: string, userId: string, role: AppRole): TenantContext {
  return { tenantId, userId, role };
}

function assertCanView(role: AppRole): void {
  if (!VIEW_ROLES.includes(role)) {
    throw new ForbiddenException({
      error: { code: 'INSUFFICIENT_ROLE', message: 'Na permanentky klientů nemáš oprávnění.' },
    });
  }
}

function assertCanAct(role: AppRole): void {
  if (!ACT_ROLES.includes(role)) {
    throw new ForbiddenException({
      error: {
        code: 'INSUFFICIENT_ROLE',
        message: 'Pozastavit nebo obnovit permanentku může owner, manager nebo recepce.',
      },
    });
  }
}

interface PassRow {
  id: string;
  type: PassType;
  customerId: string | null;
  customerFirstName: string | null;
  customerLastName: string | null;
  customerEmail: string | null;
  corporateAccountId: string | null;
  /** Id šablony, ze které byla instance vydána. */
  packId: string | null;
  packName: string | null;
  /** NULL = neomezeno (časový balíček bez limitu počtu rezervací). */
  balanceRemaining: number | null;
  balanceTotal: number | null;
  validFrom: string;
  validUntil: string | null;
  storedStatus: string;
  effectiveStatus: string;
  pricePaidHellers: number;
  purchasedAt: string;
  soldBy: string | null;
  soldByName: string | null;
  note: string | null;
}

/**
 * Raw SQL přes `tx.execute` nevrací typované sloupce — čísla dorazí jako text
 * (`'5'` místo `5`). Pro UI i pro porovnávání musí být číslo číslo.
 */
function toNumber(value: unknown): number | null {
  if (value === null || value === undefined) return null;
  const n = typeof value === 'number' ? value : Number(value);
  return Number.isFinite(n) ? n : null;
}

/** Srovná číselná pole jednoho řádku do skutečných čísel. */
function normalizeRow(row: PassRow): PassRow {
  return {
    ...row,
    balanceRemaining: toNumber(row.balanceRemaining),
    balanceTotal: toNumber(row.balanceTotal),
    pricePaidHellers: toNumber(row.pricePaidHellers) ?? 0,
  };
}

/** Lidsky čitelný zůstatek — liší se podle typu, proto se skládá až tady. */
function balanceLabel(row: PassRow): string {
  if (row.type === 'time') {
    if (row.balanceTotal === null) return 'neomezeně';
    return `${row.balanceRemaining ?? 0} z ${row.balanceTotal} vstupů`;
  }
  if (row.type === 'bundle') {
    return `${row.balanceRemaining ?? 0} ks z ${row.balanceTotal ?? 0}`;
  }
  return `${row.balanceRemaining ?? 0} z ${row.balanceTotal ?? 0} kreditů`;
}

@Injectable()
export class PassesService {
  constructor(@Inject(DbService) private readonly dbService: DbService) {}

  /**
   * Společný SQL výraz pro vypočtený stav. Uložený stav má přednost jen u stavů,
   * které nejsou o čase ani zůstatku (pozastaveno, zrušeno, refundováno, přeneseno).
   */
  private static effectiveStatusSql(balanceExpr: ReturnType<typeof sql>): ReturnType<typeof sql> {
    return sql`CASE
      WHEN p.status IN ('suspended', 'cancelled', 'refunded', 'rolled_over') THEN p.status
      WHEN p.valid_until IS NOT NULL AND p.valid_until < now() THEN 'expired'
      WHEN ${balanceExpr} IS NOT NULL AND ${balanceExpr} <= 0 THEN 'used_up'
      ELSE 'active'
    END`;
  }

  /** Jedna větev UNION ALL — všechny tři mají stejné sloupce. */
  private static branch(
    table: string,
    type: PassType,
    templateTable: string,
    templateFk: string,
    balanceRemaining: ReturnType<typeof sql>,
    balanceTotal: ReturnType<typeof sql>,
    tenantId: string,
  ): ReturnType<typeof sql> {
    return sql`
      SELECT
        p.id,
        ${type}::text                     AS type,
        p.customer_id                     AS "customerId",
        c.first_name                      AS "customerFirstName",
        c.last_name                       AS "customerLastName",
        c.email                           AS "customerEmail",
        p.corporate_account_id            AS "corporateAccountId",
        p.${sql.raw(templateFk)}          AS "packId",
        t.name                            AS "packName",
        ${balanceRemaining}               AS "balanceRemaining",
        ${balanceTotal}                   AS "balanceTotal",
        p.valid_from                      AS "validFrom",
        p.valid_until                     AS "validUntil",
        p.status                          AS "storedStatus",
        ${PassesService.effectiveStatusSql(balanceRemaining)} AS "effectiveStatus",
        p.price_paid_hellers              AS "pricePaidHellers",
        p.purchased_at                    AS "purchasedAt",
        p.sold_by                         AS "soldBy",
        NULLIF(TRIM(CONCAT(u.first_name, ' ', u.last_name)), '') AS "soldByName",
        p.note                            AS note
      FROM ${sql.raw(table)} p
      LEFT JOIN customers c ON c.id = p.customer_id
      LEFT JOIN ${sql.raw(templateTable)} t ON t.id = p.${sql.raw(templateFk)}
      LEFT JOIN users u ON u.id = p.sold_by
      WHERE p.tenant_id = ${tenantId}
    `;
  }

  private static unionSql(tenantId: string): ReturnType<typeof sql> {
    const creditRemaining = sql`p.credits_remaining`;
    const creditTotal = sql`p.credits_at_purchase`;
    const bundleRemaining = sql`(
      SELECT COALESCE(SUM((i->>'quantity')::int), 0)
      FROM jsonb_array_elements(p.items_remaining) i
    )`;
    const bundleTotal = sql`(
      SELECT COALESCE(SUM((i->>'quantity')::int), 0)
      FROM jsonb_array_elements(p.snapshot_items) i
    )`;
    // Časový balíček bez limitu = neomezeně → zůstatek NULL, ať nespadne do used_up.
    const timeRemaining = sql`CASE
      WHEN p.snapshot_max_bookings_per_period IS NULL THEN NULL
      ELSE GREATEST(p.snapshot_max_bookings_per_period - p.bookings_used, 0)
    END`;
    const timeTotal = sql`p.snapshot_max_bookings_per_period`;

    return sql`
      ${PassesService.branch('customer_credit_packs', 'credit', 'credit_packs', 'credit_pack_id', creditRemaining, creditTotal, tenantId)}
      UNION ALL
      ${PassesService.branch('customer_bundle_packs', 'bundle', 'bundle_packs', 'bundle_pack_id', bundleRemaining, bundleTotal, tenantId)}
      UNION ALL
      ${PassesService.branch('customer_time_packs', 'time', 'time_packs', 'time_pack_id', timeRemaining, timeTotal, tenantId)}
    `;
  }

  // ─── Výpis napříč typy i klienty ────────────────────────────────────

  async list(tenantId: string, userId: string, role: AppRole, query: ListPassesQueryDto) {
    assertCanView(role);
    return this.dbService.withRlsContext(ctxFor(tenantId, userId, role), async (tx) => {
      const union = PassesService.unionSql(tenantId);
      const search = query.search ? `%${query.search}%` : null;

      const filters = sql`
        WHERE (${query.type ?? null}::text IS NULL OR p.type = ${query.type ?? null})
          AND (${query.status ?? null}::text IS NULL OR p."effectiveStatus" = ${query.status ?? null})
          AND (${query.customerId ?? null}::uuid IS NULL OR p."customerId" = ${query.customerId ?? null}::uuid)
          AND (${query.packId ?? null}::uuid IS NULL OR p."packId" = ${query.packId ?? null}::uuid)
          AND (
            ${search}::text IS NULL
            OR p."customerFirstName" ILIKE ${search}
            OR p."customerLastName" ILIKE ${search}
            OR p."customerEmail" ILIKE ${search}
          )
          AND (
            ${query.expiringWithinDays ?? null}::int IS NULL
            OR (
              p."validUntil" IS NOT NULL
              AND p."validUntil" >= now()
              AND p."validUntil" < now() + (${query.expiringWithinDays ?? null}::int * interval '1 day')
            )
          )
      `;

      const countRows = (await tx.execute(
        sql`SELECT COUNT(*)::int AS total FROM (${union}) p ${filters}`,
      )) as unknown as Array<{ total: unknown }>;
      const total = toNumber(countRows[0]?.total) ?? 0;

      const rawRows = (await tx.execute(
        sql`SELECT * FROM (${union}) p ${filters}
            ORDER BY p."purchasedAt" DESC
            LIMIT ${query.limit} OFFSET ${query.offset}`,
      )) as unknown as PassRow[];
      const rows = rawRows.map(normalizeRow);

      return {
        items: rows.map((r) => ({ ...r, balanceLabel: balanceLabel(r) })),
        total,
        limit: query.limit,
        offset: query.offset,
        hasMore: query.offset + rows.length < total,
      };
    });
  }

  // ─── Detail jedné instance ──────────────────────────────────────────

  async get(tenantId: string, userId: string, role: AppRole, type: PassType, id: string) {
    assertCanView(role);
    return this.dbService.withRlsContext(ctxFor(tenantId, userId, role), async (tx) => {
      const union = PassesService.unionSql(tenantId);
      const rawRows = (await tx.execute(
        sql`SELECT * FROM (${union}) p WHERE p.id = ${id}::uuid AND p.type = ${type}`,
      )) as unknown as PassRow[];
      const row = rawRows[0] ? normalizeRow(rawRows[0]) : undefined;
      if (!row) {
        throw new NotFoundException({
          error: { code: 'PASS_NOT_FOUND', message: 'Permanentka nenalezena.' },
        });
      }
      const snapshot = await this.loadSnapshot(tx, type, id);
      return { ...row, balanceLabel: balanceLabel(row), snapshot };
    });
  }

  /** Zmrazená konfigurace z doby prodeje — UI ji musí ukazovat místo šablony. */
  private async loadSnapshot(tx: Database, type: PassType, id: string) {
    if (type === 'credit') {
      const [r] = await tx
        .select({
          mode: schema.customerCreditPacks.snapshotMode,
          allowedServiceIds: schema.customerCreditPacks.snapshotAllowedServiceIds,
          allowedBranchIds: schema.customerCreditPacks.snapshotAllowedBranchIds,
          creditCosts: schema.customerCreditPacks.snapshotCreditCosts,
        })
        .from(schema.customerCreditPacks)
        .where(eq(schema.customerCreditPacks.id, id))
        .limit(1);
      return r ?? null;
    }
    if (type === 'bundle') {
      const [r] = await tx
        .select({
          items: schema.customerBundlePacks.snapshotItems,
          itemsRemaining: schema.customerBundlePacks.itemsRemaining,
          allowedBranchIds: schema.customerBundlePacks.snapshotAllowedBranchIds,
          sameVisitRequired: schema.customerBundlePacks.snapshotSameVisitRequired,
        })
        .from(schema.customerBundlePacks)
        .where(eq(schema.customerBundlePacks.id, id))
        .limit(1);
      return r ?? null;
    }
    const [r] = await tx
      .select({
        maxBookingsPerPeriod: schema.customerTimePacks.snapshotMaxBookingsPerPeriod,
        maxBookingsPerDay: schema.customerTimePacks.snapshotMaxBookingsPerDay,
        allowedServiceIds: schema.customerTimePacks.snapshotAllowedServiceIds,
        allowedBranchIds: schema.customerTimePacks.snapshotAllowedBranchIds,
        bookingsUsed: schema.customerTimePacks.bookingsUsed,
      })
      .from(schema.customerTimePacks)
      .where(eq(schema.customerTimePacks.id, id))
      .limit(1);
    return r ?? null;
  }

  // ─── Pozastavení a obnovení ─────────────────────────────────────────

  /**
   * Pozastaví permanentku. Stav `suspended` stačí k tomu, aby ji odečet při
   * rezervaci přeskočil — všechny tři `deductForBooking` berou jen `status='active'`.
   */
  async suspend(
    tenantId: string,
    userId: string,
    role: AppRole,
    type: PassType,
    id: string,
    dto: SuspendPassDto,
  ) {
    return this.setStatus(tenantId, userId, role, type, id, 'suspend', dto);
  }

  /** Obnoví pozastavenou permanentku do stavu `active`. */
  async resume(
    tenantId: string,
    userId: string,
    role: AppRole,
    type: PassType,
    id: string,
    dto: SuspendPassDto,
  ) {
    return this.setStatus(tenantId, userId, role, type, id, 'resume', dto);
  }

  private async setStatus(
    tenantId: string,
    userId: string,
    role: AppRole,
    type: PassType,
    id: string,
    action: 'suspend' | 'resume',
    dto: SuspendPassDto,
  ) {
    assertCanAct(role);
    return this.dbService.withRlsContext(ctxFor(tenantId, userId, role), async (tx) => {
      const current = await this.loadForStatusChange(tx, tenantId, type, id);
      if (!current) {
        throw new NotFoundException({
          error: { code: 'PASS_NOT_FOUND', message: 'Permanentka nenalezena.' },
        });
      }

      if (action === 'suspend' && current.status !== 'active') {
        throw new BadRequestException({
          error: {
            code: 'PASS_NOT_SUSPENDABLE',
            message:
              current.status === 'suspended'
                ? 'Permanentka už je pozastavená.'
                : `Pozastavit lze jen aktivní permanentku (tato je ve stavu ${current.status}).`,
          },
        });
      }
      if (action === 'resume' && current.status !== 'suspended') {
        throw new BadRequestException({
          error: { code: 'PASS_NOT_SUSPENDED', message: 'Permanentka není pozastavená.' },
        });
      }

      const newStatus = action === 'suspend' ? 'suspended' : 'active';
      const auditNote = `${action === 'suspend' ? 'Pozastaveno' : 'Obnoveno'}: ${dto.note}`;

      if (type === 'credit') {
        await tx
          .update(schema.customerCreditPacks)
          .set({ status: newStatus, updatedAt: new Date() })
          .where(eq(schema.customerCreditPacks.id, id));
        await tx.insert(schema.creditUses).values({
          tenantId,
          customerCreditPackId: id,
          bookingId: null,
          creditsDeducted: 0,
          action: 'admin_adjustment',
          performedBy: userId,
          note: auditNote,
        });
      } else if (type === 'bundle') {
        await tx
          .update(schema.customerBundlePacks)
          .set({ status: newStatus, updatedAt: new Date() })
          .where(eq(schema.customerBundlePacks.id, id));
        // Pozastavení se netýká konkrétní služby → service_id je NULL (migrace
        // 0085 sloupec zvolnila). Dřív se tu brala první služba ze snapshotu.
        await tx.insert(schema.bundleItemUses).values({
          tenantId,
          customerBundlePackId: id,
          bookingId: null,
          serviceId: null,
          quantityDeducted: 0,
          action: 'admin_adjustment',
          performedBy: userId,
          note: auditNote,
        });
      } else {
        await tx
          .update(schema.customerTimePacks)
          .set({ status: newStatus, updatedAt: new Date() })
          .where(eq(schema.customerTimePacks.id, id));
        await tx.insert(schema.timePackUses).values({
          tenantId,
          customerTimePackId: id,
          bookingId: null,
          serviceId: null,
          action: 'admin_adjustment',
          performedBy: userId,
          note: auditNote,
        });
      }

      return { id, type, status: newStatus };
    });
  }

  private async loadForStatusChange(
    tx: Database,
    tenantId: string,
    type: PassType,
    id: string,
  ): Promise<{ status: string } | null> {
    if (type === 'credit') {
      const [r] = await tx
        .select({ status: schema.customerCreditPacks.status })
        .from(schema.customerCreditPacks)
        .where(
          and(
            eq(schema.customerCreditPacks.id, id),
            eq(schema.customerCreditPacks.tenantId, tenantId),
          ),
        )
        .limit(1);
      return r ? { status: r.status } : null;
    }
    if (type === 'bundle') {
      const [r] = await tx
        .select({ status: schema.customerBundlePacks.status })
        .from(schema.customerBundlePacks)
        .where(
          and(
            eq(schema.customerBundlePacks.id, id),
            eq(schema.customerBundlePacks.tenantId, tenantId),
          ),
        )
        .limit(1);
      if (!r) return null;
      return { status: r.status };
    }
    const [r] = await tx
      .select({ status: schema.customerTimePacks.status })
      .from(schema.customerTimePacks)
      .where(
        and(eq(schema.customerTimePacks.id, id), eq(schema.customerTimePacks.tenantId, tenantId)),
      )
      .limit(1);
    return r ? { status: r.status } : null;
  }
}
