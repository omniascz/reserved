import { Body, Controller, Get, Inject, Param, ParseUUIDPipe, Post, Query } from '@nestjs/common';
import { z } from 'zod';
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

const CreateTierSchema = z.object({
  name: z.string().min(1).max(100),
  minPoints: z.number().int().min(0),
  perk: z.string().max(1000).optional().nullable(),
  sortOrder: z.number().int().optional(),
});
const CreateRewardSchema = z.object({
  name: z.string().min(1).max(200),
  description: z.string().max(2000).optional().nullable(),
  pointsCost: z.number().int().min(1),
  kind: z.enum(['discount_percent', 'discount_amount', 'free_item', 'custom']),
  value: z.number().int().min(0).optional(),
});
const RedeemRewardSchema = z.object({ rewardId: z.string().uuid() });

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

  /** Aktuální věrnostní úroveň zákazníka. */
  @Get('tier')
  async tier(
    @CurrentUser() user: AccessTokenPayload,
    @Param('customerId', ParseUUIDPipe) customerId: string,
  ) {
    return { data: await this.svc.customerTier(user.tenantId, user.sub, user.role, customerId) };
  }

  /** Zákazník uplatní body za odměnu z katalogu. */
  @Post('redeem-reward')
  async redeemReward(
    @CurrentUser() user: AccessTokenPayload,
    @Param('customerId', ParseUUIDPipe) customerId: string,
    @Body(new ZodValidationPipe(RedeemRewardSchema)) dto: z.infer<typeof RedeemRewardSchema>,
  ) {
    return {
      data: await this.svc.redeemReward(
        user.tenantId,
        user.sub,
        user.role,
        customerId,
        dto.rewardId,
      ),
    };
  }
}

// Katalog tierů + odměn (per tenant).
@Controller('admin/loyalty')
export class LoyaltyCatalogController {
  constructor(@Inject(LoyaltyService) private readonly svc: LoyaltyService) {}

  @Get('tiers')
  async listTiers(@CurrentUser() user: AccessTokenPayload) {
    return { data: await this.svc.listTiers(user.tenantId, user.sub, user.role) };
  }

  @Post('tiers')
  async createTier(
    @CurrentUser() user: AccessTokenPayload,
    @Body(new ZodValidationPipe(CreateTierSchema)) dto: z.infer<typeof CreateTierSchema>,
  ) {
    return { data: await this.svc.createTier(user.tenantId, user.sub, user.role, dto) };
  }

  @Get('rewards')
  async listRewards(
    @CurrentUser() user: AccessTokenPayload,
    @Query('activeOnly') activeOnly?: string,
  ) {
    return {
      data: await this.svc.listRewards(user.tenantId, user.sub, user.role, activeOnly === 'true'),
    };
  }

  @Post('rewards')
  async createReward(
    @CurrentUser() user: AccessTokenPayload,
    @Body(new ZodValidationPipe(CreateRewardSchema)) dto: z.infer<typeof CreateRewardSchema>,
  ) {
    return { data: await this.svc.createReward(user.tenantId, user.sub, user.role, dto) };
  }
}
