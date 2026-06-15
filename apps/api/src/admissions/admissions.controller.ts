import { Body, Controller, Inject, Post } from '@nestjs/common';
import { z } from 'zod';
import { CurrentUser } from '../auth/decorators/current-user.decorator.js';
import type { AccessTokenPayload } from '../auth/auth.types.js';
import { ZodValidationPipe } from '../auth/zod-validation.pipe.js';
import { AdmissionsService } from './admissions.service.js';

const SellAdmissionSchema = z.object({
  name: z.string().min(1).max(200),
  customerName: z.string().min(1).max(200),
  customerId: z.string().uuid().optional().nullable(),
  branchId: z.string().uuid().optional().nullable(),
  priceHellers: z.number().int().min(0).max(10_000_000),
  currency: z.string().length(3).optional(),
  validHours: z.number().int().min(1).max(48).optional(),
  methodType: z.enum(['cash', 'card_terminal', 'qr_bank']).optional(),
});

@Controller('admin/admissions')
export class AdmissionsController {
  constructor(@Inject(AdmissionsService) private readonly svc: AdmissionsService) {}

  /** Prodá vstupenku do prostoru → vstupní kód + platba. */
  @Post('sell')
  async sell(
    @CurrentUser() user: AccessTokenPayload,
    @Body(new ZodValidationPipe(SellAdmissionSchema)) dto: z.infer<typeof SellAdmissionSchema>,
  ) {
    return { data: await this.svc.sell(user.tenantId, user.sub, user.role, dto) };
  }
}
