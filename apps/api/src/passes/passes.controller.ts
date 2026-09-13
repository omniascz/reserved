import { Body, Controller, Get, Inject, Param, ParseUUIDPipe, Post, Query } from '@nestjs/common';
import { CurrentUser } from '../auth/decorators/current-user.decorator.js';
import type { AccessTokenPayload } from '../auth/auth.types.js';
import { ZodValidationPipe } from '../auth/zod-validation.pipe.js';
import {
  ListPassesQuerySchema,
  PassTypeParamSchema,
  SuspendPassSchema,
  type ListPassesQueryDto,
  type PassType,
  type SuspendPassDto,
} from './dto/passes.dto.js';
import { PassesService } from './passes.service.js';

// Provozní pohled na VYDANÉ permanentky napříč typy (UI 2).
@Controller('admin/passes')
export class PassesController {
  constructor(@Inject(PassesService) private readonly svc: PassesService) {}

  @Get()
  async list(
    @CurrentUser() user: AccessTokenPayload,
    @Query(new ZodValidationPipe(ListPassesQuerySchema)) query: ListPassesQueryDto,
  ) {
    return { data: await this.svc.list(user.tenantId, user.sub, user.role, query) };
  }

  @Get(':type/:id')
  async get(
    @CurrentUser() user: AccessTokenPayload,
    @Param('type', new ZodValidationPipe(PassTypeParamSchema)) type: PassType,
    @Param('id', ParseUUIDPipe) id: string,
  ) {
    return { data: await this.svc.get(user.tenantId, user.sub, user.role, type, id) };
  }

  @Post(':type/:id/suspend')
  async suspend(
    @CurrentUser() user: AccessTokenPayload,
    @Param('type', new ZodValidationPipe(PassTypeParamSchema)) type: PassType,
    @Param('id', ParseUUIDPipe) id: string,
    @Body(new ZodValidationPipe(SuspendPassSchema)) dto: SuspendPassDto,
  ) {
    return { data: await this.svc.suspend(user.tenantId, user.sub, user.role, type, id, dto) };
  }

  @Post(':type/:id/resume')
  async resume(
    @CurrentUser() user: AccessTokenPayload,
    @Param('type', new ZodValidationPipe(PassTypeParamSchema)) type: PassType,
    @Param('id', ParseUUIDPipe) id: string,
    @Body(new ZodValidationPipe(SuspendPassSchema)) dto: SuspendPassDto,
  ) {
    return { data: await this.svc.resume(user.tenantId, user.sub, user.role, type, id, dto) };
  }
}
