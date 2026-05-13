import { Controller, Get, Inject, Query } from '@nestjs/common';
import { CurrentUser } from '../auth/decorators/current-user.decorator.js';
import type { AccessTokenPayload } from '../auth/auth.types.js';
import { ReportsService } from './reports.service.js';

function parseFilters(from?: string, to?: string, branchId?: string) {
  const now = new Date();
  const defaultFrom = new Date(now.getTime() - 30 * 24 * 60 * 60 * 1000);
  return {
    from: from ? new Date(from) : defaultFrom,
    to: to ? new Date(to) : now,
    branchId: branchId ?? null,
  };
}

@Controller('admin/reports')
export class ReportsController {
  constructor(@Inject(ReportsService) private readonly svc: ReportsService) {}

  @Get('overview')
  async overview(
    @CurrentUser() user: AccessTokenPayload,
    @Query('from') from?: string,
    @Query('to') to?: string,
    @Query('branchId') branchId?: string,
  ) {
    return {
      data: await this.svc.overviewWithComparison(
        user.tenantId,
        user.sub,
        user.role,
        parseFilters(from, to, branchId),
      ),
    };
  }

  @Get('emails')
  async emails(
    @CurrentUser() user: AccessTokenPayload,
    @Query('from') from?: string,
    @Query('to') to?: string,
    @Query('branchId') branchId?: string,
  ) {
    return {
      data: await this.svc.emailStats(
        user.tenantId,
        user.sub,
        user.role,
        parseFilters(from, to, branchId),
      ),
    };
  }

  @Get('bookings-per-day')
  async bookingsPerDay(
    @CurrentUser() user: AccessTokenPayload,
    @Query('from') from?: string,
    @Query('to') to?: string,
    @Query('branchId') branchId?: string,
  ) {
    return {
      data: await this.svc.bookingsPerDay(
        user.tenantId,
        user.sub,
        user.role,
        parseFilters(from, to, branchId),
      ),
    };
  }

  @Get('top-services')
  async topServices(
    @CurrentUser() user: AccessTokenPayload,
    @Query('from') from?: string,
    @Query('to') to?: string,
    @Query('branchId') branchId?: string,
  ) {
    return {
      data: await this.svc.topServices(
        user.tenantId,
        user.sub,
        user.role,
        parseFilters(from, to, branchId),
      ),
    };
  }

  @Get('top-employees')
  async topEmployees(
    @CurrentUser() user: AccessTokenPayload,
    @Query('from') from?: string,
    @Query('to') to?: string,
    @Query('branchId') branchId?: string,
  ) {
    return {
      data: await this.svc.topEmployees(
        user.tenantId,
        user.sub,
        user.role,
        parseFilters(from, to, branchId),
      ),
    };
  }

  @Get('top-customers')
  async topCustomers(
    @CurrentUser() user: AccessTokenPayload,
    @Query('from') from?: string,
    @Query('to') to?: string,
    @Query('branchId') branchId?: string,
  ) {
    return {
      data: await this.svc.topCustomers(
        user.tenantId,
        user.sub,
        user.role,
        parseFilters(from, to, branchId),
      ),
    };
  }

  @Get('credit-packs')
  async creditPacks(@CurrentUser() user: AccessTokenPayload) {
    return {
      data: await this.svc.creditPacksSummary(user.tenantId, user.sub, user.role),
    };
  }
}
