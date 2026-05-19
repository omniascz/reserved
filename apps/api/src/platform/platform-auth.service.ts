// PlatformAuthService — auth flow pro master adminu.
//
// Login: email + heslo, vrati access + refresh token + ulozi session
// Refresh: ze sessionu vyrobi novy par a otoci refresh token (rotation)
// Logout: zrevokuje session refresh token
// Me: vrati profil podle sub claim z access tokenu

import {
  Inject,
  Injectable,
  Logger,
  UnauthorizedException,
  NotFoundException,
} from '@nestjs/common';
import { and, eq, isNull, gt } from 'drizzle-orm';
import { schema } from '@reserved/db';
import { serviceContext } from '@reserved/rls-multitenancy';
import { createHash, randomUUID } from 'node:crypto';
import { DbService } from '../db/db.service.js';
import { hashPassword, verifyPassword } from '../auth/password.js';
import { AuthError } from '../auth/auth.errors.js';
import { PlatformJwtService } from './platform-jwt.service.js';
import { PlatformAuditService } from './platform-audit.service.js';
import type {
  PlatformLoginDto,
  PlatformRefreshDto,
  PlatformChangePasswordDto,
} from './dto/platform-auth.dto.js';

const REFRESH_TTL_DAYS = 30;

export interface PlatformTokenPair {
  accessToken: string;
  refreshToken: string;
  expiresIn: number;
}

function sha256(value: string): string {
  return createHash('sha256').update(value).digest('hex');
}

@Injectable()
export class PlatformAuthService {
  private readonly logger = new Logger('PlatformAuthService');

  constructor(
    @Inject(DbService) private readonly dbService: DbService,
    @Inject(PlatformJwtService) private readonly jwt: PlatformJwtService,
    @Inject(PlatformAuditService) private readonly audit: PlatformAuditService,
  ) {}

  async login(
    dto: PlatformLoginDto,
    meta: { ip?: string; ua?: string },
  ): Promise<PlatformTokenPair> {
    return this.dbService.withRlsContext(serviceContext(), async (tx) => {
      const [admin] = await tx
        .select()
        .from(schema.platformAdmins)
        .where(eq(schema.platformAdmins.email, dto.email))
        .limit(1);

      if (!admin || !admin.isActive) {
        // Konstantni timing proti enumeraci
        await verifyPassword('$argon2id$v=19$m=19456,t=2,p=1$ZHVtbXk$ZHVtbXk', dto.password).catch(
          () => false,
        );
        throw new UnauthorizedException({
          error: { code: 'INVALID_CREDENTIALS', message: 'Nespravny email nebo heslo.' },
        });
      }

      const ok = await verifyPassword(admin.passwordHash, dto.password);
      if (!ok) {
        throw new UnauthorizedException({
          error: { code: 'INVALID_CREDENTIALS', message: 'Nespravny email nebo heslo.' },
        });
      }

      const family = randomUUID();
      const refresh = await this.jwt.signRefreshToken(admin.id, family);
      const refreshHash = sha256(refresh.token);
      const expiresAt = new Date(Date.now() + REFRESH_TTL_DAYS * 86400_000);

      await tx.insert(schema.platformAdminSessions).values({
        adminId: admin.id,
        refreshTokenHash: refreshHash,
        expiresAt,
        ipAddress: meta.ip ?? null,
        userAgent: meta.ua ?? null,
      });

      await tx
        .update(schema.platformAdmins)
        .set({ lastLoginAt: new Date() })
        .where(eq(schema.platformAdmins.id, admin.id));

      const access = await this.jwt.signAccessToken({ adminId: admin.id });

      // audit log (mimo transakci by mohl, ale tady atomicky)
      await tx.insert(schema.platformAdminActions).values({
        adminId: admin.id,
        action: 'login',
        targetType: 'platform_admin',
        targetId: admin.id,
        payload: {},
        ipAddress: meta.ip ?? null,
        userAgent: meta.ua ?? null,
      });

      return {
        accessToken: access.token,
        refreshToken: refresh.token,
        expiresIn: access.expiresIn,
      };
    });
  }

