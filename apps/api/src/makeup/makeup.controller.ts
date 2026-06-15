import { Body, Controller, Get, Inject, Post } from '@nestjs/common';
import { z } from 'zod';
import { CurrentUser } from '../auth/decorators/current-user.decorator.js';
import type { AccessTokenPayload } from '../auth/auth.types.js';
import { ZodValidationPipe } from '../auth/zod-validation.pipe.js';
import { MakeupService } from './makeup.service.js';

const IssueMakeupSchema = z.object({
  customerEmail: z.string().email().max(255),
  customerName: z.string().min(1).max(200),
  customerId: z.string().uuid().optional().nullable(),
  reason: z.enum(['studio_cancelled', 'client_cancelled', 'admin_granted']).optional(),
  originBookingId: z.string().uuid().optional().nullable(),
  validDays: z.number().int().min(1).max(365).optional(),
});

@Controller('admin/makeup-credits')
export class MakeupController {
  constructor(@Inject(MakeupService) private readonly svc: MakeupService) {}

  @Get()
  async list(@CurrentUser() user: AccessTokenPayload) {
    return { data: await this.svc.listAdmin(user.tenantId, user.sub, user.role) };
  }

  @Post()
  async issue(
    @CurrentUser() user: AccessTokenPayload,
    @Body(new ZodValidationPipe(IssueMakeupSchema)) dto: z.infer<typeof IssueMakeupSchema>,
  ) {
    return { data: await this.svc.issue(user.tenantId, user.sub, user.role, dto) };
  }
}
