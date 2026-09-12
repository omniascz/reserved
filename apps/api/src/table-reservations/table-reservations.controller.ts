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
  AvailableTablesSchema,
  CreateTableReservationSchema,
  OverviewSchema,
  WalkInSchema,
  type AvailableTablesDto,
  type CreateTableReservationDto,
  type OverviewDto,
  type WalkInDto,
} from './dto/table-reservation.dto.js';
import { TableReservationsService } from './table-reservations.service.js';

@Controller('admin/table-reservations')
export class TableReservationsController {
  constructor(@Inject(TableReservationsService) private readonly svc: TableReservationsService) {}

  @Get()
  async list(@CurrentUser() user: AccessTokenPayload, @Query('status') status?: string) {
    return { data: await this.svc.list(user.tenantId, user.sub, user.role, { status }) };
  }

  /** Volné stoly (jednotlivé i slučitelné sestavy) pro příchod a velikost skupiny. */
  @Get('available')
  async available(
    @CurrentUser() user: AccessTokenPayload,
    @Query(new ZodValidationPipe(AvailableTablesSchema)) query: AvailableTablesDto,
  ) {
    return { data: await this.svc.availableTables(user.tenantId, user.sub, user.role, query) };
  }

  /** Půdorysný přehled stolů k danému okamžiku (free / occupied). */
  @Get('overview')
  async overview(
    @CurrentUser() user: AccessTokenPayload,
    @Query(new ZodValidationPipe(OverviewSchema)) query: OverviewDto,
  ) {
    return { data: await this.svc.overview(user.tenantId, user.sub, user.role, query) };
  }

  @Get(':id')
  async get(@CurrentUser() user: AccessTokenPayload, @Param('id', ParseUUIDPipe) id: string) {
    return { data: await this.svc.get(user.tenantId, user.sub, user.role, id) };
  }

  @Post()
  @HttpCode(201)
  async create(
    @CurrentUser() user: AccessTokenPayload,
    @Body(new ZodValidationPipe(CreateTableReservationSchema)) dto: CreateTableReservationDto,
  ) {
    return { data: await this.svc.create(user.tenantId, user.sub, user.role, dto) };
  }

  @Post('walk-in')
  @HttpCode(201)
  async walkIn(
    @CurrentUser() user: AccessTokenPayload,
    @Body(new ZodValidationPipe(WalkInSchema)) dto: WalkInDto,
  ) {
    return { data: await this.svc.walkIn(user.tenantId, user.sub, user.role, dto) };
  }

  @Post(':id/seat')
  async seat(@CurrentUser() user: AccessTokenPayload, @Param('id', ParseUUIDPipe) id: string) {
    return { data: await this.svc.seat(user.tenantId, user.sub, user.role, id) };
  }

  @Post(':id/complete')
  async complete(@CurrentUser() user: AccessTokenPayload, @Param('id', ParseUUIDPipe) id: string) {
    return { data: await this.svc.complete(user.tenantId, user.sub, user.role, id) };
  }

  @Post(':id/no-show')
  async noShow(@CurrentUser() user: AccessTokenPayload, @Param('id', ParseUUIDPipe) id: string) {
    return { data: await this.svc.noShow(user.tenantId, user.sub, user.role, id) };
  }

  @Post(':id/cancel')
  async cancel(@CurrentUser() user: AccessTokenPayload, @Param('id', ParseUUIDPipe) id: string) {
    return { data: await this.svc.cancel(user.tenantId, user.sub, user.role, id) };
  }
}
