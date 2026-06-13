import { Controller, Get, Inject, Param, Post } from '@nestjs/common';
import { CurrentUser } from '../auth/decorators/current-user.decorator.js';
import type { AccessTokenPayload } from '../auth/auth.types.js';
import { VerticalPresetsService } from './vertical-presets.service.js';

// Sprint 10.11 — vertikálové presety (admin one-click setup).
@Controller('admin/vertical-presets')
export class VerticalPresetsController {
  constructor(@Inject(VerticalPresetsService) private readonly svc: VerticalPresetsService) {}

  @Get()
  list() {
    return { data: this.svc.list() };
  }

  @Post(':id/apply')
  async apply(@CurrentUser() user: AccessTokenPayload, @Param('id') id: string) {
    const data = await this.svc.apply(user.tenantId, user.sub, user.role, id);
    return { data };
  }
}
