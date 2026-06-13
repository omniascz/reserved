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
  CreateClassSessionSchema,
  JoinClassSessionSchema,
  type CreateClassSessionDto,
  type JoinClassSessionDto,
} from './dto/class-session.dto.js';
import { ClassSessionsService } from './class-sessions.service.js';

// Sprint 10.0 — skupinové lekce (admin API).
@Controller('admin/class-sessions')
export class ClassSessionsController {
  constructor(@Inject(ClassSessionsService) private readonly svc: ClassSessionsService) {}

  @Get()
  async listOpen(
    @CurrentUser() user: AccessTokenPayload,
    @Query('serviceId') serviceId?: string,
    @Query('from') from?: string,
    @Query('to') to?: string,
  ) {
    const data = await this.svc.listOpen(user.tenantId, user.sub, user.role, {
      serviceId,
      from,
      to,
    });
    return { data };
  }

  @Get(':id')
  async get(@CurrentUser() user: AccessTokenPayload, @Param('id', ParseUUIDPipe) id: string) {
    const data = await this.svc.get(user.tenantId, user.sub, user.role, id);
    return { data };
  }

  @Post()
  @HttpCode(201)
  async create(
    @CurrentUser() user: AccessTokenPayload,
    @Body(new ZodValidationPipe(CreateClassSessionSchema)) dto: CreateClassSessionDto,
  ) {
    const data = await this.svc.create(user.tenantId, user.sub, user.role, dto);
    return { data };
  }

  @Post(':id/join')
  @HttpCode(201)
  async join(
    @CurrentUser() user: AccessTokenPayload,
    @Param('id', ParseUUIDPipe) id: string,
    @Body(new ZodValidationPipe(JoinClassSessionSchema)) dto: JoinClassSessionDto,
  ) {
    const data = await this.svc.join(user.tenantId, user.sub, user.role, id, dto);
    return { data };
  }

  @Post(':id/participants/:bookingId/leave')
  async leave(
    @CurrentUser() user: AccessTokenPayload,
    @Param('id', ParseUUIDPipe) id: string,
    @Param('bookingId', ParseUUIDPipe) bookingId: string,
  ) {
    const data = await this.svc.leave(user.tenantId, user.sub, user.role, id, bookingId);
    return { data };
  }

  @Post(':id/cancel')
  async cancel(@CurrentUser() user: AccessTokenPayload, @Param('id', ParseUUIDPipe) id: string) {
    const data = await this.svc.cancelSession(user.tenantId, user.sub, user.role, id);
    return { data };
  }
}
