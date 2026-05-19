// PlatformImpersonationService — vyrobi admin JWT pro tenanta jako jeho vlastnik.
//
// Token nese impersonatedBy claim (UUID master admina) + ma kratkou platnost
// (15 minut). Tenant admin webka pozna z claim, ze je v impersonaci, a zobrazi
// banner.

import { Inject, Injectable, NotFoundException, BadRequestException } from '@nestjs/common';
import { and, eq, isNull } from 'drizzle-orm';
import { schema } from '@reserved/db';
import { serviceContext } from '@reserved/rls-multitenancy';
import { DbService } from '../db/db.service.js';
import { JwtService } from '../auth/jwt.service.js';
import { PlatformAuditService } from './platform-audit.service.js';

const IMPERSONATION_TTL_SECONDS = 15 * 60; // 15 minut

export interface ImpersonateResult {
  accessToken: string;
  expiresIn: number;
  tenant: {
    id: string;
    slug: string;
    name: string;
  };
  owner: {
    id: string;
    email: string;
    firstName: string;
    lastName: string;
  };
}

@Injectable()
export class PlatformImpersonationService {
  constructor(
    @Inject(DbService) private readonly dbService: DbService,
    @Inject(JwtService) private readonly jwt: JwtService,
    @Inject(PlatformAuditService) private readonly audit: PlatformAuditService,
  ) {}

  async impersonate(
    tenantId: string,
    adminId: string,
    meta: { ip?: string; ua?: string },
  ): Promise<ImpersonateResult> {
    const result = await this.dbService.withRlsContext(serviceContext(), async (tx) => {
      const [tenant] = await tx
        .select({
          id: schema.tenants.id,
          slug: schema.tenants.slug,
          name: schema.tenants.name,
          suspendedAt: schema.tenants.suspendedAt,
          deletedAt: schema.tenants.deletedAt,
        })
        .from(schema.tenants)
        .where(eq(schema.tenants.id, tenantId))
        .limit(1);
      if (!tenant) {
        throw new NotFoundException({
          error: { code: 'TENANT_NOT_FOUND', message: 'Tenant neexistuje.' },
        });
      }
      if (tenant.deletedAt) {
        throw new BadRequestException({
          error: { code: 'TENANT_DELETED', message: 'Smazany tenant nelze impersonovat.' },
        });
      }

      const [owner] = await tx
        .select({
          id: schema.users.id,
          email: schema.users.email,
          firstName: schema.users.firstName,
          lastName: schema.users.lastName,
        })
        .from(schema.users)
        .where(
          and(
            eq(schema.users.tenantId, tenantId),
            eq(schema.users.role, 'owner'),
            eq(schema.users.isActive, true),
            isNull(schema.users.deletedAt),
          ),
        )
        .limit(1);
      if (!owner) {
        throw new NotFoundException({
          error: { code: 'OWNER_NOT_FOUND', message: 'Tenant nema aktivniho ownera.' },
        });
      }

      return { tenant, owner };
    });

    const tokens = await this.jwt.signAccessToken({
      userId: result.owner.id,
      tenantId: result.tenant.id,
      role: 'owner',
      customRoleId: null,
      branchIds: [],
      impersonatedBy: adminId,
      ttlOverrideSeconds: IMPERSONATION_TTL_SECONDS,
    });

    await this.audit.log({
      adminId,
      action: 'tenant_impersonated',
      targetType: 'tenant',
      targetId: tenantId,
      payload: {
        ownerId: result.owner.id,
        ownerEmail: result.owner.email,
        ttlSeconds: IMPERSONATION_TTL_SECONDS,
      },
      ipAddress: meta.ip,
      userAgent: meta.ua,
    });

    return {
      accessToken: tokens.token,
      expiresIn: tokens.expiresIn,
      tenant: {
        id: result.tenant.id,
        slug: result.tenant.slug,
        name: result.tenant.name,
      },
      owner: {
        id: result.owner.id,
        email: result.owner.email,
        firstName: result.owner.firstName,
        lastName: result.owner.lastName,
      },
    };
  }
}
