import {
  Body,
  Controller,
  Delete,
  Get,
  HttpCode,
  Inject,
  Param,
  Patch,
  Post,
} from '@nestjs/common';
import { CurrentUser } from '../auth/decorators/current-user.decorator.js';
import type { AccessTokenPayload } from '../auth/auth.types.js';
import { ZodValidationPipe } from '../auth/zod-validation.pipe.js';
import {
  ToggleFeatureFlagSchema,
  UpsertFeatureFlagSchema,
  type ToggleFeatureFlagDto,
  type UpsertFeatureFlagDto,
} from './dto/feature-flag.dto.js';
import { FeatureFlagsService } from './feature-flags.service.js';

@Controller('admin')
export class FeatureFlagsController {
  constructor(@Inject(FeatureFlagsService) private readonly svc: FeatureFlagsService) {}

  @Get('feature-flags')
  async list(@CurrentUser() user: AccessTokenPayload) {
    return { data: await this.svc.list(user.tenantId, user.sub, user.role) };
  }

  @Post('feature-flags')
  @HttpCode(200) // upsert — vraci 200 (i nove vytvorene); kompromis pro idempotenci
  async upsert(
    @CurrentUser() user: AccessTokenPayload,
    @Body(new ZodValidationPipe(UpsertFeatureFlagSchema)) dto: UpsertFeatureFlagDto,
  ) {
    return { data: await this.svc.upsert(user.tenantId, user.sub, user.role, dto) };
  }

  @Patch('feature-flags/:key')
  async toggle(
    @CurrentUser() user: AccessTokenPayload,
    @Param('key') key: string,
    @Body(new ZodValidationPipe(ToggleFeatureFlagSchema)) dto: ToggleFeatureFlagDto,
  ) {
    return { data: await this.svc.toggle(user.tenantId, user.sub, user.role, key, dto) };
  }

  @Delete('feature-flags/:key')
  @HttpCode(204)
  async delete(@CurrentUser() user: AccessTokenPayload, @Param('key') key: string) {
    await this.svc.delete(user.tenantId, user.sub, user.role, key);
  }
}
