import {
  Body,
  Controller,
  Get,
  HttpCode,
  Inject,
  Param,
  ParseUUIDPipe,
  Post,
  Query,
} from '@nestjs/common';
import { CurrentUser } from '../auth/decorators/current-user.decorator.js';
import type { AccessTokenPayload } from '../auth/auth.types.js';
import { ZodValidationPipe } from '../auth/zod-validation.pipe.js';
import {
  AdminCreateBookingSchema,
  CancelBookingSchema,
  RescheduleBookingSchema,
  type AdminCreateBookingDto,
  type CancelBookingDto,
  type RescheduleBookingDto,
} from './dto/booking.dto.js';
import { BookingsService } from './bookings.service.js';

@Controller('admin/bookings')
export class BookingsController {
  constructor(@Inject(BookingsService) private readonly svc: BookingsService) {}

  @Get()
  async list(
    @CurrentUser() user: AccessTokenPayload,
    @Query('from') from?: string,
    @Query('to') to?: string,
    @Query('status') status?: string,
  ) {
    const data = await this.svc.listForAdmin(user.tenantId, user.sub, user.role, {
      from,
      to,
      status,
    });
    return { data };
  }

  @Get(':id')
  async get(@CurrentUser() user: AccessTokenPayload, @Param('id', ParseUUIDPipe) id: string) {
    const data = await this.svc.getForAdmin(user.tenantId, user.sub, user.role, id);
    return { data };
  }

  @Post()
  @HttpCode(201)
  async create(
    @CurrentUser() user: AccessTokenPayload,
    @Body(new ZodValidationPipe(AdminCreateBookingSchema)) dto: AdminCreateBookingDto,
  ) {
    const data = await this.svc.adminCreate(user.tenantId, user.sub, user.role, dto);
    return { data };
  }

  @Post(':id/cancel')
  async cancel(
    @CurrentUser() user: AccessTokenPayload,
    @Param('id', ParseUUIDPipe) id: string,
    @Body(new ZodValidationPipe(CancelBookingSchema)) dto: CancelBookingDto,
  ) {
    const data = await this.svc.cancel(user.tenantId, user.sub, user.role, id, dto);
    return { data };
  }

  @Post(':id/reschedule')
  async reschedule(
    @CurrentUser() user: AccessTokenPayload,
    @Param('id', ParseUUIDPipe) id: string,
    @Body(new ZodValidationPipe(RescheduleBookingSchema)) dto: RescheduleBookingDto,
  ) {
    const data = await this.svc.reschedule(user.tenantId, user.sub, user.role, id, dto);
    return { data };
  }

  @Post(':id/mark-no-show')
  async markNoShow(
    @CurrentUser() user: AccessTokenPayload,
    @Param('id', ParseUUIDPipe) id: string,
  ) {
    const data = await this.svc.markNoShow(user.tenantId, user.sub, user.role, id);
    return { data };
  }

  @Post(':id/mark-completed')
  async markCompleted(
    @CurrentUser() user: AccessTokenPayload,
    @Param('id', ParseUUIDPipe) id: string,
  ) {
    const data = await this.svc.markCompleted(user.tenantId, user.sub, user.role, id);
    return { data };
  }
}
