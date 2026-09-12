import { Body, Controller, Get, Inject, Patch } from '@nestjs/common';
import { z } from 'zod';
import { CurrentUser } from '../auth/decorators/current-user.decorator.js';
import type { AccessTokenPayload } from '../auth/auth.types.js';
import { ZodValidationPipe } from '../auth/zod-validation.pipe.js';
import { CatalogService } from './catalog.service.js';

const UpdateProfileSchema = z.object({
  listedInCatalog: z.boolean().optional(),
  publicDescription: z.string().max(5000).nullable().optional(),
  publicCity: z.string().max(100).nullable().optional(),
  publicAddress: z.string().max(500).nullable().optional(),
  publicPhotos: z.array(z.string().url()).max(10).optional(),
  publicBusinessHours: z.record(z.string()).optional(),
});

@Controller('admin/catalog-profile')
export class CatalogAdminController {
  constructor(@Inject(CatalogService) private readonly svc: CatalogService) {}

  @Get()
  async getProfile(@CurrentUser() user: AccessTokenPayload) {
    const data = await this.svc.getMyProfile(user.tenantId);
    return { data };
  }

  @Patch()
  async updateProfile(
    @CurrentUser() user: AccessTokenPayload,
    @Body(new ZodValidationPipe(UpdateProfileSchema)) dto: z.infer<typeof UpdateProfileSchema>,
  ) {
    await this.svc.updateMyProfile(user.tenantId, dto);
    const data = await this.svc.getMyProfile(user.tenantId);
    return { data };
  }
}
