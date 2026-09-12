import {
  Body,
  Controller,
  Get,
  HttpCode,
  Inject,
  NotFoundException,
  Param,
  Patch,
  Post,
  Req,
  UseGuards,
} from '@nestjs/common';
import type { Request } from 'express';
import { z } from 'zod';
import { Public } from '../auth/decorators/public.decorator.js';
import { ZodValidationPipe } from '../auth/zod-validation.pipe.js';
import { PortalGuard } from './portal.guard.js';
import { PortalMeService } from './portal-me.service.js';
import { ContentService } from '../content/content.service.js';
import { SeriesService } from '../series/series.service.js';

const SelfSeriesSchema = z.object({
  serviceId: z.string().uuid(),
  employeeId: z.string().uuid(),
  startsAt: z.string().datetime(),
  frequency: z.enum(['weekly', 'biweekly', 'monthly']),
  occurrences: z.number().int().min(2).max(52),
  customerNote: z.string().max(2000).optional().nullable(),
});
import {
  CancelMyBookingSchema,
  RescheduleMyBookingSchema,
  UpdateProfileSchema,
  type CancelMyBookingDto,
  type RescheduleMyBookingDto,
  type UpdateProfileDto,
} from './dto/portal-me.dto.js';

// Wrapper: všechny /portal/me/* endpointy chrání PortalGuard.
// @Public() vypne admin JwtGuard (který by jinak ohlásil chybu — token je portal, ne admin).
@Public()
@UseGuards(PortalGuard)
@Controller('portal/me')
export class PortalMeController {
  constructor(
    @Inject(PortalMeService) private readonly me: PortalMeService,
    @Inject(ContentService) private readonly content: ContentService,
    @Inject(SeriesService) private readonly series: SeriesService,
  ) {}

  private requireAuth(req: Request): { tenantId: string; customerId: string } {
    if (!req.portalAuth) {
      throw new NotFoundException({
        error: { code: 'AUTH_REQUIRED', message: 'Přihlášení vyžadováno.' },
      });
    }
    return { tenantId: req.portalAuth.tenantId, customerId: req.portalAuth.sub };
  }

  @Get()
  async getProfile(@Req() req: Request): Promise<{ data: unknown }> {
    const { tenantId, customerId } = this.requireAuth(req);
    return { data: await this.me.getProfile(tenantId, customerId) };
  }

  /** Self-service: klient si založí opakovanou rezervaci („držím si úterý 18:00"). */
  @Post('series')
  @HttpCode(201)
  async createSeries(
    @Req() req: Request,
    @Body(new ZodValidationPipe(SelfSeriesSchema)) dto: z.infer<typeof SelfSeriesSchema>,
  ): Promise<{ data: unknown }> {
    const { tenantId, customerId } = this.requireAuth(req);
    return { data: await this.series.createSelfService(tenantId, customerId, dto) };
  }

  /** Knihovna obsahu pro přihlášeného klienta — odemkne dle členství/předplatného. */
  @Get('content')
  async content_(@Req() req: Request): Promise<{ data: unknown }> {
    const { tenantId, customerId } = this.requireAuth(req);
    return { data: await this.content.listForCustomer(tenantId, customerId) };
  }

  @Patch()
  async updateProfile(
    @Req() req: Request,
    @Body(new ZodValidationPipe(UpdateProfileSchema)) dto: UpdateProfileDto,
  ): Promise<{ data: unknown }> {
    const { tenantId, customerId } = this.requireAuth(req);
    return { data: await this.me.updateProfile(tenantId, customerId, dto) };
  }

  @Get('bookings')
  async listBookings(@Req() req: Request): Promise<{ data: unknown }> {
    const { tenantId, customerId } = this.requireAuth(req);
    return { data: await this.me.listBookings(tenantId, customerId) };
  }

  @Get('credit-packs')
  async listCreditPacks(@Req() req: Request): Promise<{ data: unknown }> {
    const { tenantId, customerId } = this.requireAuth(req);
    return { data: await this.me.listMyCreditPacks(tenantId, customerId) };
  }

  @Get('bundle-packs')
  async listBundlePacks(@Req() req: Request): Promise<{ data: unknown }> {
    const { tenantId, customerId } = this.requireAuth(req);
    return { data: await this.me.listMyBundlePacks(tenantId, customerId) };
  }

  @Get('time-packs')
  async listTimePacks(@Req() req: Request): Promise<{ data: unknown }> {
    const { tenantId, customerId } = this.requireAuth(req);
    return { data: await this.me.listMyTimePacks(tenantId, customerId) };
  }

  @Get('subscriptions')
  async listSubscriptions(@Req() req: Request): Promise<{ data: unknown }> {
    const { tenantId, customerId } = this.requireAuth(req);
    return { data: await this.me.listMySubscriptions(tenantId, customerId) };
  }

  @Post('bookings/:id/cancel')
  @HttpCode(200)
  async cancelBooking(
    @Req() req: Request,
    @Param('id') id: string,
    @Body(new ZodValidationPipe(CancelMyBookingSchema)) dto: CancelMyBookingDto,
  ): Promise<{ data: unknown }> {
    const { tenantId, customerId } = this.requireAuth(req);
    return { data: await this.me.cancel(tenantId, customerId, id, dto) };
  }

  @Post('bookings/:id/reschedule')
  @HttpCode(200)
  async rescheduleBooking(
    @Req() req: Request,
    @Param('id') id: string,
    @Body(new ZodValidationPipe(RescheduleMyBookingSchema)) dto: RescheduleMyBookingDto,
  ): Promise<{ data: unknown }> {
    const { tenantId, customerId } = this.requireAuth(req);
    return { data: await this.me.reschedule(tenantId, customerId, id, dto) };
  }
}
