import {
  Body,
  Controller,
  Get,
  HttpCode,
  Inject,
  Param,
  ParseUUIDPipe,
  Post,
} from '@nestjs/common';
import { CurrentUser } from '../auth/decorators/current-user.decorator.js';
import type { AccessTokenPayload } from '../auth/auth.types.js';
import { ZodValidationPipe } from '../auth/zod-validation.pipe.js';
import {
  IssueVoucherSchema,
  RedeemVoucherSchema,
  type IssueVoucherDto,
  type RedeemVoucherDto,
} from './dto/voucher.dto.js';
import { VouchersService } from './vouchers.service.js';

// Sprint 10.9 — dárkové poukazy (admin).
@Controller('admin/vouchers')
export class VouchersController {
  constructor(@Inject(VouchersService) private readonly svc: VouchersService) {}

  @Get()
  async list(@CurrentUser() user: AccessTokenPayload) {
    const data = await this.svc.listForAdmin(user.tenantId, user.sub, user.role);
    return { data };
  }

  @Post()
  @HttpCode(201)
  async issue(
    @CurrentUser() user: AccessTokenPayload,
    @Body(new ZodValidationPipe(IssueVoucherSchema)) dto: IssueVoucherDto,
  ) {
    const data = await this.svc.issue(user.tenantId, user.sub, user.role, dto);
    return { data };
  }

  @Post('redeem')
  async redeem(
    @CurrentUser() user: AccessTokenPayload,
    @Body(new ZodValidationPipe(RedeemVoucherSchema)) dto: RedeemVoucherDto,
  ) {
    const data = await this.svc.redeem(user.tenantId, user.sub, user.role, dto);
    return { data };
  }

  @Post(':id/cancel')
  async cancel(@CurrentUser() user: AccessTokenPayload, @Param('id', ParseUUIDPipe) id: string) {
    const data = await this.svc.cancel(user.tenantId, user.sub, user.role, id);
    return { data };
  }
}
