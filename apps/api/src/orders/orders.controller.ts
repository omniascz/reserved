import { Body, Controller, Get, Inject, Param, ParseUUIDPipe, Post } from '@nestjs/common';
import { z } from 'zod';
import { CurrentUser } from '../auth/decorators/current-user.decorator.js';
import type { AccessTokenPayload } from '../auth/auth.types.js';
import { ZodValidationPipe } from '../auth/zod-validation.pipe.js';
import { OrdersService } from './orders.service.js';

const ItemSchema = z.object({
  kind: z.enum(['class', 'admission', 'appointment', 'course', 'product', 'other']),
  refId: z.string().uuid().optional().nullable(),
  name: z.string().min(1).max(200),
  priceHellers: z.number().int().min(0).max(10_000_000),
  quantity: z.number().int().min(1).max(999).optional(),
});
const CreateOrderSchema = z.object({
  customerName: z.string().min(1).max(200),
  customerEmail: z.string().email().max(255).optional().nullable(),
  customerId: z.string().uuid().optional().nullable(),
  currency: z.string().length(3).optional(),
  items: z.array(ItemSchema).min(1).max(50),
});
const PaySchema = z.object({
  methodType: z.enum([
    'cash',
    'card_terminal',
    'qr_bank',
    'stripe',
    'gopay',
    'mock',
    'comgate',
    'thepay',
    'payu',
    'gpwebpay',
  ]),
});

@Controller('admin/orders')
export class OrdersController {
  constructor(@Inject(OrdersService) private readonly svc: OrdersService) {}

  @Get()
  async list(@CurrentUser() user: AccessTokenPayload) {
    return { data: await this.svc.list(user.tenantId, user.sub, user.role) };
  }

  @Post()
  async create(
    @CurrentUser() user: AccessTokenPayload,
    @Body(new ZodValidationPipe(CreateOrderSchema)) dto: z.infer<typeof CreateOrderSchema>,
  ) {
    return { data: await this.svc.create(user.tenantId, user.sub, user.role, dto) };
  }

  @Get(':id')
  async get(@CurrentUser() user: AccessTokenPayload, @Param('id', ParseUUIDPipe) id: string) {
    return { data: await this.svc.get(user.tenantId, user.sub, user.role, id) };
  }

  @Post(':id/pay')
  async pay(
    @CurrentUser() user: AccessTokenPayload,
    @Param('id', ParseUUIDPipe) id: string,
    @Body(new ZodValidationPipe(PaySchema)) dto: z.infer<typeof PaySchema>,
  ) {
    return { data: await this.svc.pay(user.tenantId, user.sub, user.role, id, dto.methodType) };
  }
}
