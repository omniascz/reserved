import { Body, Controller, Get, Inject, Param, ParseUUIDPipe, Patch } from '@nestjs/common';
import { CurrentUser } from '../auth/decorators/current-user.decorator.js';
import type { AccessTokenPayload } from '../auth/auth.types.js';
import { ZodValidationPipe } from '../auth/zod-validation.pipe.js';
import { SetReviewVisibilitySchema, type SetReviewVisibilityDto } from './dto/review.dto.js';
import { ReviewsService } from './reviews.service.js';

// Sprint 10.6 — admin moderace recenzí.
@Controller('admin/reviews')
export class ReviewsController {
  constructor(@Inject(ReviewsService) private readonly svc: ReviewsService) {}

  @Get()
  async list(@CurrentUser() user: AccessTokenPayload) {
    const data = await this.svc.listForAdmin(user.tenantId, user.sub, user.role);
    return { data };
  }

  @Patch(':id')
  async setVisibility(
    @CurrentUser() user: AccessTokenPayload,
    @Param('id', ParseUUIDPipe) id: string,
    @Body(new ZodValidationPipe(SetReviewVisibilitySchema)) dto: SetReviewVisibilityDto,
  ) {
    const data = await this.svc.setVisibility(user.tenantId, user.sub, user.role, id, dto.status);
    return { data };
  }
}
