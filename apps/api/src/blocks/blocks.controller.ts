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
import { BlocksService } from './blocks.service.js';
import {
  CreateBlockSchema,
  UpdateBlockSchema,
  type CreateBlockDto,
  type UpdateBlockDto,
} from './dto/block.dto.js';

@Controller('admin/blocks')
export class BlocksController {
  constructor(@Inject(BlocksService) private readonly svc: BlocksService) {}

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
    @Body(new ZodValidationPipe(CreateBlockSchema)) dto: CreateBlockDto,
  ) {
    const data = await this.svc.create(user.tenantId, user.sub, user.role, dto);
    return { data };
  }

  @Patch(':id')
  async update(
    @CurrentUser() user: AccessTokenPayload,
    @Param('id', ParseUUIDPipe) id: string,
    @Body(new ZodValidationPipe(UpdateBlockSchema)) dto: UpdateBlockDto,
  ) {
    const data = await this.svc.update(user.tenantId, user.sub, user.role, id, dto);
    return { data };
  }

  @Delete(':id')
  @HttpCode(204)
  async delete(@CurrentUser() user: AccessTokenPayload, @Param('id', ParseUUIDPipe) id: string) {
    await this.svc.delete(user.tenantId, user.sub, user.role, id);
  }
}
