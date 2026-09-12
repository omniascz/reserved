import { Body, Controller, Get, Inject, Param, ParseUUIDPipe, Post } from '@nestjs/common';
import { z } from 'zod';
import { CurrentUser } from '../auth/decorators/current-user.decorator.js';
import type { AccessTokenPayload } from '../auth/auth.types.js';
import { ZodValidationPipe } from '../auth/zod-validation.pipe.js';
import { ReferralsService } from './referrals.service.js';

const RedeemSchema = z.object({
  code: z.string().min(3).max(32),
  refereeEmail: z.string().email().max(255),
  refereeCustomerId: z.string().uuid().optional().nullable(),
});

// Admin: kód zákazníka + přehled jeho doporučení.
@Controller('admin/referrals')
export class ReferralsAdminController {
  constructor(@Inject(ReferralsService) private readonly svc: ReferralsService) {}

  @Get('code/:customerId')
  async myCode(
    @CurrentUser() user: AccessTokenPayload,
    @Param('customerId', ParseUUIDPipe) customerId: string,
  ) {
    return { data: await this.svc.myCode(user.tenantId, user.sub, user.role, customerId) };
  }

  @Get('redemptions/:customerId')
  async redemptions(
    @CurrentUser() user: AccessTokenPayload,
    @Param('customerId', ParseUUIDPipe) customerId: string,
  ) {
    return {
      data: await this.svc.listRedemptions(user.tenantId, user.sub, user.role, customerId),
    };
  }

  /** Veřejné uplatnění kódu novým zákazníkem (přes tenant kontext z admin auth). */
  @Post('redeem')
  async redeem(
    @CurrentUser() user: AccessTokenPayload,
    @Body(new ZodValidationPipe(RedeemSchema)) dto: z.infer<typeof RedeemSchema>,
  ) {
    return { data: await this.svc.redeem(user.tenantId, dto) };
  }
}
