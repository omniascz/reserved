import {
  Body,
  Controller,
  Get,
  Inject,
  Param,
  ParseUUIDPipe,
  Patch,
  Query,
  Post,
  Delete,
  HttpCode,
  Res,
} from '@nestjs/common';
import type { Response } from 'express';
import { CurrentUser } from '../auth/decorators/current-user.decorator.js';
import { Public } from '../auth/decorators/public.decorator.js';
import type { AccessTokenPayload } from '../auth/auth.types.js';
import { GoogleCalendarService } from './google-calendar.service.js';

@Controller('admin/integrations/google')
export class GoogleCalendarController {
  constructor(@Inject(GoogleCalendarService) private readonly svc: GoogleCalendarService) {}

  /**
   * Vrati seznam pripojeni (per employee) v tenant.
   */
  @Get('connections')
  async listConnections(@CurrentUser() user: AccessTokenPayload) {
    return { data: await this.svc.listConnections(user.tenantId, user.sub, user.role) };
  }

  /**
   * Vrati OAuth URL pro spojeni employee Google uctu.
   * Frontend redirectne browser na vracenou URL.
   */
  @Post('connections/:employeeId/start')
  async startOAuth(
    @CurrentUser() user: AccessTokenPayload,
    @Param('employeeId', ParseUUIDPipe) employeeId: string,
  ) {
    return { data: await this.svc.startOAuth(user.tenantId, user.sub, user.role, employeeId) };
  }

  /**
   * OAuth callback z Google — public endpoint (Google posila browser).
   * Po uspesnem propojeni redirectne admin UI.
   */
  @Public()
  @Get('callback')
  async callback(
    @Query('code') code: string,
    @Query('state') state: string,
    @Query('error') error: string | undefined,
    @Res() res: Response,
  ) {
    const adminUrl = process.env.ADMIN_BASE_URL ?? 'http://localhost:3000';
    if (error) {
      return res.redirect(`${adminUrl}/settings?google_error=${encodeURIComponent(error)}`);
    }
    if (!code || !state) {
      return res.redirect(`${adminUrl}/settings?google_error=missing_code_or_state`);
    }
    try {
      const result = await this.svc.handleCallback(code, state);
      return res.redirect(
        `${adminUrl}/settings?google_success=1&email=${encodeURIComponent(result.googleEmail ?? '')}`,
      );
    } catch (err) {
      const msg = err instanceof Error ? err.message : 'unknown';
      return res.redirect(`${adminUrl}/settings?google_error=${encodeURIComponent(msg)}`);
    }
  }

  /**
   * Odpoji Google Calendar pro daneho employee.
   */
  @Delete('connections/:employeeId')
  @HttpCode(204)
  async revoke(
    @CurrentUser() user: AccessTokenPayload,
    @Param('employeeId', ParseUUIDPipe) employeeId: string,
  ) {
    await this.svc.revoke(user.tenantId, user.sub, user.role, employeeId);
  }

  /**
   * Prepnout inbound sync (G -> R) pro daneho employee.
   */
  @Patch('connections/:employeeId/inbound')
  async setInbound(
    @CurrentUser() user: AccessTokenPayload,
    @Param('employeeId', ParseUUIDPipe) employeeId: string,
    @Body() body: { enabled: boolean },
  ) {
    await this.svc.setInboundEnabled(user.tenantId, user.sub, user.role, employeeId, body.enabled);
    return { data: { ok: true } };
  }

  /**
   * Spusti manualne inbound sync pro daneho employee.
   * Stahne eventy z Google a vytvori/aktualizuje availability_blocks.
   */
  @Post('connections/:employeeId/sync-inbound')
  async syncInbound(
    @CurrentUser() user: AccessTokenPayload,
    @Param('employeeId', ParseUUIDPipe) employeeId: string,
  ) {
    return {
      data: await this.svc.syncInbound(user.tenantId, user.sub, user.role, employeeId),
    };
  }
}
