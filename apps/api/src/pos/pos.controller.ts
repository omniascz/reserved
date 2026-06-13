import {
  BadRequestException,
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
  CreateProductSchema,
  CreateSaleSchema,
  UpdateProductSchema,
  type CreateProductDto,
  type CreateSaleDto,
  type UpdateProductDto,
} from './dto/pos.dto.js';
import { PosService } from './pos.service.js';

@Controller('admin/pos')
export class PosController {
  constructor(@Inject(PosService) private readonly svc: PosService) {}

  // ─── Produkty ────────────────────────────────────────────────────────

  @Get('products')
  async listProducts(@CurrentUser() user: AccessTokenPayload) {
    return { data: await this.svc.listProducts(user.tenantId, user.sub, user.role) };
  }

  @Post('products')
  @HttpCode(201)
  async createProduct(
    @CurrentUser() user: AccessTokenPayload,
    @Body(new ZodValidationPipe(CreateProductSchema)) dto: CreateProductDto,
  ) {
    return { data: await this.svc.createProduct(user.tenantId, user.sub, user.role, dto) };
  }

  @Patch('products/:id')
  async updateProduct(
    @CurrentUser() user: AccessTokenPayload,
    @Param('id', ParseUUIDPipe) id: string,
    @Body(new ZodValidationPipe(UpdateProductSchema)) dto: UpdateProductDto,
  ) {
    return { data: await this.svc.updateProduct(user.tenantId, user.sub, user.role, id, dto) };
  }

  @Delete('products/:id')
  async deleteProduct(
    @CurrentUser() user: AccessTokenPayload,
    @Param('id', ParseUUIDPipe) id: string,
  ) {
    return { data: await this.svc.deleteProduct(user.tenantId, user.sub, user.role, id) };
  }

  // ─── Prodej ──────────────────────────────────────────────────────────

  @Post('sales')
  @HttpCode(201)
  async createSale(
    @CurrentUser() user: AccessTokenPayload,
    @Body(new ZodValidationPipe(CreateSaleSchema)) dto: CreateSaleDto,
  ) {
    return { data: await this.svc.createSale(user.tenantId, user.sub, user.role, dto) };
  }

  @Get('sales')
  async listSales(
    @CurrentUser() user: AccessTokenPayload,
    @Query('from') from?: string,
    @Query('to') to?: string,
  ) {
    return { data: await this.svc.listSales(user.tenantId, user.sub, user.role, { from, to }) };
  }

  @Get('sales/:id')
  async getSale(@CurrentUser() user: AccessTokenPayload, @Param('id', ParseUUIDPipe) id: string) {
    return { data: await this.svc.getSale(user.tenantId, user.sub, user.role, id) };
  }

  // ─── Uzávěrka ──────────────────────────────────────────────────────────

  @Get('report')
  async report(
    @CurrentUser() user: AccessTokenPayload,
    @Query('from') from: string,
    @Query('to') to: string,
  ) {
    const fromDate = new Date(from);
    const toDate = new Date(to);
    if (Number.isNaN(fromDate.getTime()) || Number.isNaN(toDate.getTime())) {
      throw new BadRequestException({
        error: { code: 'INVALID_RANGE', message: 'from a to musí být platná ISO data.' },
      });
    }
    return {
      data: await this.svc.report(user.tenantId, user.sub, user.role, fromDate, toDate),
    };
  }
}
