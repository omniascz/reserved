import { Body, Controller, Get, Inject, Patch } from '@nestjs/common';
import { z } from 'zod';
import { CurrentUser } from '../auth/decorators/current-user.decorator.js';
import type { AccessTokenPayload } from '../auth/auth.types.js';
import { ZodValidationPipe } from '../auth/zod-validation.pipe.js';
import { SettingsService } from './settings.service.js';
import { BookingRulesSchema } from './settings.types.js';

const PartialRulesSchema = BookingRulesSchema.partial();

@Controller('admin/settings')
export class SettingsController {
  constructor(@Inject(SettingsService) private readonly svc: SettingsService) {}

  @Get('booking')
  async getBookingRules(@CurrentUser() user: AccessTokenPayload) {
    const data = await this.svc.getBookingRules(user.tenantId, user.sub, user.role);
    return { data };
  }

  @Patch('booking')
  async updateBookingRules(
    @CurrentUser() user: AccessTokenPayload,
    @Body(new ZodValidationPipe(PartialRulesSchema)) dto: z.infer<typeof PartialRulesSchema>,
  ) {
    const data = await this.svc.updateBookingRules(user.tenantId, user.sub, user.role, dto);
    return { data };
  }
}
