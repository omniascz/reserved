import { Body, Controller, Get, Inject, Post, Query } from '@nestjs/common';
import { z } from 'zod';
import { CurrentUser } from '../auth/decorators/current-user.decorator.js';
import type { AccessTokenPayload } from '../auth/auth.types.js';
import { ZodValidationPipe } from '../auth/zod-validation.pipe.js';
import { DepositsService } from './deposits.service.js';

const ProviderSchema = z.object({ provider: z.enum(['stripe', 'gopay', 'mock']) });
const CollectSchema = z.object({
  bookingId: z.string().uuid(),
  methodType: z.enum(['stripe', 'gopay', 'mock']).default('stripe'),
});

@Controller('admin/payments')
export class DepositsController {
  constructor(@Inject(DepositsService) private readonly svc: DepositsService) {}

  @Get('connect/status')
  async connectStatus(@CurrentUser() user: AccessTokenPayload) {
    return { data: await this.svc.connectStatus(user.tenantId, user.sub, user.role) };
  }

  @Post('connect/start')
  async connectStart(
    @CurrentUser() user: AccessTokenPayload,
    @Body(new ZodValidationPipe(ProviderSchema)) dto: z.infer<typeof ProviderSchema>,
  ) {
    return { data: await this.svc.connectStart(user.tenantId, user.sub, user.role, dto.provider) };
  }

  @Get('deposit/quote')
  async depositQuote(
    @CurrentUser() user: AccessTokenPayload,
    @Query('serviceId') serviceId: string,
    @Query('customerId') customerId?: string,
  ) {
    return {
      data: await this.svc.quoteDeposit(user.tenantId, user.sub, user.role, {
        serviceId,
        customerId,
      }),
    };
  }

  @Post('deposit/collect')
  async collectDeposit(
    @CurrentUser() user: AccessTokenPayload,
    @Body(new ZodValidationPipe(CollectSchema)) dto: z.infer<typeof CollectSchema>,
  ) {
    return {
      data: await this.svc.collectDeposit(user.tenantId, user.sub, user.role, {
        bookingId: dto.bookingId,
        methodType: dto.methodType,
      }),
    };
  }
}
