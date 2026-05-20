import { Body, Controller, Delete, Get, HttpCode, Inject, Post, Put } from '@nestjs/common';
import { z } from 'zod';
import { ApiTags } from '@nestjs/swagger';
import { CurrentUser } from '../auth/decorators/current-user.decorator.js';
import type { AccessTokenPayload } from '../auth/auth.types.js';
import { ZodValidationPipe } from '../auth/zod-validation.pipe.js';
import { CustomDomainsService, type CustomDomainStatus } from './custom-domains.service.js';

const SetDomainSchema = z.object({
  domain: z.string().min(3).max(255),
});

@ApiTags('custom-domains')
@Controller('admin/custom-domain')
export class CustomDomainsController {
  constructor(@Inject(CustomDomainsService) private readonly svc: CustomDomainsService) {}

  @Get()
  async getStatus(@CurrentUser() user: AccessTokenPayload): Promise<{ data: CustomDomainStatus }> {
    const data = await this.svc.getStatus(user.tenantId);
    return { data };
  }

  @Put()
  async setDomain(
    @CurrentUser() user: AccessTokenPayload,
    @Body(new ZodValidationPipe(SetDomainSchema)) dto: z.infer<typeof SetDomainSchema>,
  ): Promise<{ data: CustomDomainStatus }> {
    const data = await this.svc.setDomain(user.tenantId, dto.domain);
    return { data };
  }

  @Post('verify')
  @HttpCode(200)
  async verify(@CurrentUser() user: AccessTokenPayload): Promise<{ data: CustomDomainStatus }> {
    const data = await this.svc.verify(user.tenantId);
    return { data };
  }

  @Delete()
  @HttpCode(204)
  async remove(@CurrentUser() user: AccessTokenPayload): Promise<void> {
    await this.svc.removeDomain(user.tenantId);
  }
}
