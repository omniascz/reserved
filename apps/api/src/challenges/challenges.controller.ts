import { Body, Controller, Get, Inject, Param, ParseUUIDPipe, Post } from '@nestjs/common';
import { z } from 'zod';
import { CurrentUser } from '../auth/decorators/current-user.decorator.js';
import type { AccessTokenPayload } from '../auth/auth.types.js';
import { ZodValidationPipe } from '../auth/zod-validation.pipe.js';
import { ChallengesService } from './challenges.service.js';

const CreateChallengeSchema = z.object({
  name: z.string().min(1).max(200),
  description: z.string().max(2000).optional().nullable(),
  metric: z.enum(['attendance', 'minutes']).default('attendance'),
  goal: z.number().int().min(0).max(100000).optional(),
  startsAt: z.string().datetime(),
  endsAt: z.string().datetime(),
});

@Controller('admin/challenges')
export class ChallengesController {
  constructor(@Inject(ChallengesService) private readonly svc: ChallengesService) {}

  @Get()
  async list(@CurrentUser() user: AccessTokenPayload) {
    return { data: await this.svc.list(user.tenantId, user.sub, user.role) };
  }

  @Post()
  async create(
    @CurrentUser() user: AccessTokenPayload,
    @Body(new ZodValidationPipe(CreateChallengeSchema)) dto: z.infer<typeof CreateChallengeSchema>,
  ) {
    return { data: await this.svc.create(user.tenantId, user.sub, user.role, dto) };
  }

  @Get(':id/leaderboard')
  async leaderboard(
    @CurrentUser() user: AccessTokenPayload,
    @Param('id', ParseUUIDPipe) id: string,
  ) {
    return { data: await this.svc.leaderboard(user.tenantId, id) };
  }
}
