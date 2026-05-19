// Admin endpointy pro správu API klíčů. Chráněny standardním JWT (owner/manager).

import {
  Body,
  Controller,
  Delete,
  ForbiddenException,
  Get,
  HttpCode,
  Inject,
  Param,
  ParseUUIDPipe,
  Post,
} from '@nestjs/common';
import { z } from 'zod';
import { CurrentUser } from '../auth/decorators/current-user.decorator.js';
import type { AccessTokenPayload } from '../auth/auth.types.js';
import { ZodValidationPipe } from '../auth/zod-validation.pipe.js';
import { API_KEY_SCOPES } from '@reserved/db';
import { ApiKeysService, type ApiKeyView, type CreatedKey } from './api-keys.service.js';

const ALLOWED_ROLES = new Set(['owner', 'manager']);

const CreateApiKeySchema = z.object({
  name: z.string().min(3).max(120),
  scopes: z.array(z.enum(['*', ...API_KEY_SCOPES] as [string, ...string[]])).optional(),
  expiresAt: z.string().datetime().nullable().optional(),
});
type CreateApiKeyDto = z.infer<typeof CreateApiKeySchema>;

@Controller('admin/api-keys')
export class ApiKeysController {
  constructor(@Inject(ApiKeysService) private readonly service: ApiKeysService) {}

  private requireAdmin(user: AccessTokenPayload): void {
    if (!ALLOWED_ROLES.has(user.role)) {
      throw new ForbiddenException({
        error: { code: 'INSUFFICIENT_ROLE', message: 'Spravu klicu muze owner nebo manager.' },
      });
    }
  }

  @Get()
  async list(@CurrentUser() user: AccessTokenPayload): Promise<{ data: ApiKeyView[] }> {
    this.requireAdmin(user);
    const data = await this.service.list(user.tenantId);
    return { data };
  }

  @Post()
  async create(
    @CurrentUser() user: AccessTokenPayload,
    @Body(new ZodValidationPipe(CreateApiKeySchema)) dto: CreateApiKeyDto,
  ): Promise<{ data: CreatedKey }> {
    this.requireAdmin(user);
    const data = await this.service.create(user.tenantId, user.sub, {
      name: dto.name,
      scopes: dto.scopes as Parameters<typeof this.service.create>[2]['scopes'],
      expiresAt: dto.expiresAt ? new Date(dto.expiresAt) : null,
    });
    return { data };
  }

  @Delete(':id')
  @HttpCode(204)
  async revoke(
    @CurrentUser() user: AccessTokenPayload,
    @Param('id', new ParseUUIDPipe()) id: string,
  ): Promise<void> {
    this.requireAdmin(user);
    await this.service.revoke(user.tenantId, id);
  }
}
