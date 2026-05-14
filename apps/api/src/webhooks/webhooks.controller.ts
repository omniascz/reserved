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
import { WebhooksService } from './webhooks.service.js';
import {
  CreateWebhookSchema,
  UpdateWebhookSchema,
  type CreateWebhookDto,
  type UpdateWebhookDto,
} from './dto/webhook.dto.js';

@Controller('admin/webhooks')
export class WebhooksController {
  constructor(@Inject(WebhooksService) private readonly svc: WebhooksService) {}

  @Get()
  async list(@CurrentUser() user: AccessTokenPayload) {
    return { data: await this.svc.list(user.tenantId, user.sub, user.role) };
  }

  /**
   * Vytvori webhook a vrati i secret. Secret se pri pozdejsim GETu uz neukaze
   * — admin si ho musi zkopirovat ted.
   */
  @Post()
  @HttpCode(201)
  async create(
    @CurrentUser() user: AccessTokenPayload,
    @Body(new ZodValidationPipe(CreateWebhookSchema)) dto: CreateWebhookDto,
  ) {
    const row = await this.svc.create(user.tenantId, user.sub, user.role, dto);
    return {
      data: {
        id: row.id,
        name: row.name,
        url: row.url,
        eventTypes: row.eventTypes,
        isActive: row.isActive,
        secret: row.secret,
        createdAt: row.createdAt,
      },
    };
  }

  @Patch(':id')
  async update(
    @CurrentUser() user: AccessTokenPayload,
    @Param('id', ParseUUIDPipe) id: string,
    @Body(new ZodValidationPipe(UpdateWebhookSchema)) dto: UpdateWebhookDto,
  ) {
    const row = await this.svc.update(user.tenantId, user.sub, user.role, id, dto);
    return {
      data: {
        id: row.id,
        name: row.name,
        url: row.url,
        eventTypes: row.eventTypes,
        isActive: row.isActive,
      },
    };
  }

  @Delete(':id')
  @HttpCode(204)
  async remove(@CurrentUser() user: AccessTokenPayload, @Param('id', ParseUUIDPipe) id: string) {
    await this.svc.delete(user.tenantId, user.sub, user.role, id);
  }

  @Post(':id/test')
  async test(@CurrentUser() user: AccessTokenPayload, @Param('id', ParseUUIDPipe) id: string) {
    return { data: await this.svc.sendTest(user.tenantId, user.sub, user.role, id) };
  }

  @Get(':id/deliveries')
  async deliveries(
    @CurrentUser() user: AccessTokenPayload,
    @Param('id', ParseUUIDPipe) id: string,
  ) {
    return { data: await this.svc.listDeliveries(user.tenantId, user.sub, user.role, id) };
  }
}
