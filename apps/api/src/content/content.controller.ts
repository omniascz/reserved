import {
  Body,
  Controller,
  Delete,
  Get,
  HttpCode,
  Inject,
  NotFoundException,
  Param,
  ParseUUIDPipe,
  Patch,
  Post,
} from '@nestjs/common';
import { CurrentUser } from '../auth/decorators/current-user.decorator.js';
import type { AccessTokenPayload } from '../auth/auth.types.js';
import { Public } from '../auth/decorators/public.decorator.js';
import { ZodValidationPipe } from '../auth/zod-validation.pipe.js';
import { DrizzleTenantLookup } from '../tenant/tenant-lookup.service.js';
import {
  CreateContentSchema,
  UpdateContentSchema,
  type CreateContentDto,
  type UpdateContentDto,
} from './dto/content.dto.js';
import { ContentService } from './content.service.js';

@Controller()
export class ContentController {
  constructor(
    @Inject(ContentService) private readonly svc: ContentService,
    @Inject(DrizzleTenantLookup) private readonly tenantLookup: DrizzleTenantLookup,
  ) {}

  // ─── Admin ───────────────────────────────────────────────────────────

  @Get('admin/content')
  async list(@CurrentUser() user: AccessTokenPayload) {
    return { data: await this.svc.listAdmin(user.tenantId, user.sub, user.role) };
  }

  @Post('admin/content')
  @HttpCode(201)
  async create(
    @CurrentUser() user: AccessTokenPayload,
    @Body(new ZodValidationPipe(CreateContentSchema)) dto: CreateContentDto,
  ) {
    return { data: await this.svc.create(user.tenantId, user.sub, user.role, dto) };
  }

  @Patch('admin/content/:id')
  async update(
    @CurrentUser() user: AccessTokenPayload,
    @Param('id', ParseUUIDPipe) id: string,
    @Body(new ZodValidationPipe(UpdateContentSchema)) dto: UpdateContentDto,
  ) {
    return { data: await this.svc.update(user.tenantId, user.sub, user.role, id, dto) };
  }

  @Delete('admin/content/:id')
  @HttpCode(200)
  async remove(@CurrentUser() user: AccessTokenPayload, @Param('id', ParseUUIDPipe) id: string) {
    return { data: await this.svc.delete(user.tenantId, user.sub, user.role, id) };
  }

  // ─── Veřejný výpis (anonymní — odemkne jen public) ───────────────────

  @Public()
  @Get('public/:slug/content')
  async publicList(@Param('slug') slug: string) {
    const tenant = await this.tenantLookup.bySlug(slug);
    if (!tenant) {
      throw new NotFoundException({
        error: { code: 'TENANT_NOT_FOUND', message: 'Provozovna nenalezena.' },
      });
    }
    return { data: await this.svc.listPublic(tenant.id) };
  }
}