  async refresh(dto: PlatformRefreshDto): Promise<PlatformTokenPair> {
    const payload = await this.jwt.verifyRefreshToken(dto.refreshToken);
    const refreshHash = sha256(dto.refreshToken);

    return this.dbService.withRlsContext(serviceContext(), async (tx) => {
      const [session] = await tx
        .select()
        .from(schema.platformAdminSessions)
        .where(
          and(
            eq(schema.platformAdminSessions.refreshTokenHash, refreshHash),
            isNull(schema.platformAdminSessions.revokedAt),
            gt(schema.platformAdminSessions.expiresAt, new Date()),
          ),
        )
        .limit(1);

      if (!session) {
        throw new AuthError('TOKEN_INVALID', 'Refresh token neplatny nebo expiroval.');
      }

      // Rotace: oznac stary jako revoked, vyrob novy
      await tx
        .update(schema.platformAdminSessions)
        .set({ revokedAt: new Date() })
        .where(eq(schema.platformAdminSessions.id, session.id));

      const newRefresh = await this.jwt.signRefreshToken(payload.sub, payload.family);
      const newAccess = await this.jwt.signAccessToken({ adminId: payload.sub });

      await tx.insert(schema.platformAdminSessions).values({
        adminId: payload.sub,
        refreshTokenHash: sha256(newRefresh.token),
        expiresAt: new Date(Date.now() + REFRESH_TTL_DAYS * 86400_000),
      });

      return {
        accessToken: newAccess.token,
        refreshToken: newRefresh.token,
        expiresIn: newAccess.expiresIn,
      };
    });
  }

  async logout(refreshToken: string): Promise<void> {
    const refreshHash = sha256(refreshToken);
    await this.dbService.withRlsContext(serviceContext(), async (tx) => {
      await tx
        .update(schema.platformAdminSessions)
        .set({ revokedAt: new Date() })
        .where(eq(schema.platformAdminSessions.refreshTokenHash, refreshHash));
    });
  }

  async getMe(adminId: string): Promise<{
    id: string;
    email: string;
    firstName: string;
    lastName: string;
    lastLoginAt: Date | null;
    createdAt: Date;
  }> {
    return this.dbService.withRlsContext(serviceContext(), async (tx) => {
      const [admin] = await tx
        .select({
          id: schema.platformAdmins.id,
          email: schema.platformAdmins.email,
          firstName: schema.platformAdmins.firstName,
          lastName: schema.platformAdmins.lastName,
          lastLoginAt: schema.platformAdmins.lastLoginAt,
          createdAt: schema.platformAdmins.createdAt,
          isActive: schema.platformAdmins.isActive,
        })
        .from(schema.platformAdmins)
        .where(eq(schema.platformAdmins.id, adminId))
        .limit(1);

      if (!admin || !admin.isActive) {
        throw new NotFoundException({
          error: { code: 'NOT_FOUND', message: 'Master admin neexistuje.' },
        });
      }

      return {
        id: admin.id,
        email: admin.email,
        firstName: admin.firstName,
        lastName: admin.lastName,
        lastLoginAt: admin.lastLoginAt,
        createdAt: admin.createdAt,
      };
    });
  }

  async changePassword(
    adminId: string,
    dto: PlatformChangePasswordDto,
    meta: { ip?: string; ua?: string },
  ): Promise<void> {
    await this.dbService.withRlsContext(serviceContext(), async (tx) => {
      const [admin] = await tx
        .select()
        .from(schema.platformAdmins)
        .where(eq(schema.platformAdmins.id, adminId))
        .limit(1);

      if (!admin) {
        throw new NotFoundException({
          error: { code: 'NOT_FOUND', message: 'Master admin neexistuje.' },
        });
      }

      const ok = await verifyPassword(admin.passwordHash, dto.currentPassword);
      if (!ok) {
        throw new UnauthorizedException({
          error: { code: 'INVALID_CREDENTIALS', message: 'Soucasne heslo nesouhlasi.' },
        });
      }

      const newHash = await hashPassword(dto.newPassword);
      await tx
        .update(schema.platformAdmins)
        .set({ passwordHash: newHash, updatedAt: new Date() })
        .where(eq(schema.platformAdmins.id, adminId));

      // Revoke all other sessions (vynuti relogin)
      await tx
        .update(schema.platformAdminSessions)
        .set({ revokedAt: new Date() })
        .where(
          and(
            eq(schema.platformAdminSessions.adminId, adminId),
            isNull(schema.platformAdminSessions.revokedAt),
          ),
        );
    });

    await this.audit.log({
      adminId,
      action: 'password_changed',
      targetType: 'platform_admin',
      targetId: adminId,
      ipAddress: meta.ip,
      userAgent: meta.ua,
    });
  }
}
