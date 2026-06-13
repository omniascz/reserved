import {
  Body,
  Controller,
  Delete,
  Get,
  Inject,
  Param,
  ParseUUIDPipe,
  Post,
  Query,
} from '@nestjs/common';
import { BadRequestException } from '@nestjs/common';
import { CurrentUser } from '../auth/decorators/current-user.decorator.js';
import type { AccessTokenPayload } from '../auth/auth.types.js';
import { ZodValidationPipe } from '../auth/zod-validation.pipe.js';
import { SetCommissionSchema, type SetCommissionDto } from './dto/payroll.dto.js';
import { PayrollService } from './payroll.service.js';

@Controller('admin/payroll')
export class PayrollController {
  constructor(@Inject(PayrollService) private readonly svc: PayrollService) {}

  @Get('commissions')
  async list(
    @CurrentUser() user: AccessTokenPayload,
    @Query('employeeId', ParseUUIDPipe) employeeId: string,
  ) {
    return { data: await this.svc.listCommissions(user.tenantId, user.sub, user.role, employeeId) };
  }

  @Post('employees/:employeeId/commissions')
  async set(
    @CurrentUser() user: AccessTokenPayload,
    @Param('employeeId', ParseUUIDPipe) employeeId: string,
    @Body(new ZodValidationPipe(SetCommissionSchema)) dto: SetCommissionDto,
  ) {
    return {
      data: await this.svc.setCommission(user.tenantId, user.sub, user.role, employeeId, dto),
    };
  }

  @Delete('commissions/:id')
  async remove(@CurrentUser() user: AccessTokenPayload, @Param('id', ParseUUIDPipe) id: string) {
    return { data: await this.svc.deleteCommission(user.tenantId, user.sub, user.role, id) };
  }

  @Get('report')
  async report(
    @CurrentUser() user: AccessTokenPayload,
    @Query('from') from: string,
    @Query('to') to: string,
    @Query('employeeId') employeeId?: string,
  ) {
    const fromDate = new Date(from);
    const toDate = new Date(to);
    if (Number.isNaN(fromDate.getTime()) || Number.isNaN(toDate.getTime())) {
      throw new BadRequestException({
        error: { code: 'INVALID_RANGE', message: 'from a to musí být platná ISO data.' },
      });
    }
    return {
      data: await this.svc.payoutReport(user.tenantId, user.sub, user.role, {
        from: fromDate,
        to: toDate,
        employeeId: employeeId || undefined,
      }),
    };
  }
}
