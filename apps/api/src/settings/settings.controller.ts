import { Body, Controller, Get, Inject, Patch } from '@nestjs/common';
import { z } from 'zod';
import { CurrentUser } from '../auth/decorators/current-user.decorator.js';
import type { AccessTokenPayload } from '../auth/auth.types.js';
import { ZodValidationPipe } from '../auth/zod-validation.pipe.js';
import { SettingsService } from './settings.service.js';
import {
  BookingRulesSchema,
  LoyaltySettingsSchema,
  MeetingSettingsSchema,
  NotificationSettingsSchema,
} from './settings.types.js';
import { CancellationPolicySchema } from './cancellation-policy.js';

const PartialRulesSchema = BookingRulesSchema.partial();
const PartialNotificationsSchema = NotificationSettingsSchema.partial();
const PartialLoyaltySchema = LoyaltySettingsSchema.partial();
const PartialMeetingSchema = MeetingSettingsSchema.partial();
const PartialCancellationSchema = CancellationPolicySchema.partial();

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

  @Get('notifications')
  async getNotifications(@CurrentUser() user: AccessTokenPayload) {
    const data = await this.svc.getNotificationSettings(user.tenantId, user.sub, user.role);
    return { data };
  }

  @Patch('notifications')
  async updateNotifications(
    @CurrentUser() user: AccessTokenPayload,
    @Body(new ZodValidationPipe(PartialNotificationsSchema))
    dto: z.infer<typeof PartialNotificationsSchema>,
  ) {
    const data = await this.svc.updateNotificationSettings(user.tenantId, user.sub, user.role, dto);
    return { data };
  }

  @Get('loyalty')
  async getLoyalty(@CurrentUser() user: AccessTokenPayload) {
    const data = await this.svc.getLoyaltySettings(user.tenantId, user.sub, user.role);
    return { data };
  }

  @Patch('loyalty')
  async updateLoyalty(
    @CurrentUser() user: AccessTokenPayload,
    @Body(new ZodValidationPipe(PartialLoyaltySchema)) dto: z.infer<typeof PartialLoyaltySchema>,
  ) {
    const data = await this.svc.updateLoyaltySettings(user.tenantId, user.sub, user.role, dto);
    return { data };
  }

  @Get('cancellation')
  async getCancellation(@CurrentUser() user: AccessTokenPayload) {
    const data = await this.svc.getCancellationPolicy(user.tenantId, user.sub, user.role);
    return { data };
  }

  @Patch('cancellation')
  async updateCancellation(
    @CurrentUser() user: AccessTokenPayload,
    @Body(new ZodValidationPipe(PartialCancellationSchema))
    dto: z.infer<typeof PartialCancellationSchema>,
  ) {
    const data = await this.svc.updateCancellationPolicy(user.tenantId, user.sub, user.role, dto);
    return { data };
  }

  @Get('meeting')
  async getMeeting(@CurrentUser() user: AccessTokenPayload) {
    const data = await this.svc.getMeetingSettings(user.tenantId, user.sub, user.role);
    return { data };
  }

  @Patch('meeting')
  async updateMeeting(
    @CurrentUser() user: AccessTokenPayload,
    @Body(new ZodValidationPipe(PartialMeetingSchema)) dto: z.infer<typeof PartialMeetingSchema>,
  ) {
    const data = await this.svc.updateMeetingSettings(user.tenantId, user.sub, user.role, dto);
    return { data };
  }
}
