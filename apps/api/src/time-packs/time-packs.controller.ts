import {
  Body,
  Controller,
  Delete,
  Get,
  HttpCode,
  Inject,
  Param,
  ParseUUIDPipe,
  Patch,
  Post,
} from '@nestjs/common';
import { CurrentUser } from '../auth/decorators/current-user.decorator.js';
import type { AccessTokenPayload } from '../auth/auth.types.js';
import { ZodValidationPipe } from '../auth/zod-validation.pipe.js';
import {
  AdjustTimePackSchema,
  AllocateTimePackSchema,
  CreateTimePackSchema,
  UpdateTimePackSchema,
  type AdjustTimePackDto,
  type AllocateTimePackDto,
  type CreateTimePackDto,
  type UpdateTimePackDto,
} from './dto/time-pack.dto.js';
import { TimePacksService } from './time-packs.service.js';

@Controller('admin')
export class TimePacksController {
  constructor(@Inject(TimePacksService) private readonly svc: TimePacksService) {}

  // ─── Sablony /admin/time-packs ─────────────────────────────────────

  @Get('time-packs')
  async list(@CurrentUser() user: AccessTokenPayload) {
    return { data: await this.svc.list(user.tenantId, user.sub, user.role) };
  }

  @Get('time-packs/:id')
  async get(@CurrentUser() user: AccessTokenPayload, @Param('id', ParseUUIDPipe) id: string) {
    return { data: await this.svc.get(user.tenantId, user.sub, user.role, id) };
  }

  @Post('time-packs')
  @HttpCode(201)
  async create(
    @CurrentUser() user: AccessTokenPayload,
    @Body(new ZodValidationPipe(CreateTimePackSchema)) dto: CreateTimePackDto,
  ) {
    return { data: await this.svc.create(user.tenantId, user.sub, user.role, dto) };
  }

  @Patch('time-packs/:id')
  async update(
    @CurrentUser() user: AccessTokenPayload,
    @Param('id', ParseUUIDPipe) id: string,
    @Body(new ZodValidationPipe(UpdateTimePackSchema)) dto: UpdateTimePackDto,
  ) {
    return { data: await this.svc.update(user.tenantId, user.sub, user.role, id, dto) };
  }

  @Delete('time-packs/:id')
  @HttpCode(204)
  async delete(@CurrentUser() user: AccessTokenPayload, @Param('id', ParseUUIDPipe) id: string) {
    await this.svc.delete(user.tenantId, user.sub, user.role, id);
  }

  // ─── Alokace zakaznikovi /admin/customers/:id/time-packs ──────────

  @Get('customers/:customerId/time-packs')
  async listForCustomer(
    @CurrentUser() user: AccessTokenPayload,
    @Param('customerId', ParseUUIDPipe) customerId: string,
  ) {
    return {
      data: await this.svc.listForCustomer(user.tenantId, user.sub, user.role, customerId),
    };
  }

  @Post('customers/:customerId/time-packs')
  @HttpCode(201)
  async allocate(
    @CurrentUser() user: AccessTokenPayload,
    @Param('customerId', ParseUUIDPipe) customerId: string,
    @Body(new ZodValidationPipe(AllocateTimePackSchema)) dto: AllocateTimePackDto,
  ) {
    return {
      data: await this.svc.allocateToCustomer(user.tenantId, user.sub, user.role, customerId, dto),
    };
  }

  @Patch('time-packs/allocation/:id/adjust')
  async adjust(
    @CurrentUser() user: AccessTokenPayload,
    @Param('id', ParseUUIDPipe) id: string,
    @Body(new ZodValidationPipe(AdjustTimePackSchema)) dto: AdjustTimePackDto,
  ) {
    return { data: await this.svc.adjust(user.tenantId, user.sub, user.role, id, dto) };
  }

  @Get('time-packs/allocation/:id/uses')
  async uses(@CurrentUser() user: AccessTokenPayload, @Param('id', ParseUUIDPipe) id: string) {
    return {
      data: await this.svc.listUsesForAllocation(user.tenantId, user.sub, user.role, id),
    };
  }
}
