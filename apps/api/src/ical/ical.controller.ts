import { Controller, Get, Header, Inject, Param, Query } from '@nestjs/common';
import { CurrentUser } from '../auth/decorators/current-user.decorator.js';
import type { AccessTokenPayload } from '../auth/auth.types.js';
import { Public } from '../auth/decorators/public.decorator.js';
import { IcalService } from './ical.service.js';

@Controller()
export class IcalController {
  constructor(@Inject(IcalService) private readonly svc: IcalService) {}

  /** Admin: získá subscription URL kalendáře pro zaměstnance. */
  @Get('admin/ical/url')
  async feedUrl(@CurrentUser() user: AccessTokenPayload, @Query('employeeId') employeeId: string) {
    return { data: await this.svc.buildFeedUrlForEmployee(user.tenantId, employeeId) };
  }

  /** Veřejný iCal feed (.ics) — kalendář si ho přihlásí přes URL. */
  @Public()
  @Get('public/:slug/ical/:token')
  @Header('Content-Type', 'text/calendar; charset=utf-8')
  async feed(@Param('token') token: string): Promise<string> {
    return this.svc.generateForToken(token);
  }
}
