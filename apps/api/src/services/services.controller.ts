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
  CreateServiceCategorySchema,
  CreateServiceSchema,
  UpdateServiceCategorySchema,
  UpdateServiceSchema,
  type CreateServiceCategoryDto,
  type CreateServiceDto,
  type UpdateServiceCategoryDto,
  type UpdateServiceDto,
} from './dto/service.dto.js';
import { ServicesService } from './services.service.js';

@Controller('admin')
export class ServicesController {
  constructor(@Inject(ServicesService) private readonly svc: ServicesService) {}

  // ─── Kategorie ────────────────────────────────────────────────────────

  @Get('service-categories')
  async listCategories(@CurrentUser() user: AccessTokenPayload) {
    const data = await this.svc.listCategories(user.tenantId, user.sub, user.role);
    return { data };
  }

  @Post('service-categories')
  @HttpCode(201)
  async createCategory(
    @CurrentUser() user: AccessTokenPayload,
    @Body(new ZodValidationPipe(CreateServiceCategorySchema)) dto: CreateServiceCategoryDto,
  ) {
    const data = await this.svc.createCategory(user.tenantId, user.sub, user.role, dto);
    return { data };
  }

  @Patch('service-categories/:id')
  async updateCategory(
    @CurrentUser() user: AccessTokenPayload,
    @Param('id', ParseUUIDPipe) id: string,
    @Body(new ZodValidationPipe(UpdateServiceCategorySchema)) dto: UpdateServiceCategoryDto,
  ) {
    const data = await this.svc.updateCategory(user.tenantId, user.sub, user.role, id, dto);
    return { data };
  }

  @Delete('service-categories/:id')
  @HttpCode(204)
  async deleteCategory(
    @CurrentUser() user: AccessTokenPayload,
    @Param('id', ParseUUIDPipe) id: string,
  ) {
    await this.svc.deleteCategory(user.tenantId, user.sub, user.role, id);
  }

  // ─── Služby ──────────────────────────────────────────────────────────

  @Get('services')
  async listServices(@CurrentUser() user: AccessTokenPayload) {
    const data = await this.svc.listServices(user.tenantId, user.sub, user.role);
    return { data };
  }

  @Get('services/:id')
  async getService(
    @CurrentUser() user: AccessTokenPayload,
    @Param('id', ParseUUIDPipe) id: string,
  ) {
    const data = await this.svc.getService(user.tenantId, user.sub, user.role, id);
    return { data };
  }

  @Post('services')
  @HttpCode(201)
  async createService(
    @CurrentUser() user: AccessTokenPayload,
    @Body(new ZodValidationPipe(CreateServiceSchema)) dto: CreateServiceDto,
  ) {
    const data = await this.svc.createService(user.tenantId, user.sub, user.role, dto);
    return { data };
  }

  @Patch('services/:id')
  async updateService(
    @CurrentUser() user: AccessTokenPayload,
    @Param('id', ParseUUIDPipe) id: string,
    @Body(new ZodValidationPipe(UpdateServiceSchema)) dto: UpdateServiceDto,
  ) {
    const data = await this.svc.updateService(user.tenantId, user.sub, user.role, id, dto);
    return { data };
  }

  @Delete('services/:id')
  @HttpCode(204)
  async deleteService(
    @CurrentUser() user: AccessTokenPayload,
    @Param('id', ParseUUIDPipe) id: string,
  ) {
    await this.svc.deleteService(user.tenantId, user.sub, user.role, id);
  }
}
