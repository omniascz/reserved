import {
  Body,
  Controller,
  Get,
  HttpCode,
  Inject,
  Param,
  ParseUUIDPipe,
  Post,
} from '@nestjs/common';
import { CurrentUser } from '../auth/decorators/current-user.decorator.js';
import type { AccessTokenPayload } from '../auth/auth.types.js';
import { ZodValidationPipe } from '../auth/zod-validation.pipe.js';
import { CreateCampaignSchema, type CreateCampaignDto } from './dto/campaign.dto.js';
import { MarketingService } from './marketing.service.js';

// Sprint 10.7 — marketingové kampaně (admin).
@Controller('admin/campaigns')
export class MarketingController {
  constructor(@Inject(MarketingService) private readonly svc: MarketingService) {}

  @Get()
  async list(@CurrentUser() user: AccessTokenPayload) {
    const data = await this.svc.list(user.tenantId, user.sub, user.role);
    return { data };
  }

  @Post()
  @HttpCode(201)
  async create(
    @CurrentUser() user: AccessTokenPayload,
    @Body(new ZodValidationPipe(CreateCampaignSchema)) dto: CreateCampaignDto,
  ) {
    const data = await this.svc.create(user.tenantId, user.sub, user.role, dto);
    return { data };
  }

  @Get(':id/audience')
  async audience(@CurrentUser() user: AccessTokenPayload, @Param('id', ParseUUIDPipe) id: string) {
    const data = await this.svc.previewAudience(user.tenantId, user.sub, user.role, id);
    return { data };
  }

  @Post(':id/send')
  async send(@CurrentUser() user: AccessTokenPayload, @Param('id', ParseUUIDPipe) id: string) {
    const data = await this.svc.send(user.tenantId, user.sub, user.role, id);
    return { data };
  }
}
