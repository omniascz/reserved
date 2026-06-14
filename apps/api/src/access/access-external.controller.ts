// External API: ověření vstupního kódu zámkem/turniketem (sprint 10.32).
// Autorizace přes tenant-scoped API klíč (scope access:validate).

import { Body, Controller, HttpCode, Inject, Post, Req, UseGuards } from '@nestjs/common';
import type { Request } from 'express';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import { Public } from '../auth/decorators/public.decorator.js';
import { ZodValidationPipe } from '../auth/zod-validation.pipe.js';
import { ApiKeyGuard, requireScope } from '../api-keys/api-key.guard.js';
import { ApiKeyThrottlerGuard } from '../api-keys/api-key-throttler.guard.js';
import { AccessService } from './access.service.js';
import { ValidateCodeSchema, type ValidateCodeDto } from './dto/access.dto.js';

@ApiTags('External — Access')
@ApiBearerAuth('api-key')
@Public()
@UseGuards(ApiKeyGuard, ApiKeyThrottlerGuard)
@Controller('external/v1/access')
export class AccessExternalController {
  constructor(@Inject(AccessService) private readonly svc: AccessService) {}

  /** Zámek/turniket ověří kód: vrací granted/denied + důvod. */
  @Post('validate')
  @HttpCode(200)
  @ApiOperation({ summary: 'Ověří vstupní kód (open gym / slot).' })
  async validate(
    @Req() req: Request,
    @Body(new ZodValidationPipe(ValidateCodeSchema)) dto: ValidateCodeDto,
  ) {
    requireScope(req.apiKey, 'access:validate');
    const data = await this.svc.validate(req.apiKey!.tenantId, {
      code: dto.code,
      branchId: dto.branchId ?? null,
    });
    return { data };
  }
}
