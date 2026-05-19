// External API endpointy pro tenant integrace přes API klíče.
// Mirror admin endpointů, ale autorizovano pres ApiKeyGuard a scopes.

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
  Req,
  UseGuards,
} from '@nestjs/common';
import type { Request } from 'express';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import { Public } from '../auth/decorators/public.decorator.js';
import { ZodValidationPipe } from '../auth/zod-validation.pipe.js';
import {
  AdminCreateBookingSchema,
  CancelBookingSchema,
  RescheduleBookingSchema,
  type AdminCreateBookingDto,
  type CancelBookingDto,
  type RescheduleBookingDto,
} from '../bookings/dto/booking.dto.js';
import { BookingsService } from '../bookings/bookings.service.js';
import { ApiKeyGuard, requireScope } from '../api-keys/api-key.guard.js';
import { ApiKeyThrottlerGuard } from '../api-keys/api-key-throttler.guard.js';

const SYSTEM_USER = '00000000-0000-0000-0000-000000000000';

@ApiTags('External — Bookings')
@ApiBearerAuth('api-key')
@Public()
@UseGuards(ApiKeyGuard, ApiKeyThrottlerGuard)
@Controller('external/v1/bookings')
export class ExternalBookingsController {
  constructor(@Inject(BookingsService) private readonly svc: BookingsService) {}

  @Get()
  async list(
    @Req() req: Request,
    @Query('from') from?: string,
    @Query('to') to?: string,
    @Query('status') status?: string,
  ) {
    requireScope(req.apiKey, 'bookings:read');
    const data = await this.svc.listForAdmin(req.apiKey!.tenantId, SYSTEM_USER, 'owner', {
      from,
      to,
      status,
    });
    return { data };
  }

  @Get(':id')
  async get(@Req() req: Request, @Param('id', ParseUUIDPipe) id: string) {
    requireScope(req.apiKey, 'bookings:read');
    const data = await this.svc.getForAdmin(req.apiKey!.tenantId, SYSTEM_USER, 'owner', id);
    return { data };
  }

  @Post()
  @HttpCode(201)
  async create(
    @Req() req: Request,
    @Body(new ZodValidationPipe(AdminCreateBookingSchema)) dto: AdminCreateBookingDto,
  ) {
    requireScope(req.apiKey, 'bookings:write');
    const data = await this.svc.adminCreate(req.apiKey!.tenantId, SYSTEM_USER, 'owner', dto);
    return { data };
  }

  @Post(':id/cancel')
  async cancel(
    @Req() req: Request,
    @Param('id', ParseUUIDPipe) id: string,
    @Body(new ZodValidationPipe(CancelBookingSchema)) dto: CancelBookingDto,
  ) {
    requireScope(req.apiKey, 'bookings:write');
    const data = await this.svc.cancel(req.apiKey!.tenantId, SYSTEM_USER, 'owner', id, dto);
    return { data };
  }

  @Post(':id/reschedule')
  async reschedule(
    @Req() req: Request,
    @Param('id', ParseUUIDPipe) id: string,
    @Body(new ZodValidationPipe(RescheduleBookingSchema)) dto: RescheduleBookingDto,
  ) {
    requireScope(req.apiKey, 'bookings:write');
    const data = await this.svc.reschedule(req.apiKey!.tenantId, SYSTEM_USER, 'owner', id, dto);
    return { data };
  }

  @Post(':id/mark-no-show')
  async markNoShow(@Req() req: Request, @Param('id', ParseUUIDPipe) id: string) {
    requireScope(req.apiKey, 'bookings:write');
    const data = await this.svc.markNoShow(req.apiKey!.tenantId, SYSTEM_USER, 'owner', id);
    return { data };
  }

  @Post(':id/mark-completed')
  async markCompleted(@Req() req: Request, @Param('id', ParseUUIDPipe) id: string) {
    requireScope(req.apiKey, 'bookings:write');
    const data = await this.svc.markCompleted(req.apiKey!.tenantId, SYSTEM_USER, 'owner', id);
    return { data };
  }
}
