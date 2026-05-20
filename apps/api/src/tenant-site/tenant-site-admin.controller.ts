import { Body, Controller, Get, Inject, Patch } from '@nestjs/common';
import { z } from 'zod';
import { CurrentUser } from '../auth/decorators/current-user.decorator.js';
import type { AccessTokenPayload } from '../auth/auth.types.js';
import { ZodValidationPipe } from '../auth/zod-validation.pipe.js';
import { TenantSiteService } from './tenant-site.service.js';

const ContentSchema: z.ZodType<Record<string, unknown>> = z.record(z.unknown());

const UpdateSiteSchema = z.object({
  template: z.enum(['elegant', 'bold', 'fresh']).nullable().optional(),
  enabled: z.boolean().optional(),
  content: ContentSchema.optional(),
});

@Controller('admin/site')
export class TenantSiteAdminController {
  constructor(@Inject(TenantSiteService) private readonly svc: TenantSiteService) {}

  @Get()
  async get(@CurrentUser() user: AccessTokenPayload) {
    const data = await this.svc.getSiteSettings(user.tenantId);
    return { data };
  }

  @Patch()
  async update(
    @CurrentUser() user: AccessTokenPayload,
    @Body(new ZodValidationPipe(UpdateSiteSchema)) dto: z.infer<typeof UpdateSiteSchema>,
  ) {
    const data = await this.svc.updateSiteSettings(user.tenantId, dto);
    return { data };
  }
}
