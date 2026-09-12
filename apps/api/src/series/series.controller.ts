import {
  Body,
  Controller,
  Get,
  HttpCode,
  Inject,
  Param,
  ParseUUIDPipe,
  Post,
} from '@nestjs/common';
import { CurrentUser } from '../auth/decorators/current-user.decorator.js';
import type { AccessTokenPayload } from '../auth/auth.types.js';
import { ZodValidationPipe } from '../auth/zod-validation.pipe.js';
import { CreateSeriesSchema, type CreateSeriesDto } from './dto/series.dto.js';
import { SeriesService } from './series.service.js';

@Controller('admin/booking-series')
export class SeriesController {
  constructor(@Inject(SeriesService) private readonly svc: SeriesService) {}

  @Get()
  async list(@CurrentUser() user: AccessTokenPayload) {
    return { data: await this.svc.list(user.tenantId, user.sub, user.role) };
  }

  @Get(':id')
  async get(@CurrentUser() user: AccessTokenPayload, @Param('id', ParseUUIDPipe) id: string) {
    return { data: await this.svc.get(user.tenantId, user.sub, user.role, id) };
  }

  @Post()
  @HttpCode(201)
  async create(
    @CurrentUser() user: AccessTokenPayload,
    @Body(new ZodValidationPipe(CreateSeriesSchema)) dto: CreateSeriesDto,
  ) {
    return { data: await this.svc.create(user.tenantId, user.sub, user.role, dto) };
  }

  @Post(':id/cancel')
  async cancel(@CurrentUser() user: AccessTokenPayload, @Param('id', ParseUUIDPipe) id: string) {
    return { data: await this.svc.cancelSeries(user.tenantId, user.sub, user.role, id) };
  }
}
