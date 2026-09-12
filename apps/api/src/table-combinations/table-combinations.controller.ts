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
  CreateTableCombinationSchema,
  UpdateTableCombinationSchema,
  type CreateTableCombinationDto,
  type UpdateTableCombinationDto,
} from './dto/table-combination.dto.js';
import { TableCombinationsService } from './table-combinations.service.js';

@Controller('admin/table-combinations')
export class TableCombinationsController {
  constructor(@Inject(TableCombinationsService) private readonly svc: TableCombinationsService) {}

  @Get()
  async list(@CurrentUser() user: AccessTokenPayload, @Query('branchId') branchId?: string) {
    return { data: await this.svc.list(user.tenantId, user.sub, user.role, branchId) };
  }

  @Post()
  @HttpCode(201)
  async create(
    @CurrentUser() user: AccessTokenPayload,
    @Body(new ZodValidationPipe(CreateTableCombinationSchema)) dto: CreateTableCombinationDto,
  ) {
    return { data: await this.svc.create(user.tenantId, user.sub, user.role, dto) };
  }

  @Patch(':id')
  async update(
    @CurrentUser() user: AccessTokenPayload,
    @Param('id', ParseUUIDPipe) id: string,
    @Body(new ZodValidationPipe(UpdateTableCombinationSchema)) dto: UpdateTableCombinationDto,
  ) {
    return { data: await this.svc.update(user.tenantId, user.sub, user.role, id, dto) };
  }

  @Delete(':id')
  async remove(@CurrentUser() user: AccessTokenPayload, @Param('id', ParseUUIDPipe) id: string) {
    return { data: await this.svc.remove(user.tenantId, user.sub, user.role, id) };
  }
}
