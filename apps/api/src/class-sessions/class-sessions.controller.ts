import {
  Body,
  Controller,
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
  CreateClassSessionSchema,
  CreateRecurrenceSchema,
  JoinClassSessionSchema,
  ListClassSessionsQuerySchema,
  ListRecurrencesQuerySchema,
  MarkAttendanceSchema,
  UpdateClassSessionSchema,
  type CreateClassSessionDto,
  type CreateRecurrenceDto,
  type JoinClassSessionDto,
  type ListClassSessionsQueryDto,
  type ListRecurrencesQueryDto,
  type MarkAttendanceDto,
  type UpdateClassSessionDto,
} from './dto/class-session.dto.js';
import { ClassSessionsService } from './class-sessions.service.js';

// Sprint 10.0 — skupinové lekce (admin API).
@Controller('admin/class-sessions')
export class ClassSessionsController {
  constructor(@Inject(ClassSessionsService) private readonly svc: ClassSessionsService) {}

  /**
   * Výpis lekcí. `status` výchozí 'open' = otevřené a nezaplněné (dosavadní
   * chování); 'full' | 'cancelled' | 'completed' | 'all' zpřístupní i ostatní.
   */
  @Get()
  async listOpen(
    @CurrentUser() user: AccessTokenPayload,
    @Query(new ZodValidationPipe(ListClassSessionsQuerySchema)) query: ListClassSessionsQueryDto,
  ) {
    const data = await this.svc.listOpen(user.tenantId, user.sub, user.role, query);
    return { data };
  }

  /** Výpis opakovaných rozvrhů. MUSÍ být nad @Get(':id'), jinak to spolkne UUID parametr. */
  @Get('recurrences')
  async listRecurrences(
    @CurrentUser() user: AccessTokenPayload,
    @Query(new ZodValidationPipe(ListRecurrencesQuerySchema)) query: ListRecurrencesQueryDto,
  ) {
    return { data: await this.svc.listRecurrences(user.tenantId, user.sub, user.role, query) };
  }

  @Get(':id')
  async get(@CurrentUser() user: AccessTokenPayload, @Param('id', ParseUUIDPipe) id: string) {
    const data = await this.svc.get(user.tenantId, user.sub, user.role, id);
    return { data };
  }

  /** Mapa míst v sále (spot booking) — obsazená/volná. */
  @Get(':id/spots')
  async spots(@CurrentUser() user: AccessTokenPayload, @Param('id', ParseUUIDPipe) id: string) {
    return { data: await this.svc.sessionSpots(user.tenantId, id) };
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

  /** Editace vypsané lekce — čas, trenér, přístroj, kapacita, věk, prerekvizita. */
  @Patch(':id')
  async update(
    @CurrentUser() user: AccessTokenPayload,
    @Param('id', ParseUUIDPipe) id: string,
    @Body(new ZodValidationPipe(UpdateClassSessionSchema)) dto: UpdateClassSessionDto,
  ) {
    return { data: await this.svc.update(user.tenantId, user.sub, user.role, id, dto) };
  }

  /** Opakovaný rozvrh — vygeneruje sérii lekcí (sprint 10.25). */
  @Post('recurrences')
  @HttpCode(201)
  async createRecurrence(
    @CurrentUser() user: AccessTokenPayload,
    @Body(new ZodValidationPipe(CreateRecurrenceSchema)) dto: CreateRecurrenceDto,
  ) {
    return {
      data: await this.svc.createRecurrence(user.tenantId, user.sub, user.role, dto),
    };
  }

  @Post('recurrences/:id/cancel')
  async cancelRecurrence(
    @CurrentUser() user: AccessTokenPayload,
    @Param('id', ParseUUIDPipe) id: string,
  ) {
    return {
      data: await this.svc.cancelRecurrence(user.tenantId, user.sub, user.role, id),
    };
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

  // ─── Pořadník (sprint 10.5) ─────────────────────────────────────────

  @Get(':id/waitlist')
  async listWaitlist(
    @CurrentUser() user: AccessTokenPayload,
    @Param('id', ParseUUIDPipe) id: string,
  ) {
    const data = await this.svc.listWaitlist(user.tenantId, user.sub, user.role, id);
    return { data };
  }

  @Post(':id/waitlist')
  @HttpCode(201)
  async joinWaitlist(
    @CurrentUser() user: AccessTokenPayload,
    @Param('id', ParseUUIDPipe) id: string,
    @Body(new ZodValidationPipe(JoinClassSessionSchema)) dto: JoinClassSessionDto,
  ) {
    const data = await this.svc.joinWaitlist(user.tenantId, user.sub, user.role, id, dto);
    return { data };
  }

  @Post(':id/waitlist/:waitlistId/leave')
  async leaveWaitlist(
    @CurrentUser() user: AccessTokenPayload,
    @Param('id', ParseUUIDPipe) id: string,
    @Param('waitlistId', ParseUUIDPipe) waitlistId: string,
  ) {
    const data = await this.svc.leaveWaitlist(user.tenantId, user.sub, user.role, id, waitlistId);
    return { data };
  }

  @Post(':id/cancel')
  async cancel(@CurrentUser() user: AccessTokenPayload, @Param('id', ParseUUIDPipe) id: string) {
    const data = await this.svc.cancelSession(user.tenantId, user.sub, user.role, id);
    return { data };
  }

  // ─── Docházka (sprint 10.27) ─────────────────────────────────────────

  @Get(':id/participants')
  async participants(
    @CurrentUser() user: AccessTokenPayload,
    @Param('id', ParseUUIDPipe) id: string,
  ) {
    return { data: await this.svc.listParticipants(user.tenantId, user.sub, user.role, id) };
  }

  @Get(':id/attendance')
  async attendance(
    @CurrentUser() user: AccessTokenPayload,
    @Param('id', ParseUUIDPipe) id: string,
  ) {
    return { data: await this.svc.sessionAttendance(user.tenantId, user.sub, user.role, id) };
  }

  @Post(':id/participants/:bookingId/attendance')
  async markAttendance(
    @CurrentUser() user: AccessTokenPayload,
    @Param('id', ParseUUIDPipe) id: string,
    @Param('bookingId', ParseUUIDPipe) bookingId: string,
    @Body(new ZodValidationPipe(MarkAttendanceSchema)) dto: MarkAttendanceDto,
  ) {
    return {
      data: await this.svc.markAttendance(
        user.tenantId,
        user.sub,
        user.role,
        id,
        bookingId,
        dto.attended,
      ),
    };
  }
}
