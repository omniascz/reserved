import { Body, Controller, Get, Inject, Param, ParseUUIDPipe, Post } from '@nestjs/common';
import { CurrentUser } from '../auth/decorators/current-user.decorator.js';
import type { AccessTokenPayload } from '../auth/auth.types.js';
import { ZodValidationPipe } from '../auth/zod-validation.pipe.js';
import { AccessService } from './access.service.js';
import {
  IssueBookingCodeSchema,
  IssueGeneralCodeSchema,
  type IssueBookingCodeDto,
  type IssueGeneralCodeDto,
} from './dto/access.dto.js';

// Admin správa vstupních kódů (JWT). Vydání ke slotu / open gym, výpis, revoke.
@Controller('admin/access')
export class AccessController {
  constructor(@Inject(AccessService) private readonly svc: AccessService) {}

  @Get('grants')
  async list(@CurrentUser() user: AccessTokenPayload) {
    return { data: await this.svc.list(user.tenantId, user.sub, user.role) };
  }

  /** Vydá vstupní kód ke konkrétní rezervaci (slot). */
  @Post('grants/booking')
  async issueBooking(
    @CurrentUser() user: AccessTokenPayload,
    @Body(new ZodValidationPipe(IssueBookingCodeSchema)) dto: IssueBookingCodeDto,
  ) {
    return { data: await this.svc.issueForBooking(user.tenantId, user.sub, user.role, dto) };
  }

  /** Vydá vstupní kód pro open gym / členství (období, víc vstupů). */
  @Post('grants/general')
  async issueGeneral(
    @CurrentUser() user: AccessTokenPayload,
    @Body(new ZodValidationPipe(IssueGeneralCodeSchema)) dto: IssueGeneralCodeDto,
  ) {
    return { data: await this.svc.issueGeneral(user.tenantId, user.sub, user.role, dto) };
  }

  @Post('grants/:id/revoke')
  async revoke(@CurrentUser() user: AccessTokenPayload, @Param('id', ParseUUIDPipe) id: string) {
    return { data: await this.svc.revoke(user.tenantId, user.sub, user.role, id) };
  }
}
