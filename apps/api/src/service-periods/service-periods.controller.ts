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
  Query,
} from '@nestjs/common';
import { CurrentUser } from '../auth/decorators/current-user.decorator.js';
import type { AccessTokenPayload } from '../auth/auth.types.js';
import { ZodValidationPipe } from '../auth/zod-validation.pipe.js';
import {
  CreateServicePeriodSchema,
  UpdateServicePeriodSchema,
  type CreateServicePeriodDto,
  type UpdateServicePeriodDto,
} from './dto/service-period.dto.js';
import { ServicePeriodsService } from './service-periods.service.js';

@Controller('admin/service-periods')
export class ServicePeriodsController {
  constructor(@Inject(ServicePeriodsService) private readonly svc: ServicePeriodsService) {}

  @Get()
  async list(@CurrentUser() user: AccessTokenPayload, @Query('branchId') branchId?: string) {
    return { data: await this.svc.list(user.tenantId, user.sub, user.role, branchId) };
  }

  @Post()
  @HttpCode(201)
  async create(
    @CurrentUser() user: AccessTokenPayload,
    @Body(new ZodValidationPipe(CreateServicePeriodSchema)) dto: CreateServicePeriodDto,
  ) {
    return { data: await this.svc.create(user.tenantId, user.sub, user.role, dto) };
  }

  @Patch(':id')
  async update(
    @CurrentUser() user: AccessTokenPayload,
    @Param('id', ParseUUIDPipe) id: string,
    @Body(new ZodValidationPipe(UpdateServicePeriodSchema)) dto: UpdateServicePeriodDto,
  ) {
    return { data: await this.svc.update(user.tenantId, user.sub, user.role, id, dto) };
  }

  @Delete(':id')
  async remove(@CurrentUser() user: AccessTokenPayload, @Param('id', ParseUUIDPipe) id: string) {
    return { data: await this.svc.remove(user.tenantId, user.sub, user.role, id) };
  }
}
