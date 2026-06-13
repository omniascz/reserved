// PosService — lehký POS (pultový prodej na recepci, sprint 10.19).
//
// Prodej produktů (s odečtem skladu), permanentek (alokace zákazníkovi) a
// ručních položek. Platba hotovost / karta-ručně / voucher. Vystaví záznam
// účtenky (R-RRRR-NNNN) a zapíše do DB. Plný terminál karet = až s platbami.

import {
  BadRequestException,
  ForbiddenException,
  Inject,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { and, desc, eq, gte, isNull, lte, sql } from 'drizzle-orm';
import { schema } from '@reserved/db';
import { type AppRole, type TenantContext } from '@reserved/rls-multitenancy';
import type { Database } from '../db/db.service.js';
import { DbService } from '../db/db.service.js';
import { CreditPacksService } from '../credit-packs/credit-packs.service.js';
import type { CreateProductDto, CreateSaleDto, UpdateProductDto } from './dto/pos.dto.js';

const MANAGE_ROLES: AppRole[] = ['owner', 'manager'];
const SELL_ROLES: AppRole[] = ['owner', 'manager', 'employee', 'receptionist'];
// Prodej permanentky = alokace zákazníkovi (musí odpovídat ALLOCATE_ROLES v credit-packs).
const PACK_SELL_ROLES: AppRole[] = ['owner', 'manager', 'receptionist'];

function ctxFor(tenantId: string, userId: string, role: AppRole): TenantContext {
  return { tenantId, userId, role };
}
function assert(roles: AppRole[], role: AppRole): void {
  if (!roles.includes(role)) {
    throw new ForbiddenException({
      error: { code: 'INSUFFICIENT_ROLE', message: 'Nedostatečná oprávnění.' },
    });
  }
}

@Injectable()
export class PosService {
  constructor(
    @Inject(DbService) private readonly dbService: DbService,
    @Inject(CreditPacksService) private readonly creditPacks: CreditPacksService,
  ) {}

  // ─── Produkty ──────────────────────────────────────────────────────────

  async createProduct(tenantId: string, userId: string, role: AppRole, dto: CreateProductDto) {
    assert(MANAGE_ROLES, role);
    return this.dbService.withRlsContext(ctxFor(tenantId, userId, role), async (tx) => {
      const [created] = await tx
        .insert(schema.posProducts)
        .values({
          tenantId,
          name: dto.name,
          sku: dto.sku ?? null,
          priceHellers: dto.priceHellers,
          vatRate: dto.vatRate,
          tracksStock: dto.tracksStock,
          stock: dto.stock,
          isActive: dto.isActive,
        })
        .returning();
      return created!;
    });
  }

  async listProducts(tenantId: string, userId: string, role: AppRole) {
    assert(SELL_ROLES, role);
    return this.dbService.withRlsContext(ctxFor(tenantId, userId, role), async (tx) => {
      return tx
        .select()
        .from(schema.posProducts)
        .where(and(eq(schema.posProducts.tenantId, tenantId), isNull(schema.posProducts.deletedAt)))
        .orderBy(schema.posProducts.name);
    });
  }

  async updateProduct(
    tenantId: string,
    userId: string,
    role: AppRole,
    id: string,
    dto: UpdateProductDto,
  ) {
    assert(MANAGE_ROLES, role);
    return this.dbService.withRlsContext(ctxFor(tenantId, userId, role), async (tx) => {
      const patch: Record<string, unknown> = { updatedAt: new Date() };
      for (const k of [
        'name',
        'sku',
        'priceHellers',
        'vatRate',
        'tracksStock',
        'stock',
        'isActive',
      ] as const) {
        if (dto[k] !== undefined) patch[k] = dto[k];
      }
      const [updated] = await tx
        .update(schema.posProducts)
        .set(patch)
        .where(
          and(
            eq(schema.posProducts.id, id),
            eq(schema.posProducts.tenantId, tenantId),
            isNull(schema.posProducts.deletedAt),
          ),
        )
        .returning();
      if (!updated) {
        throw new NotFoundException({
          error: { code: 'PRODUCT_NOT_FOUND', message: 'Produkt nenalezen.' },
        });
      }
      return updated;
    });
  }

  async deleteProduct(tenantId: string, userId: string, role: AppRole, id: string) {
    assert(MANAGE_ROLES, role);
    return this.dbService.withRlsContext(ctxFor(tenantId, userId, role), async (tx) => {
      const [deleted] = await tx
        .update(schema.posProducts)
        .set({ deletedAt: new Date(), updatedAt: new Date() })
        .where(
          and(
            eq(schema.posProducts.id, id),
            eq(schema.posProducts.tenantId, tenantId),
            isNull(schema.posProducts.deletedAt),
          ),
        )
        .returning({ id: schema.posProducts.id });
      if (!deleted) {
        throw new NotFoundException({
          error: { code: 'PRODUCT_NOT_FOUND', message: 'Produkt nenalezen.' },
        });
      }
      return { deleted: true };
    });
  }

  // ─── Prodej ──────────────────────────────────────────────────────────

  async createSale(tenantId: string, userId: string, role: AppRole, dto: CreateSaleDto) {
    assert(SELL_ROLES, role);

    const packAllocations: Array<{ creditPackId: string; priceHellers: number }> = [];
    const hasPack = dto.items.some((i) => i.itemType === 'pack');
    if (hasPack && !dto.customerId) {
      throw new BadRequestException({
        error: {
          code: 'CUSTOMER_REQUIRED_FOR_PACK',
          message: 'Prodej permanentky vyžaduje zákazníka.',
        },
      });
    }
    if (hasPack) assert(PACK_SELL_ROLES, role); // permanentku smí prodat jen kdo ji smí alokovat

    const result = await this.dbService.withRlsContext(
      ctxFor(tenantId, userId, role),
      async (tx) => {
        const lines: Array<{
          itemType: string;
          refId: string | null;
          name: string;
          quantity: number;
          unitPriceHellers: number;
          vatRate: number;
          lineTotalHellers: number;
        }> = [];

        for (const item of dto.items) {
          if (item.itemType === 'product') {
            const line = await this.resolveProduct(tx, tenantId, item.refId, item.quantity);
            lines.push(line);
          } else if (item.itemType === 'pack') {
            const line = await this.resolvePack(tx, tenantId, item.refId, item.quantity);
            lines.push(line);
            packAllocations.push({
              creditPackId: item.refId!,
              priceHellers: line.unitPriceHellers,
            });
          } else {
            // manual
            if (!item.name || item.unitPriceHellers === undefined) {
              throw new BadRequestException({
                error: {
                  code: 'MANUAL_ITEM_INVALID',
                  message: 'Ruční položka potřebuje název a cenu.',
                },
              });
            }
            lines.push({
              itemType: 'manual',
              refId: null,
              name: item.name,
              quantity: item.quantity,
              unitPriceHellers: item.unitPriceHellers,
              vatRate: item.vatRate ?? 21,
              lineTotalHellers: item.unitPriceHellers * item.quantity,
            });
          }
        }

        const total = lines.reduce((s, l) => s + l.lineTotalHellers, 0);
        const receiptNumber = await this.nextReceiptNumber(tx, tenantId);

        const [sale] = await tx
          .insert(schema.posSales)
          .values({
            tenantId,
            branchId: dto.branchId ?? null,
            customerId: dto.customerId ?? null,
            receiptNumber,
            totalHellers: total,
            paymentMethod: dto.paymentMethod,
            note: dto.note ?? null,
            createdBy: userId,
          })
          .returning();

        for (const l of lines) {
          await tx.insert(schema.posSaleItems).values({ tenantId, saleId: sale!.id, ...l });
        }

        return { sale: sale!, lines };
      },
    );

    // Po commitu: alokuj prodané permanentky zákazníkovi (vlastní transakce).
    const allocationIds: string[] = [];
    for (const pa of packAllocations) {
      const alloc = await this.creditPacks.allocateToCustomer(
        tenantId,
        userId,
        role,
        dto.customerId!,
        { creditPackId: pa.creditPackId, pricePaidHellers: pa.priceHellers },
      );
      allocationIds.push(alloc.id);
    }

    return {
      id: result.sale.id,
      receiptNumber: result.sale.receiptNumber,
      totalHellers: result.sale.totalHellers,
      paymentMethod: result.sale.paymentMethod,
      items: result.lines,
      packAllocationIds: allocationIds,
    };
  }

  async listSales(
    tenantId: string,
    userId: string,
    role: AppRole,
    range?: { from?: string; to?: string },
  ) {
    assert(SELL_ROLES, role);
    return this.dbService.withRlsContext(ctxFor(tenantId, userId, role), async (tx) => {
      const conds = [eq(schema.posSales.tenantId, tenantId)];
      if (range?.from) conds.push(gte(schema.posSales.createdAt, new Date(range.from)));
      if (range?.to) conds.push(lte(schema.posSales.createdAt, new Date(range.to)));
      return tx
        .select()
        .from(schema.posSales)
        .where(and(...conds))
        .orderBy(desc(schema.posSales.createdAt))
        .limit(500);
    });
  }

  async getSale(tenantId: string, userId: string, role: AppRole, id: string) {
    assert(SELL_ROLES, role);
    return this.dbService.withRlsContext(ctxFor(tenantId, userId, role), async (tx) => {
      const [sale] = await tx
        .select()
        .from(schema.posSales)
        .where(and(eq(schema.posSales.id, id), eq(schema.posSales.tenantId, tenantId)))
        .limit(1);
      if (!sale) {
        throw new NotFoundException({
          error: { code: 'SALE_NOT_FOUND', message: 'Prodej nenalezen.' },
        });
      }
      const items = await tx
        .select()
        .from(schema.posSaleItems)
        .where(eq(schema.posSaleItems.saleId, id));
      return { ...sale, items };
    });
  }

  /** Denní/období uzávěrka — součty dle způsobu platby. */
  async report(tenantId: string, userId: string, role: AppRole, from: Date, to: Date) {
    assert(SELL_ROLES, role);
    return this.dbService.withRlsContext(ctxFor(tenantId, userId, role), async (tx) => {
      const rows = await tx
        .select({
          paymentMethod: schema.posSales.paymentMethod,
          count: sql<number>`count(*)::int`,
          total: sql<number>`coalesce(sum(${schema.posSales.totalHellers}), 0)::int`,
        })
        .from(schema.posSales)
        .where(
          and(
            eq(schema.posSales.tenantId, tenantId),
            gte(schema.posSales.createdAt, from),
            lte(schema.posSales.createdAt, to),
          ),
        )
        .groupBy(schema.posSales.paymentMethod);

      const byMethod = rows.map((r) => ({
        paymentMethod: r.paymentMethod,
        count: r.count,
        totalHellers: r.total,
      }));
      return {
        from: from.toISOString(),
        to: to.toISOString(),
        byMethod,
        totals: {
          count: byMethod.reduce((s, r) => s + r.count, 0),
          totalHellers: byMethod.reduce((s, r) => s + r.totalHellers, 0),
        },
      };
    });
  }

  // ─── Pomocné ─────────────────────────────────────────────────────────

  private async resolveProduct(
    tx: Database,
    tenantId: string,
    refId: string | null | undefined,
    qty: number,
  ) {
    if (!refId) {
      throw new BadRequestException({
        error: { code: 'PRODUCT_REF_REQUIRED', message: 'Položka produktu potřebuje refId.' },
      });
    }
    const [p] = await tx
      .select()
      .from(schema.posProducts)
      .where(
        and(
          eq(schema.posProducts.id, refId),
          eq(schema.posProducts.tenantId, tenantId),
          isNull(schema.posProducts.deletedAt),
        ),
      )
      .limit(1);
    if (!p) {
      throw new NotFoundException({
        error: { code: 'PRODUCT_NOT_FOUND', message: 'Produkt nenalezen.' },
      });
    }
    if (p.tracksStock) {
      // Atomický odečet skladu — neprodá pod 0.
      const dec = await tx
        .update(schema.posProducts)
        .set({ stock: sql`${schema.posProducts.stock} - ${qty}`, updatedAt: new Date() })
        .where(
          and(
            eq(schema.posProducts.id, refId),
            eq(schema.posProducts.tenantId, tenantId),
            gte(schema.posProducts.stock, qty),
          ),
        )
        .returning({ stock: schema.posProducts.stock });
      if (dec.length === 0) {
        throw new BadRequestException({
          error: {
            code: 'INSUFFICIENT_STOCK',
            message: `Nedostatek skladu pro „${p.name}".`,
          },
        });
      }
    }
    return {
      itemType: 'product',
      refId,
      name: p.name,
      quantity: qty,
      unitPriceHellers: p.priceHellers,
      vatRate: p.vatRate,
      lineTotalHellers: p.priceHellers * qty,
    };
  }

  private async resolvePack(
    tx: Database,
    tenantId: string,
    refId: string | null | undefined,
    qty: number,
  ) {
    if (!refId) {
      throw new BadRequestException({
        error: { code: 'PACK_REF_REQUIRED', message: 'Položka permanentky potřebuje refId.' },
      });
    }
    const [pack] = await tx
      .select({ name: schema.creditPacks.name, priceHellers: schema.creditPacks.priceHellers })
      .from(schema.creditPacks)
      .where(and(eq(schema.creditPacks.id, refId), eq(schema.creditPacks.tenantId, tenantId)))
      .limit(1);
    if (!pack) {
      throw new NotFoundException({
        error: { code: 'PACK_NOT_FOUND', message: 'Šablona permanentky nenalezena.' },
      });
    }
    return {
      itemType: 'pack',
      refId,
      name: pack.name,
      quantity: qty,
      unitPriceHellers: pack.priceHellers,
      vatRate: 0, // permanentky = předplacená služba
      lineTotalHellers: pack.priceHellers * qty,
    };
  }

  private async nextReceiptNumber(tx: Database, tenantId: string): Promise<string> {
    const year = new Date().getUTCFullYear();
    const prefix = `R-${year}-`;
    const [row] = await tx
      .select({ n: sql<number>`count(*)::int` })
      .from(schema.posSales)
      .where(
        and(
          eq(schema.posSales.tenantId, tenantId),
          sql`${schema.posSales.receiptNumber} LIKE ${prefix + '%'}`,
        ),
      );
    const next = (row?.n ?? 0) + 1;
    return `${prefix}${String(next).padStart(4, '0')}`;
  }
}
