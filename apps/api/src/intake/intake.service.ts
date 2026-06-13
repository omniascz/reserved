// IntakeService — intake/consent formuláře (sprint 10.10). Definice formulářů,
// veřejné vyplnění s validací povinných polí, admin přehled odpovědí.

import {
  BadRequestException,
  ForbiddenException,
  Inject,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { and, desc, eq, isNull, or } from 'drizzle-orm';
import { schema } from '@reserved/db';
import { type AppRole, serviceContext, type TenantContext } from '@reserved/rls-multitenancy';
import { DbService } from '../db/db.service.js';
import type { CreateFormDto, IntakeField, SubmitFormDto, UpdateFormDto } from './dto/intake.dto.js';

const MANAGE_ROLES: AppRole[] = ['owner', 'manager'];

function ctxFor(tenantId: string, userId: string, role: AppRole): TenantContext {
  return { tenantId, userId, role };
}

function assertCanManage(role: AppRole): void {
  if (!MANAGE_ROLES.includes(role)) {
    throw new ForbiddenException({
      error: { code: 'INSUFFICIENT_ROLE', message: 'Pouze owner nebo manager spravuje formuláře.' },
    });
  }
}

@Injectable()
export class IntakeService {
  constructor(@Inject(DbService) private readonly dbService: DbService) {}

  async createForm(tenantId: string, userId: string, role: AppRole, dto: CreateFormDto) {
    assertCanManage(role);
    return this.dbService.withRlsContext(ctxFor(tenantId, userId, role), async (tx) => {
      const [row] = await tx
        .insert(schema.intakeForms)
        .values({
          tenantId,
          name: dto.name,
          description: dto.description ?? null,
          serviceId: dto.serviceId ?? null,
          fields: dto.fields,
        })
        .returning();
      return row!;
    });
  }

  async listForms(tenantId: string, userId: string, role: AppRole) {
    return this.dbService.withRlsContext(ctxFor(tenantId, userId, role), async (tx) => {
      return tx
        .select()
        .from(schema.intakeForms)
        .where(and(eq(schema.intakeForms.tenantId, tenantId), isNull(schema.intakeForms.deletedAt)))
        .orderBy(desc(schema.intakeForms.createdAt));
    });
  }

  async updateForm(
    tenantId: string,
    userId: string,
    role: AppRole,
    formId: string,
    dto: UpdateFormDto,
  ) {
    assertCanManage(role);
    return this.dbService.withRlsContext(ctxFor(tenantId, userId, role), async (tx) => {
      const [row] = await tx
        .update(schema.intakeForms)
        .set({
          ...(dto.name !== undefined ? { name: dto.name } : {}),
          ...(dto.description !== undefined ? { description: dto.description } : {}),
          ...(dto.serviceId !== undefined ? { serviceId: dto.serviceId } : {}),
          ...(dto.fields !== undefined ? { fields: dto.fields } : {}),
          ...(dto.isActive !== undefined ? { isActive: dto.isActive } : {}),
          updatedAt: new Date(),
        })
        .where(and(eq(schema.intakeForms.id, formId), eq(schema.intakeForms.tenantId, tenantId)))
        .returning();
      if (!row) {
        throw new NotFoundException({
          error: { code: 'FORM_NOT_FOUND', message: 'Formulář nenalezen.' },
        });
      }
      return row;
    });
  }

  async deleteForm(tenantId: string, userId: string, role: AppRole, formId: string) {
    assertCanManage(role);
    await this.dbService.withRlsContext(ctxFor(tenantId, userId, role), async (tx) => {
      const [row] = await tx
        .update(schema.intakeForms)
        .set({ deletedAt: new Date(), isActive: false })
        .where(and(eq(schema.intakeForms.id, formId), eq(schema.intakeForms.tenantId, tenantId)))
        .returning({ id: schema.intakeForms.id });
      if (!row) {
        throw new NotFoundException({
          error: { code: 'FORM_NOT_FOUND', message: 'Formulář nenalezen.' },
        });
      }
    });
  }

  /** Veřejné: aktivní formuláře pro službu (+ obecné bez vazby na službu). */
  async publicForms(tenantId: string, serviceId?: string) {
    return this.dbService.withRlsContext(serviceContext(tenantId), async (tx) => {
      const serviceCond = serviceId
        ? or(eq(schema.intakeForms.serviceId, serviceId), isNull(schema.intakeForms.serviceId))
        : isNull(schema.intakeForms.serviceId);
      return tx
        .select({
          id: schema.intakeForms.id,
          name: schema.intakeForms.name,
          description: schema.intakeForms.description,
          fields: schema.intakeForms.fields,
          serviceId: schema.intakeForms.serviceId,
        })
        .from(schema.intakeForms)
        .where(
          and(
            eq(schema.intakeForms.tenantId, tenantId),
            eq(schema.intakeForms.isActive, true),
            isNull(schema.intakeForms.deletedAt),
            serviceCond,
          ),
        )
        .orderBy(desc(schema.intakeForms.createdAt));
    });
  }

  /** Veřejné odeslání — validuje povinná pole proti definici formuláře. */
  async submitPublic(tenantId: string, formId: string, dto: SubmitFormDto) {
    return this.dbService.withRlsContext(serviceContext(tenantId), async (tx) => {
      const [form] = await tx
        .select()
        .from(schema.intakeForms)
        .where(
          and(
            eq(schema.intakeForms.id, formId),
            eq(schema.intakeForms.tenantId, tenantId),
            eq(schema.intakeForms.isActive, true),
            isNull(schema.intakeForms.deletedAt),
          ),
        )
        .limit(1);
      if (!form) {
        throw new NotFoundException({
          error: { code: 'FORM_NOT_FOUND', message: 'Formulář nenalezen.' },
        });
      }

      // Serverová validace povinných polí.
      const fields = (form.fields as IntakeField[]) ?? [];
      const answers = dto.answers ?? {};
      const missing: string[] = [];
      for (const f of fields) {
        if (!f.required) continue;
        const v = answers[f.key];
        const ok = f.type === 'checkbox' ? v === true : v !== undefined && v !== null && v !== '';
        if (!ok) missing.push(f.key);
      }
      if (missing.length > 0) {
        throw new BadRequestException({
          error: {
            code: 'VALIDATION_ERROR',
            message: `Chybí povinná pole: ${missing.join(', ')}.`,
            details: { missing },
          },
        });
      }

      const [submission] = await tx
        .insert(schema.intakeSubmissions)
        .values({
          tenantId,
          formId,
          bookingId: dto.bookingId ?? null,
          customerEmail: dto.customerEmail,
          answers,
        })
        .returning({ id: schema.intakeSubmissions.id });
      return { id: submission!.id };
    });
  }

  async listSubmissions(tenantId: string, userId: string, role: AppRole, formId: string) {
    assertCanManage(role);
    return this.dbService.withRlsContext(ctxFor(tenantId, userId, role), async (tx) => {
      return tx
        .select()
        .from(schema.intakeSubmissions)
        .where(
          and(
            eq(schema.intakeSubmissions.tenantId, tenantId),
            eq(schema.intakeSubmissions.formId, formId),
          ),
        )
        .orderBy(desc(schema.intakeSubmissions.createdAt))
        .limit(500);
    });
  }
}
