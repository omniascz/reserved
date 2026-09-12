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
import { CreateJobSchema, type CreateJobDto } from './dto/dispatch.dto.js';
import { DispatchService } from './dispatch.service.js';

@Controller('admin/dispatch/jobs')
export class DispatchController {
  constructor(@Inject(DispatchService) private readonly svc: DispatchService) {}

  @Get()
  async list(
    @CurrentUser() user: AccessTokenPayload,
    @Query('status') status?: string,
    @Query('driverId') driverId?: string,
    @Query('vehicleId') vehicleId?: string,
  ) {
    return {
      data: await this.svc.list(user.tenantId, user.sub, user.role, {
        status,
        driverId,
        vehicleId,
      }),
    };
  }

  @Post()
  @HttpCode(201)
  async create(
    @CurrentUser() user: AccessTokenPayload,
    @Body(new ZodValidationPipe(CreateJobSchema)) dto: CreateJobDto,
  ) {
    return { data: await this.svc.create(user.tenantId, user.sub, user.role, dto) };
  }

  @Post(':id/start')
  async start(@CurrentUser() user: AccessTokenPayload, @Param('id', ParseUUIDPipe) id: string) {
    return { data: await this.svc.start(user.tenantId, user.sub, user.role, id) };
  }

  @Post(':id/complete')
  async complete(@CurrentUser() user: AccessTokenPayload, @Param('id', ParseUUIDPipe) id: string) {
    return { data: await this.svc.complete(user.tenantId, user.sub, user.role, id) };
  }

  @Post(':id/cancel')
  async cancel(@CurrentUser() user: AccessTokenPayload, @Param('id', ParseUUIDPipe) id: string) {
    return { data: await this.svc.cancel(user.tenantId, user.sub, user.role, id) };
  }
}
