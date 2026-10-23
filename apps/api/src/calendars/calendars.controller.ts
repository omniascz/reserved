// Kalendáře zaměstnanců — Outlook (Microsoft 365) a CalDAV (Apple, Nextcloud,
// Seznam…) v administraci + veřejné push endpointy pro Google a Microsoft.
// Google má vlastní controller z dřívějška (admin/integrations/google).

import {
  Body,
  Controller,
  Delete,
  Get,
  Headers,
  HttpCode,
  Inject,
  Param,
  ParseUUIDPipe,
  Patch,
  Post,
  Query,
  Res,
} from '@nestjs/common';
import type { Response } from 'express';
import { z } from 'zod';
import { CurrentUser } from '../auth/decorators/current-user.decorator.js';
import { Public } from '../auth/decorators/public.decorator.js';
import type { AccessTokenPayload } from '../auth/auth.types.js';
import { ZodValidationPipe } from '../auth/zod-validation.pipe.js';
import { CalendarConfig } from './calendar.config.js';
import { CalendarSyncService } from './calendar-sync.service.js';

const CaldavConnectSchema = z
  .object({
    employeeId: z.string().uuid(),
    serverUrl: z.string().url(),
    username: z.string().min(1).max(255),
    password: z.string().min(1).max(500),
    calendarUrl: z.string().max(2000).optional(),
  })
  .strict();
type CaldavConnectDto = z.infer<typeof CaldavConnectSchema>;

const UpdateConnectionSchema = z
  .object({
    inboundSyncEnabled: z.boolean().optional(),
    outboundEnabled: z.boolean().optional(),
    isActive: z.boolean().optional(),
  })
  .strict();
type UpdateConnectionDto = z.infer<typeof UpdateConnectionSchema>;

const OutlookNotificationSchema = z.object({
  value: z
    .array(
      z
        .object({ subscriptionId: z.string().optional(), clientState: z.string().optional() })
        .passthrough(),
    )
    .default([]),
});

@Controller('admin/integrations/calendars')
export class CalendarsAdminController {
  constructor(
    @Inject(CalendarSyncService) private readonly svc: CalendarSyncService,
    @Inject(CalendarConfig) private readonly config: CalendarConfig,
  ) {}

  @Get()
  async list(@CurrentUser() user: AccessTokenPayload) {
    return { data: await this.svc.list(user.tenantId, user.sub, user.role) };
  }

  /** OAuth URL pro připojení Outlooku zaměstnance. */
  @Post('outlook/:employeeId/start')
  async outlookStart(
    @CurrentUser() user: AccessTokenPayload,
    @Param('employeeId', ParseUUIDPipe) employeeId: string,
  ) {
    return { data: await this.svc.outlookStart(user.tenantId, user.sub, user.role, employeeId) };
  }

  /** Návrat z přihlášení Microsoftu (prohlížeč) → zpět do administrace. */
  @Public()
  @Get('outlook/callback')
  async outlookCallback(
    @Query('code') code: string,
    @Query('state') state: string,
    @Query('error') error: string | undefined,
    @Res() res: Response,
  ) {
    const back = `${this.config.adminBaseUrl}/integrations`;
    if (error || !code || !state) {
      return res.redirect(
        `${back}?outlook_error=${encodeURIComponent(error ?? 'missing_code_or_state')}`,
      );
    }
    try {
      const r = await this.svc.outlookCallback(code, state);
      return res.redirect(`${back}?outlook_success=1&email=${encodeURIComponent(r.email ?? '')}`);
    } catch (err) {
      return res.redirect(
        `${back}?outlook_error=${encodeURIComponent(err instanceof Error ? err.message : 'unknown')}`,
      );
    }
  }

  @Post('caldav')
  @HttpCode(201)
  async caldavConnect(
    @CurrentUser() user: AccessTokenPayload,
    @Body(new ZodValidationPipe(CaldavConnectSchema)) dto: CaldavConnectDto,
  ) {
    return { data: await this.svc.caldavConnect(user.tenantId, user.sub, user.role, dto) };
  }

  @Patch(':id')
  async update(
    @CurrentUser() user: AccessTokenPayload,
    @Param('id', ParseUUIDPipe) id: string,
    @Body(new ZodValidationPipe(UpdateConnectionSchema)) dto: UpdateConnectionDto,
  ) {
    await this.svc.update(user.tenantId, user.sub, user.role, id, dto);
    return { data: { ok: true } };
  }

  @Post(':id/sync')
  async syncNow(@CurrentUser() user: AccessTokenPayload, @Param('id', ParseUUIDPipe) id: string) {
    return { data: await this.svc.syncNow(user.tenantId, user.sub, user.role, id) };
  }

  @Delete(':id')
  @HttpCode(204)
  async revoke(@CurrentUser() user: AccessTokenPayload, @Param('id', ParseUUIDPipe) id: string) {
    await this.svc.revoke(user.tenantId, user.sub, user.role, id);
  }
}

/** Push notifikace od Googlu a Microsoftu (veřejné, ověřené tokenem kanálu). */
@Public()
@Controller('integrations')
export class CalendarPushController {
  constructor(@Inject(CalendarSyncService) private readonly svc: CalendarSyncService) {}

  /** Google events.watch → POST bez těla, údaje v hlavičkách. */
  @Post('google/push')
  @HttpCode(200)
  async googlePush(
    @Headers('x-goog-channel-id') channelId: string,
    @Headers('x-goog-channel-token') token: string,
    @Headers('x-goog-resource-state') state: string,
  ): Promise<void> {
    // Vždy 200 — Google jinak opakuje; neznámý / podvržený kanál se tiše ignoruje.
    await this.svc.googlePush(channelId ?? '', token ?? '', state ?? '');
  }

  /**
   * Microsoft Graph: při zakládání subscription pošle ?validationToken=… a čeká
   * ho zpátky jako text/plain do 10 s; pak posílá notifikace s clientState.
   */
  @Post('outlook/notifications')
  async outlookNotifications(
    @Query('validationToken') validationToken: string | undefined,
    @Body() body: unknown,
    @Res() res: Response,
  ) {
    if (validationToken) {
      return res.status(200).type('text/plain').send(validationToken);
    }
    const parsed = OutlookNotificationSchema.safeParse(body);
    if (parsed.success) await this.svc.outlookNotify(parsed.data.value);
    return res.status(202).send();
  }
}
