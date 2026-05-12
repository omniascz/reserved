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
import { RulesService } from './rules.service.js';
import {
  CreateRuleSchema,
  UpdateRuleSchema,
  type CreateRuleDto,
  type UpdateRuleDto,
} from './dto/rule.dto.js';

@Controller('admin/rules')
export class RulesController {
  constructor(@Inject(RulesService) private readonly svc: RulesService) {}

  @Get()
  async list(@CurrentUser() user: AccessTokenPayload) {
    return { data: await this.svc.list(user.tenantId, user.sub, user.role) };
  }

  @Get(':id')
  async get(@CurrentUser() user: AccessTokenPayload, @Param('id', ParseUUIDPipe) id: string) {
    return { data: await this.svc.get(user.tenantId, user.sub, user.role, id) };
  }

  @Post()
  @HttpCode(201)
  async create(
    @CurrentUser() user: AccessTokenPayload,
    @Body(new ZodValidationPipe(CreateRuleSchema)) dto: CreateRuleDto,
  ) {
    return { data: await this.svc.create(user.tenantId, user.sub, user.role, dto) };
  }

  @Patch(':id')
  async update(
    @CurrentUser() user: AccessTokenPayload,
    @Param('id', ParseUUIDPipe) id: string,
    @Body(new ZodValidationPipe(UpdateRuleSchema)) dto: UpdateRuleDto,
  ) {
    return { data: await this.svc.update(user.tenantId, user.sub, user.role, id, dto) };
  }

  @Delete(':id')
  @HttpCode(204)
  async delete(@CurrentUser() user: AccessTokenPayload, @Param('id', ParseUUIDPipe) id: string) {
    await this.svc.delete(user.tenantId, user.sub, user.role, id);
  }

  @Get(':id/executions')
  async executions(
    @CurrentUser() user: AccessTokenPayload,
    @Param('id', ParseUUIDPipe) id: string,
    @Query('limit') limit?: string,
  ) {
    const data = await this.svc.listExecutions(
      user.tenantId,
      user.sub,
      user.role,
      id,
      limit ? Number(limit) : 50,
    );
    return { data };
  }
}
