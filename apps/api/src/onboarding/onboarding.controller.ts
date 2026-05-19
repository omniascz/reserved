import { Body, Controller, Get, Inject, Param, Patch } from '@nestjs/common';
import { z } from 'zod';
import { CurrentUser } from '../auth/decorators/current-user.decorator.js';
import type { AccessTokenPayload } from '../auth/auth.types.js';
import { ZodValidationPipe } from '../auth/zod-validation.pipe.js';
import {
  OnboardingService,
  type OnboardingChecklistView,
  type OnboardingStep,
} from './onboarding.service.js';

const VALID_STEPS = [
  'emailVerified',
  'firstServiceCreated',
  'workingHoursSet',
  'teamInvited',
  'paymentsConnected',
  'firstBookingReceived',
] as const;

const MarkStepSchema = z.object({
  step: z.enum(VALID_STEPS),
});

@Controller('admin/onboarding')
export class OnboardingController {
  constructor(@Inject(OnboardingService) private readonly svc: OnboardingService) {}

  @Get('checklist')
  async getChecklist(
    @CurrentUser() user: AccessTokenPayload,
  ): Promise<{ data: OnboardingChecklistView }> {
    const data = await this.svc.get(user.tenantId);
    return { data };
  }

  @Patch('checklist')
  async markStep(
    @CurrentUser() user: AccessTokenPayload,
    @Body(new ZodValidationPipe(MarkStepSchema)) dto: z.infer<typeof MarkStepSchema>,
  ): Promise<{ data: OnboardingChecklistView }> {
    const data = await this.svc.markStep(user.tenantId, dto.step as OnboardingStep);
    return { data };
  }
}
