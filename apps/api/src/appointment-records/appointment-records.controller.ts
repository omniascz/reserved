import { Body, Controller, Get, Inject, Param, ParseUUIDPipe, Post, Query } from '@nestjs/common';
import { z } from 'zod';
import { CurrentUser } from '../auth/decorators/current-user.decorator.js';
import type { AccessTokenPayload } from '../auth/auth.types.js';
import { ZodValidationPipe } from '../auth/zod-validation.pipe.js';
import { AppointmentRecordsService } from './appointment-records.service.js';

const CreateRecordSchema = z.object({
  bookingId: z.string().uuid(),
  summary: z.string().min(1).max(5000),
  privateNote: z.string().max(5000).optional().nullable(),
  followUpAt: z.string().datetime().optional().nullable(),
});

@Controller('admin/appointment-records')
export class AppointmentRecordsController {
  constructor(@Inject(AppointmentRecordsService) private readonly svc: AppointmentRecordsService) {}

  @Post()
  async create(
    @CurrentUser() user: AccessTokenPayload,
    @Body(new ZodValidationPipe(CreateRecordSchema)) dto: z.infer<typeof CreateRecordSchema>,
  ) {
    return { data: await this.svc.create(user.tenantId, user.sub, user.role, dto) };
  }

  @Get('booking/:bookingId')
  async forBooking(
    @CurrentUser() user: AccessTokenPayload,
    @Param('bookingId', ParseUUIDPipe) bookingId: string,
  ) {
    return {
      data: await this.svc.listForBooking(user.tenantId, user.sub, user.role, bookingId),
    };
  }

  /** Historie návštěv zákazníka (dle e-mailu). */
  @Get('history')
  async history(@CurrentUser() user: AccessTokenPayload, @Query('email') email: string) {
    return {
      data: await this.svc.historyForCustomer(user.tenantId, user.sub, user.role, email),
    };
  }
}
