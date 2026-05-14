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
  CancelSubscriptionSchema,
  CreateSubscriptionPlanSchema,
  SubscribeCustomerSchema,
  UpdateSubscriptionPlanSchema,
  type CancelSubscriptionDto,
  type CreateSubscriptionPlanDto,
  type SubscribeCustomerDto,
  type UpdateSubscriptionPlanDto,
} from './dto/subscription.dto.js';
import { SubscriptionsService } from './subscriptions.service.js';

@Controller('admin')
export class SubscriptionsController {
  constructor(@Inject(SubscriptionsService) private readonly svc: SubscriptionsService) {}

  // ─── Plans /admin/subscription-plans ──────────────────────────────

  @Get('subscription-plans')
  async list(@CurrentUser() user: AccessTokenPayload) {
    return { data: await this.svc.listPlans(user.tenantId, user.sub, user.role) };
  }

  @Get('subscription-plans/:id')
  async get(@CurrentUser() user: AccessTokenPayload, @Param('id', ParseUUIDPipe) id: string) {
    return { data: await this.svc.getPlan(user.tenantId, user.sub, user.role, id) };
  }

  @Post('subscription-plans')
  @HttpCode(201)
  async create(
    @CurrentUser() user: AccessTokenPayload,
    @Body(new ZodValidationPipe(CreateSubscriptionPlanSchema)) dto: CreateSubscriptionPlanDto,
  ) {
    return { data: await this.svc.createPlan(user.tenantId, user.sub, user.role, dto) };
  }

  @Patch('subscription-plans/:id')
  async update(
    @CurrentUser() user: AccessTokenPayload,
    @Param('id', ParseUUIDPipe) id: string,
    @Body(new ZodValidationPipe(UpdateSubscriptionPlanSchema)) dto: UpdateSubscriptionPlanDto,
  ) {
    return { data: await this.svc.updatePlan(user.tenantId, user.sub, user.role, id, dto) };
  }

  @Delete('subscription-plans/:id')
  @HttpCode(204)
  async delete(@CurrentUser() user: AccessTokenPayload, @Param('id', ParseUUIDPipe) id: string) {
    await this.svc.deletePlan(user.tenantId, user.sub, user.role, id);
  }

  // ─── Subscriptions /admin/customers/:id/subscriptions ─────────────

  @Get('customers/:customerId/subscriptions')
  async listForCustomer(
    @CurrentUser() user: AccessTokenPayload,
    @Param('customerId', ParseUUIDPipe) customerId: string,
  ) {
    return {
      data: await this.svc.listForCustomer(user.tenantId, user.sub, user.role, customerId),
    };
  }

  @Post('customers/:customerId/subscriptions')
  @HttpCode(201)
  async subscribe(
    @CurrentUser() user: AccessTokenPayload,
    @Param('customerId', ParseUUIDPipe) customerId: string,
    @Body(new ZodValidationPipe(SubscribeCustomerSchema)) dto: SubscribeCustomerDto,
  ) {
    return {
      data: await this.svc.subscribeCustomer(user.tenantId, user.sub, user.role, customerId, dto),
    };
  }

  @Post('subscriptions/:id/cancel')
  async cancel(
    @CurrentUser() user: AccessTokenPayload,
    @Param('id', ParseUUIDPipe) id: string,
    @Body(new ZodValidationPipe(CancelSubscriptionSchema)) dto: CancelSubscriptionDto,
  ) {
    return {
      data: await this.svc.cancelSubscription(user.tenantId, user.sub, user.role, id, dto),
    };
  }
}
