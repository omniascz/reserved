import {
  Body,
  Controller,
  Delete,
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
import { HolidaysService } from './holidays.service.js';
import { CreateHolidaySchema, type CreateHolidayDto } from './dto/holiday.dto.js';

@Controller('admin/holidays')
export class HolidaysController {
  constructor(@Inject(HolidaysService) private readonly svc: HolidaysService) {}

  @Get()
  async list(
    @CurrentUser() user: AccessTokenPayload,
    @Query('from') from?: string,
    @Query('to') to?: string,
  ) {
    const data = await this.svc.list(user.tenantId, user.sub, user.role, { from, to });
    return { data };
  }

  @Post()
  @HttpCode(201)
  async create(
    @CurrentUser() user: AccessTokenPayload,
    @Body(new ZodValidationPipe(CreateHolidaySchema)) dto: CreateHolidayDto,
  ) {
    const data = await this.svc.create(user.tenantId, user.sub, user.role, dto);
    return { data };
  }

  @Delete(':id')
  @HttpCode(204)
  async delete(@CurrentUser() user: AccessTokenPayload, @Param('id', ParseUUIDPipe) id: string) {
    await this.svc.delete(user.tenantId, user.sub, user.role, id);
  }

  @Post('import-cz')
  async importCz(@CurrentUser() user: AccessTokenPayload, @Query('year') yearParam?: string) {
    const year = yearParam ? Number(yearParam) : new Date().getFullYear();
    if (!Number.isInteger(year) || year < 2000 || year > 2100) {
      return { data: { inserted: 0, skipped: 0 }, error: 'Invalid year' };
    }
    const data = await this.svc.importCzHolidays(user.tenantId, user.sub, user.role, year);
    return { data };
  }
}
