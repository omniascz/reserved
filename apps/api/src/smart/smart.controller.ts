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
  RequestConfirmationSchema,
  RequestConfirmationsSchema,
  SweepUnconfirmedSchema,
  type RequestConfirmationDto,
  type RequestConfirmationsDto,
  type SweepUnconfirmedDto,
} from './dto/smart.dto.js';
import { SmartService } from './smart.service.js';

@Controller('admin/smart')
export class SmartController {
  constructor(@Inject(SmartService) private readonly svc: SmartService) {}

  /** Nadcházející rizikové rezervace (medium+) — přehled pro admina. */
  @Get('at-risk')
  async atRisk(
    @CurrentUser() user: AccessTokenPayload,
    @Query('withinHours') withinHours?: string,
  ) {
    const hours = withinHours ? Math.min(720, Math.max(1, Number(withinHours) || 48)) : 48;
    return { data: await this.svc.listAtRisk(user.tenantId, user.sub, user.role, hours) };
  }

  /** Vyžádá potvrzení účasti pro jednu rezervaci. */
  @Post('bookings/:id/request-confirmation')
  @HttpCode(201)
  async requestOne(
    @CurrentUser() user: AccessTokenPayload,
    @Param('id', ParseUUIDPipe) id: string,
    @Body(new ZodValidationPipe(RequestConfirmationSchema)) dto: RequestConfirmationDto,
  ) {
    return {
      data: await this.svc.requestConfirmation(user.tenantId, user.sub, user.role, id, dto.channel),
    };
  }

  /** Hromadně vyžádá potvrzení pro nadcházející rizikové rezervace. */
  @Post('request-confirmations')
  @HttpCode(201)
  async requestBulk(
    @CurrentUser() user: AccessTokenPayload,
    @Body(new ZodValidationPipe(RequestConfirmationsSchema)) dto: RequestConfirmationsDto,
  ) {
    return { data: await this.svc.requestForUpcoming(user.tenantId, user.sub, user.role, dto) };
  }

  /** Uvolní místa u výzev, na které klient nereagoval. */
  @Post('sweep-unconfirmed')
  @HttpCode(201)
  async sweep(
    @CurrentUser() user: AccessTokenPayload,
    @Body(new ZodValidationPipe(SweepUnconfirmedSchema)) dto: SweepUnconfirmedDto,
  ) {
    return { data: await this.svc.sweepUnconfirmed(user.tenantId, user.sub, user.role, dto) };
  }
}
