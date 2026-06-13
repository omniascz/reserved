import {
  BadRequestException,
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
import { CreateStaySchema, type CreateStayDto } from './dto/stay.dto.js';
import { StaysService } from './stays.service.js';

@Controller('admin/stays')
export class StaysController {
  constructor(@Inject(StaysService) private readonly svc: StaysService) {}

  @Get()
  async list(@CurrentUser() user: AccessTokenPayload, @Query('status') status?: string) {
    return { data: await this.svc.list(user.tenantId, user.sub, user.role, { status }) };
  }

  /** Volné jednotky (pokoje/auta) pro rozsah dní. */
  @Get('available')
  async available(
    @CurrentUser() user: AccessTokenPayload,
    @Query('checkIn') checkIn: string,
    @Query('checkOut') checkOut: string,
    @Query('branchId') branchId?: string,
  ) {
    if (!checkIn || !checkOut) {
      throw new BadRequestException({
        error: { code: 'MISSING_DATES', message: 'checkIn a checkOut jsou povinné.' },
      });
    }
    return {
      data: await this.svc.availableUnits(user.tenantId, user.sub, user.role, {
        checkIn,
        checkOut,
        branchId,
      }),
    };
  }

  @Get(':id')
  async get(@CurrentUser() user: AccessTokenPayload, @Param('id', ParseUUIDPipe) id: string) {
    return { data: await this.svc.get(user.tenantId, user.sub, user.role, id) };
  }

  @Post()
  @HttpCode(201)
  async create(
    @CurrentUser() user: AccessTokenPayload,
    @Body(new ZodValidationPipe(CreateStaySchema)) dto: CreateStayDto,
  ) {
    return { data: await this.svc.create(user.tenantId, user.sub, user.role, dto) };
  }

  @Post(':id/check-in')
  async checkIn(@CurrentUser() user: AccessTokenPayload, @Param('id', ParseUUIDPipe) id: string) {
    return { data: await this.svc.checkIn(user.tenantId, user.sub, user.role, id) };
  }

  @Post(':id/check-out')
  async checkOut(@CurrentUser() user: AccessTokenPayload, @Param('id', ParseUUIDPipe) id: string) {
    return { data: await this.svc.checkOut(user.tenantId, user.sub, user.role, id) };
  }

  @Post(':id/cancel')
  async cancel(@CurrentUser() user: AccessTokenPayload, @Param('id', ParseUUIDPipe) id: string) {
    return { data: await this.svc.cancel(user.tenantId, user.sub, user.role, id) };
  }
}
