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
  ListPaymentsQuerySchema,
  RecordPaymentSchema,
  RefundPaymentSchema,
  UpsertPaymentMethodSchema,
  type ListPaymentsQueryDto,
  type RecordPaymentDto,
  type RefundPaymentDto,
  type UpsertPaymentMethodDto,
} from './dto/payment.dto.js';
import { PaymentsService } from './payments.service.js';

@Controller('admin')
export class PaymentsController {
  constructor(@Inject(PaymentsService) private readonly svc: PaymentsService) {}

  // ─── Methods config ───────────────────────────────────────────

  @Get('payment-methods')
  async listMethods(@CurrentUser() user: AccessTokenPayload) {
    return { data: await this.svc.listMethods(user.tenantId, user.sub, user.role) };
  }

  @Post('payment-methods')
  @HttpCode(200)
  async upsertMethod(
    @CurrentUser() user: AccessTokenPayload,
    @Body(new ZodValidationPipe(UpsertPaymentMethodSchema)) dto: UpsertPaymentMethodDto,
  ) {
    return { data: await this.svc.upsertMethod(user.tenantId, user.sub, user.role, dto) };
  }

  @Delete('payment-methods/:type')
  @HttpCode(204)
  async deleteMethod(@CurrentUser() user: AccessTokenPayload, @Param('type') methodType: string) {
    await this.svc.deleteMethod(user.tenantId, user.sub, user.role, methodType);
  }

  // ─── Payments ─────────────────────────────────────────────────

  @Get('payments')
  async listPayments(
    @CurrentUser() user: AccessTokenPayload,
    @Query(new ZodValidationPipe(ListPaymentsQuerySchema)) query: ListPaymentsQueryDto,
  ) {
    return { data: await this.svc.listPayments(user.tenantId, user.sub, user.role, query) };
  }

  @Get('payments/:id')
  async getPayment(
    @CurrentUser() user: AccessTokenPayload,
    @Param('id', ParseUUIDPipe) id: string,
  ) {
    return { data: await this.svc.getPayment(user.tenantId, user.sub, user.role, id) };
  }

  @Post('payments')
  @HttpCode(201)
  async recordPayment(
    @CurrentUser() user: AccessTokenPayload,
    @Body(new ZodValidationPipe(RecordPaymentSchema)) dto: RecordPaymentDto,
  ) {
    return { data: await this.svc.recordPayment(user.tenantId, user.sub, user.role, dto) };
  }

  @Post('payments/:id/mark-paid')
  async markPaid(@CurrentUser() user: AccessTokenPayload, @Param('id', ParseUUIDPipe) id: string) {
    return { data: await this.svc.markQrAsPaid(user.tenantId, user.sub, user.role, id) };
  }

  @Post('payments/:id/refund')
  async refund(
    @CurrentUser() user: AccessTokenPayload,
    @Param('id', ParseUUIDPipe) id: string,
    @Body(new ZodValidationPipe(RefundPaymentSchema)) dto: RefundPaymentDto,
  ) {
    return { data: await this.svc.refundPayment(user.tenantId, user.sub, user.role, id, dto) };
  }

  @Get('payments/:id/qr')
  async generateQr(
    @CurrentUser() user: AccessTokenPayload,
    @Param('id', ParseUUIDPipe) id: string,
  ) {
    return { data: await this.svc.generateQrPayment(user.tenantId, user.sub, user.role, id) };
  }
}
