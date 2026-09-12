import { Body, Controller, HttpCode, Inject, Post } from '@nestjs/common';
import { CurrentUser } from '../auth/decorators/current-user.decorator.js';
import type { AccessTokenPayload } from '../auth/auth.types.js';
import { ZodValidationPipe } from '../auth/zod-validation.pipe.js';
import { CreateChainedSchema, type CreateChainedDto } from './dto/chained.dto.js';
import { ChainedBookingsService } from './chained-bookings.service.js';

@Controller('admin/chained-bookings')
export class ChainedBookingsController {
  constructor(@Inject(ChainedBookingsService) private readonly svc: ChainedBookingsService) {}

  @Post()
  @HttpCode(201)
  async create(
    @CurrentUser() user: AccessTokenPayload,
    @Body(new ZodValidationPipe(CreateChainedSchema)) dto: CreateChainedDto,
  ) {
    return { data: await this.svc.create(user.tenantId, user.sub, user.role, dto) };
  }
}
