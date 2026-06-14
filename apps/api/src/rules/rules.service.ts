// RulesService — CRUD pro pravidla + listener na DomainEvent.
//
// Při události:
//   1. Najdi enabled pravidla pro daný tenant + trigger
//   2. Setřiď podle priority (vyšší dřív)
//   3. Pro každé pravidlo: evaluate condition tree → match? → dispatch actions
//   4. Loguj exekuci do rule_executions

import {
  ConflictException,
  ForbiddenException,
  Inject,
  Injectable,
  Logger,
  NotFoundException,
  OnModuleInit,
} from '@nestjs/common';
import { and, desc, eq, isNull } from 'drizzle-orm';
import { schema } from '@reserved/db';
import { type AppRole, serviceContext, type TenantContext } from '@reserved/rls-multitenancy';
import {
  matches,
  RuleInputSchema,
  type ConditionNode,
  type RuleEvaluationContext,
  type RuleInput,
} from '@reserved/rules-engine';
import { CreditPacksService } from '../credit-packs/credit-packs.service.js';
import { DbService } from '../db/db.service.js';
import { EmailService } from '../email/email.service.js';
import { PaymentsService } from '../payments/payments.service.js';
import { EventBus, type DomainEvent } from './events.bus.js';
import { ActionRegistry, type ActionContext, type ActionResult } from './action-handlers.js';

const MANAGE_ROLES: AppRole[] = ['owner', 'manager'];

function ctxFor(tenantId: string, userId: string, role: AppRole): TenantContext {
  return { tenantId, userId, role };
}

function assertCanManage(role: AppRole): void {
  if (!MANAGE_ROLES.includes(role)) {
    throw new ForbiddenException({
      error: {
        code: 'INSUFFICIENT_ROLE',
        message: 'Pouze owner nebo manager může spravovat pravidla.',
      },
    });
  }
}

@Injectable()
export class RulesService implements OnModuleInit {
  private readonly logger = new Logger('RulesService');
  private readonly registry = new ActionRegistry();

  constructor(
    @Inject(DbService) private readonly dbService: DbService,
    @Inject(EventBus) private readonly bus: EventBus,
    @Inject(EmailService) private readonly email: EmailService,
    @Inject(CreditPacksService) private readonly creditPacks: CreditPacksService,
    @Inject(PaymentsService) private readonly payments: PaymentsService,
  ) {}

