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
  AdjustBundleItemSchema,
  AllocateBundlePackSchema,
  CreateBundlePackSchema,
  UpdateBundlePackSchema,
  type AdjustBundleItemDto,
  type AllocateBundlePackDto,
  type CreateBundlePackDto,
  type UpdateBundlePackDto,
} from './dto/bundle-pack.dto.js';
import { BundlePacksService } from './bundle-packs.service.js';

@Controller('admin')
export class BundlePacksController {
  constructor(@Inject(BundlePacksService) private readonly svc: BundlePacksService) {}

  // ─── Sablony /admin/bundle-packs ───────────────────────────────────

  @Get('bundle-packs')
  async list(@CurrentUser() user: AccessTokenPayload) {
    return { data: await this.svc.list(user.tenantId, user.sub, user.role) };
  }

  @Get('bundle-packs/:id')
  async get(@CurrentUser() user: AccessTokenPayload, @Param('id', ParseUUIDPipe) id: string) {
    return { data: await this.svc.get(user.tenantId, user.sub, user.role, id) };
  }

  @Post('bundle-packs')
  @HttpCode(201)
  async create(
    @CurrentUser() user: AccessTokenPayload,
    @Body(new ZodValidationPipe(CreateBundlePackSchema)) dto: CreateBundlePackDto,
  ) {
    return { data: await this.svc.create(user.tenantId, user.sub, user.role, dto) };
  }

  @Patch('bundle-packs/:id')
  async update(
    @CurrentUser() user: AccessTokenPayload,
    @Param('id', ParseUUIDPipe) id: string,
    @Body(new ZodValidationPipe(UpdateBundlePackSchema)) dto: UpdateBundlePackDto,
  ) {
    return { data: await this.svc.update(user.tenantId, user.sub, user.role, id, dto) };
  }

  @Delete('bundle-packs/:id')
  @HttpCode(204)
  async delete(@CurrentUser() user: AccessTokenPayload, @Param('id', ParseUUIDPipe) id: string) {
    await this.svc.delete(user.tenantId, user.sub, user.role, id);
  }

  // ─── Alokace zakaznikovi /admin/customers/:id/bundle-packs ────────

  @Get('customers/:customerId/bundle-packs')
  async listForCustomer(
    @CurrentUser() user: AccessTokenPayload,
    @Param('customerId', ParseUUIDPipe) customerId: string,
  ) {
    return {
      data: await this.svc.listForCustomer(user.tenantId, user.sub, user.role, customerId),
    };
  }

  @Post('customers/:customerId/bundle-packs')
  @HttpCode(201)
  async allocate(
    @CurrentUser() user: AccessTokenPayload,
    @Param('customerId', ParseUUIDPipe) customerId: string,
    @Body(new ZodValidationPipe(AllocateBundlePackSchema)) dto: AllocateBundlePackDto,
  ) {
    return {
      data: await this.svc.allocateToCustomer(user.tenantId, user.sub, user.role, customerId, dto),
    };
  }

  @Patch('bundle-packs/allocation/:id/adjust')
  async adjust(
    @CurrentUser() user: AccessTokenPayload,
    @Param('id', ParseUUIDPipe) id: string,
    @Body(new ZodValidationPipe(AdjustBundleItemSchema)) dto: AdjustBundleItemDto,
  ) {
    return { data: await this.svc.adjustItem(user.tenantId, user.sub, user.role, id, dto) };
  }

  @Get('bundle-packs/allocation/:id/uses')
  async uses(@CurrentUser() user: AccessTokenPayload, @Param('id', ParseUUIDPipe) id: string) {
    return {
      data: await this.svc.listUsesForAllocation(user.tenantId, user.sub, user.role, id),
    };
  }
}
