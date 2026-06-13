import { Body, Controller, Get, Inject, Param, ParseUUIDPipe, Post } from '@nestjs/common';
import { CurrentUser } from '../auth/decorators/current-user.decorator.js';
import type { AccessTokenPayload } from '../auth/auth.types.js';
import { ZodValidationPipe } from '../auth/zod-validation.pipe.js';
import {
  AdjustPointsSchema,
  RedeemPointsSchema,
  type AdjustPointsDto,
  type RedeemPointsDto,
} from './dto/loyalty.dto.js';
import { LoyaltyService } from './loyalty.service.js';

// Sprint 10.8 — věrnostní body zákazníka (admin).
@Controller('admin/customers/:customerId/loyalty')
export class LoyaltyController {
  constructor(@Inject(LoyaltyService) private readonly svc: LoyaltyService) {}

  @Get()
  async get(
    @CurrentUser() user: AccessTokenPayload,
    @Param('customerId', ParseUUIDPipe) customerId: string,
  ) {
    const data = await this.svc.getForCustomer(user.tenantId, user.sub, user.role, customerId);
    return { data };
  }

  @Post('redeem')
  async redeem(
    @CurrentUser() user: AccessTokenPayload,
    @Param('customerId', ParseUUIDPipe) customerId: string,
    @Body(new ZodValidationPipe(RedeemPointsSchema)) dto: RedeemPointsDto,
  ) {
    const data = await this.svc.redeem(
      user.tenantId,
      user.sub,
      user.role,
      customerId,
      dto.points,
      dto.note ?? null,
    );
    return { data };
  }

  @Post('adjust')
  async adjust(
    @CurrentUser() user: AccessTokenPayload,
    @Param('customerId', ParseUUIDPipe) customerId: string,
    @Body(new ZodValidationPipe(AdjustPointsSchema)) dto: AdjustPointsDto,
  ) {
    const data = await this.svc.adjust(
      user.tenantId,
      user.sub,
      user.role,
      customerId,
      dto.points,
      dto.note,
    );
    return { data };
  }
}