  onModuleInit(): void {
    // Registruj akční handlery
    this.registry.register('log_message', async (ctx, config) => {
      this.logger.log(
        `[Rule action] tenant=${ctx.tenantId} booking=${ctx.payload.bookingId} ${config.message ?? '(no message)'}`,
      );
      return { action: 'log_message', status: 'ok' };
    });

    this.registry.register('send_email', async (ctx, config) => {
      const to = (config.to as string)?.trim() || ctx.payload.customerEmail;
      const subjectTpl = (config.subject as string) ?? 'Notifikace z rezervace';
      const bodyTpl = String(config.body ?? '');

      try {
        await this.email.enqueue({
          tenantId: ctx.tenantId,
          templateCode: 'custom',
          recipient: to,
          relatedBookingId: ctx.payload.bookingId,
          vars: {
            __customSubject: subjectTpl,
            __customBody: bodyTpl,
            // Všechny payload klíče dostupné jako {{var}} v subject/body
            ...(ctx.payload as unknown as Record<string, unknown>),
          },
        });
        return {
          action: 'send_email',
          status: 'ok',
          data: { to, subject: subjectTpl.slice(0, 80) },
        };
      } catch (err) {
        return {
          action: 'send_email',
          status: 'failed',
          message: err instanceof Error ? err.message : String(err),
        };
      }
    });

    this.registry.register('add_customer_tag', async (ctx, config) => {
      if (!ctx.payload.customerId) {
        return { action: 'add_customer_tag', status: 'skipped', message: 'No customer.' };
      }
      const tag = String(config.tag ?? '').trim();
      if (!tag) {
        return { action: 'add_customer_tag', status: 'failed', message: 'Tag is empty.' };
      }
      try {
        // Přímý DB insert s service contextem — obejde role-check v CustomersService.
        await this.dbService.withRlsContext(serviceContext(ctx.tenantId), async (tx) => {
          await tx
            .insert(schema.customerTags)
            .values({
              tenantId: ctx.tenantId,
              customerId: ctx.payload.customerId!,
              tag,
              color: (config.color as string) ?? null,
            })
            .onConflictDoNothing();
        });
        return { action: 'add_customer_tag', status: 'ok', data: { tag } };
      } catch (err) {
        return {
          action: 'add_customer_tag',
          status: 'failed',
          message: err instanceof Error ? err.message : String(err),
        };
      }
    });

    this.registry.register('webhook', async (ctx, config) => {
      const url = config.url as string;
      if (!url) return { action: 'webhook', status: 'failed', message: 'Missing url.' };
      try {
        const res = await fetch(url, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ tenantId: ctx.tenantId, ...ctx.payload }),
        });
        return {
          action: 'webhook',
          status: res.ok ? 'ok' : 'failed',
          message: `HTTP ${res.status}`,
        };
      } catch (err) {
        return {
          action: 'webhook',
          status: 'failed',
          message: err instanceof Error ? err.message : String(err),
        };
      }
    });

    this.registry.register('charge_storno_fee', async (ctx, config) => {
      const percent = Number(config.percent ?? 0);
      const feeHellers = Math.round((ctx.payload.pricePaidHellers * percent) / 100);

      // Reálný strh přes napojenou bránu (P4). Bez napojení → skipped.
      const result = await this.payments.chargeStornoFee({
        tenantId: ctx.tenantId,
        bookingId: ctx.payload.bookingId,
        feeHellers,
        reason: ctx.payload.reason ?? null,
      });

      if (!result.charged) {
        this.logger.log(
          `[charge_storno_fee] neúčtováno (${result.reason}) booking=${ctx.payload.bookingId} fee=${feeHellers / 100}`,
        );
        return {
          action: 'charge_storno_fee',
          // Bez napojené brány to není chyba pravidla — jen se neúčtuje.
          status: result.reason === 'payments_not_connected' ? 'skipped' : 'ok',
          data: { percent, feeHellers, charged: false, reason: result.reason },
        };
      }

      // Pošli klientovi odkaz k úhradě poplatku.
      try {
        await this.email.enqueue({
          tenantId: ctx.tenantId,
          templateCode: 'custom',
          recipient: ctx.payload.customerEmail,
          relatedBookingId: ctx.payload.bookingId,
          vars: {
            __customSubject: 'Storno / no-show poplatek k úhradě',
            __customBody: `Za zrušení nebo nedostavení účtujeme poplatek ${feeHellers / 100}. Uhradit jej můžete zde: ${result.checkoutUrl}`,
          },
        });
      } catch (err) {
        this.logger.warn(
          `[charge_storno_fee] e-mail s odkazem selhal: ${err instanceof Error ? err.message : String(err)}`,
        );
      }

      this.logger.log(
        `[charge_storno_fee] účtováno ${feeHellers / 100} přes ${result.provider}, payment=${result.paymentId}`,
      );
      return {
        action: 'charge_storno_fee',
        status: 'ok',
        data: {
          percent,
          feeHellers,
          charged: true,
          paymentId: result.paymentId,
          provider: result.provider,
          checkoutUrl: result.checkoutUrl,
        },
      };
    });

    this.registry.register('deduct_credit_pack', async (ctx, config) => {
      if (!ctx.payload.customerId) {
        return { action: 'deduct_credit_pack', status: 'skipped', message: 'No customer.' };
      }
      const credits = Number(config.credits ?? 1);
      const reason = String(
        config.reason ?? `Penalty from rule (booking ${ctx.payload.bookingId})`,
      );
      const result = await this.creditPacks.deductPenalty({
        tenantId: ctx.tenantId,
        customerId: ctx.payload.customerId,
        bookingId: ctx.payload.bookingId,
        credits,
        reason,
      });
      if (!result) {
        return {
          action: 'deduct_credit_pack',
          status: 'skipped',
          message: 'Zákazník nemá aktivní permanentku.',
        };
      }
      return { action: 'deduct_credit_pack', status: 'ok', data: result };
    });

    // Listen on event bus
    this.bus.on(async (event) => this.handleEvent(event));
  }

  // ─── Event handler ─────────────────────────────────────────────────

  private async handleEvent(event: DomainEvent): Promise<void> {
    const rules = await this.findMatchingRules(event.tenantId, event.type);
    if (rules.length === 0) return;

    const evalCtx: RuleEvaluationContext = {
      tenantId: event.tenantId,
      event: event.type,
      payload: event.payload,
      now: event.emittedAt,
    };
    const actionCtx: ActionContext = { tenantId: event.tenantId, payload: event.payload };

    for (const rule of rules) {
      const start = Date.now();
      let matched = false;
      const actionResults: ActionResult[] = [];
      let error: string | null = null;

      try {
        const tree = (rule.conditions ?? { type: 'always' }) as ConditionNode;
        matched = matches(tree, evalCtx);
        if (matched) {
          const actions = (rule.actions ?? []) as Array<{
            type: string;
            config: Record<string, unknown>;
          }>;
          for (const act of actions) {
            const result = await this.registry.dispatch(
              { type: act.type as never, config: act.config },
              actionCtx,
            );
            actionResults.push(result);
          }
        }
      } catch (err) {
        error = err instanceof Error ? err.message : String(err);
        this.logger.error(`Rule ${rule.id} evaluation failed: ${error}`);
      }

      const durationMs = Date.now() - start;

      // Log execution + update counter (separately so log success doesn't depend on counter)
      try {
        await this.dbService.withRlsContext(serviceContext(event.tenantId), async (tx) => {
          await tx.insert(schema.ruleExecutions).values({
            tenantId: event.tenantId,
            ruleId: rule.id,
            eventType: event.type,
            eventPayload: event.payload as unknown as Record<string, unknown>,
            matched,
            actionResults,
            durationMs,
            error,
          });
          if (matched) {
            await tx
              .update(schema.rules)
              .set({
                triggerCount: rule.triggerCount + 1,
                lastTriggeredAt: new Date(),
              })
              .where(eq(schema.rules.id, rule.id));
          }
        });
      } catch (err) {
        this.logger.error(`Failed to log execution for rule ${rule.id}: ${(err as Error).message}`);
      }
    }
  }

  private async findMatchingRules(tenantId: string, event: string) {
    return this.dbService.withRlsContext(serviceContext(tenantId), async (tx) => {
      return tx
        .select()
        .from(schema.rules)
        .where(
          and(
            eq(schema.rules.tenantId, tenantId),
            eq(schema.rules.triggerEvent, event),
            eq(schema.rules.isEnabled, true),
            isNull(schema.rules.deletedAt),
          ),
        )
        .orderBy(desc(schema.rules.priority));
    });
  }

  // ─── CRUD ──────────────────────────────────────────────────────────

  async list(tenantId: string, userId: string, role: AppRole) {
    return this.dbService.withRlsContext(ctxFor(tenantId, userId, role), async (tx) => {
      return tx
        .select()
        .from(schema.rules)
        .where(and(eq(schema.rules.tenantId, tenantId), isNull(schema.rules.deletedAt)))
        .orderBy(desc(schema.rules.priority), schema.rules.name);
    });
  }

  async get(tenantId: string, userId: string, role: AppRole, id: string) {
    return this.dbService.withRlsContext(ctxFor(tenantId, userId, role), async (tx) => {
      const [r] = await tx
        .select()
        .from(schema.rules)
        .where(and(eq(schema.rules.id, id), eq(schema.rules.tenantId, tenantId)))
        .limit(1);
      if (!r) {
        throw new NotFoundException({
          error: { code: 'RULE_NOT_FOUND', message: 'Pravidlo nenalezeno.' },
        });
      }
      return r;
    });
  }

  async create(tenantId: string, userId: string, role: AppRole, dto: RuleInput) {
    assertCanManage(role);
    // Validation already done by Zod pipe, but double-check shape
    const parsed = RuleInputSchema.parse(dto);

    return this.dbService.withRlsContext(ctxFor(tenantId, userId, role), async (tx) => {
      const [created] = await tx
        .insert(schema.rules)
        .values({
          tenantId,
          name: parsed.name,
          description: parsed.description ?? null,
          triggerEvent: parsed.triggerEvent,
          conditions: parsed.conditions as unknown as Record<string, unknown>,
          actions: parsed.actions as unknown as Record<string, unknown>[],
          isEnabled: parsed.isEnabled,
          priority: parsed.priority,
          createdBy: userId,
        })
        .returning();
      return created!;
    });
  }

  async update(
    tenantId: string,
    userId: string,
    role: AppRole,
    id: string,
    dto: Partial<RuleInput>,
  ) {
    assertCanManage(role);
    return this.dbService.withRlsContext(ctxFor(tenantId, userId, role), async (tx) => {
      const updateData: Record<string, unknown> = { updatedAt: new Date() };
      for (const key of [
        'name',
        'description',
        'triggerEvent',
        'conditions',
        'actions',
        'isEnabled',
        'priority',
      ] as const) {
        if (dto[key] !== undefined) updateData[key] = dto[key];
      }

      const [updated] = await tx
        .update(schema.rules)
        .set(updateData)
        .where(and(eq(schema.rules.id, id), eq(schema.rules.tenantId, tenantId)))
        .returning();
      if (!updated) {
        throw new NotFoundException({
          error: { code: 'RULE_NOT_FOUND', message: 'Pravidlo nenalezeno.' },
        });
      }
      return updated;
    });
  }

  async delete(tenantId: string, userId: string, role: AppRole, id: string) {
    assertCanManage(role);
    await this.dbService.withRlsContext(ctxFor(tenantId, userId, role), async (tx) => {
      const result = await tx
        .update(schema.rules)
        .set({ deletedAt: new Date(), updatedAt: new Date() })
        .where(and(eq(schema.rules.id, id), eq(schema.rules.tenantId, tenantId)))
        .returning({ id: schema.rules.id });
      if (result.length === 0) {
        throw new NotFoundException({
          error: { code: 'RULE_NOT_FOUND', message: 'Pravidlo nenalezeno.' },
        });
      }
    });
  }

  async listExecutions(
    tenantId: string,
    userId: string,
    role: AppRole,
    ruleId: string,
    limit = 50,
  ) {
    return this.dbService.withRlsContext(ctxFor(tenantId, userId, role), async (tx) => {
      return tx
        .select()
        .from(schema.ruleExecutions)
        .where(
          and(
            eq(schema.ruleExecutions.ruleId, ruleId),
            eq(schema.ruleExecutions.tenantId, tenantId),
          ),
        )
        .orderBy(desc(schema.ruleExecutions.createdAt))
        .limit(limit);
    });
  }
}
