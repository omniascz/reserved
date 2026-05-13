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
} from '@nestjs/common';
import { CurrentUser } from '../auth/decorators/current-user.decorator.js';
import type { AccessTokenPayload } from '../auth/auth.types.js';
import { ZodValidationPipe } from '../auth/zod-validation.pipe.js';
import {
  AdjustCreditsSchema,
  AllocateCreditPackSchema,
  CreateCreditPackSchema,
  UpdateCreditPackSchema,
  type AdjustCreditsDto,
  type AllocateCreditPackDto,
  type CreateCreditPackDto,
  type UpdateCreditPackDto,
} from './dto/credit-pack.dto.js';
import { CreditPacksService } from './credit-packs.service.js';

@Controller('admin')
export class CreditPacksController {
  constructor(@Inject(CreditPacksService) private readonly svc: CreditPacksService) {}

  // ─── Sablony /admin/credit-packs ────────────────────────────────────

  @Get('credit-packs')
  async list(@CurrentUser() user: AccessTokenPayload) {
    return { data: await this.svc.list(user.tenantId, user.sub, user.role) };
  }

  @Get('credit-packs/:id')
  async get(@CurrentUser() user: AccessTokenPayload, @Param('id', ParseUUIDPipe) id: string) {
    return { data: await this.svc.get(user.tenantId, user.sub, user.role, id) };
  }

  @Post('credit-packs')
  @HttpCode(201)
  async create(
    @CurrentUser() user: AccessTokenPayload,
    @Body(new ZodValidationPipe(CreateCreditPackSchema)) dto: CreateCreditPackDto,
  ) {
    return { data: await this.svc.create(user.tenantId, user.sub, user.role, dto) };
  }

  @Patch('credit-packs/:id')
  async update(
    @CurrentUser() user: AccessTokenPayload,
    @Param('id', ParseUUIDPipe) id: string,
    @Body(new ZodValidationPipe(UpdateCreditPackSchema)) dto: UpdateCreditPackDto,
  ) {
    return { data: await this.svc.update(user.tenantId, user.sub, user.role, id, dto) };
  }

  @Delete('credit-packs/:id')
  @HttpCode(204)
  async delete(@CurrentUser() user: AccessTokenPayload, @Param('id', ParseUUIDPipe) id: string) {
    await this.svc.delete(user.tenantId, user.sub, user.role, id);
  }

  // ─── Alokace zakaznikovi /admin/customers/:id/credit-packs ───────

  @Get('customers/:customerId/credit-packs')
  async listForCustomer(
    @CurrentUser() user: AccessTokenPayload,
    @Param('customerId', ParseUUIDPipe) customerId: string,
  ) {
    return {
      data: await this.svc.listForCustomer(user.tenantId, user.sub, user.role, customerId),
    };
  }

  @Post('customers/:customerId/credit-packs')
  @HttpCode(201)
  async allocate(
    @CurrentUser() user: AccessTokenPayload,
    @Param('customerId', ParseUUIDPipe) customerId: string,
    @Body(new ZodValidationPipe(AllocateCreditPackSchema)) dto: AllocateCreditPackDto,
  ) {
    return {
      data: await this.svc.allocateToCustomer(user.tenantId, user.sub, user.role, customerId, dto),
    };
  }

  @Patch('credit-packs/allocation/:id/adjust')
  async adjust(
    @CurrentUser() user: AccessTokenPayload,
    @Param('id', ParseUUIDPipe) id: string,
    @Body(new ZodValidationPipe(AdjustCreditsSchema)) dto: AdjustCreditsDto,
  ) {
    return { data: await this.svc.adjust(user.tenantId, user.sub, user.role, id, dto) };
  }

  @Get('credit-packs/allocation/:id/uses')
  async uses(@CurrentUser() user: AccessTokenPayload, @Param('id', ParseUUIDPipe) id: string) {
    return {
      data: await this.svc.listUsesForAllocation(user.tenantId, user.sub, user.role, id),
    };
  }
}
