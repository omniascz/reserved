import {
  Body,
  Controller,
  Delete,
  Get,
  HttpCode,
  Inject,
  Param,
  ParseUUIDPipe,
  Patch,
  Post,
  Put,
} from '@nestjs/common';
import { CurrentUser } from '../auth/decorators/current-user.decorator.js';
import type { AccessTokenPayload } from '../auth/auth.types.js';
import { ZodValidationPipe } from '../auth/zod-validation.pipe.js';
import {
  CreateEmployeeSchema,
  SetWorkingHoursSchema,
  UpdateEmployeeSchema,
  type CreateEmployeeDto,
  type SetWorkingHoursDto,
  type UpdateEmployeeDto,
} from './dto/employee.dto.js';
import { EmployeesService } from './employees.service.js';

@Controller('admin/employees')
export class EmployeesController {
  constructor(@Inject(EmployeesService) private readonly svc: EmployeesService) {}

  @Get()
  async list(@CurrentUser() user: AccessTokenPayload) {
    const data = await this.svc.list(user.tenantId, user.sub, user.role);
    return { data };
  }

  @Get(':id')
  async get(@CurrentUser() user: AccessTokenPayload, @Param('id', ParseUUIDPipe) id: string) {
    const data = await this.svc.get(user.tenantId, user.sub, user.role, id);
    return { data };
  }

  @Post()
  @HttpCode(201)
  async create(
    @CurrentUser() user: AccessTokenPayload,
    @Body(new ZodValidationPipe(CreateEmployeeSchema)) dto: CreateEmployeeDto,
  ) {
    const data = await this.svc.create(user.tenantId, user.sub, user.role, dto);
    return { data };
  }

  @Patch(':id')
  async update(
    @CurrentUser() user: AccessTokenPayload,
    @Param('id', ParseUUIDPipe) id: string,
    @Body(new ZodValidationPipe(UpdateEmployeeSchema)) dto: UpdateEmployeeDto,
  ) {
    const data = await this.svc.update(user.tenantId, user.sub, user.role, id, dto);
    return { data };
  }

  @Delete(':id')
  @HttpCode(204)
  async deactivate(
    @CurrentUser() user: AccessTokenPayload,
    @Param('id', ParseUUIDPipe) id: string,
  ) {
    await this.svc.deactivate(user.tenantId, user.sub, user.role, id);
  }

  @Get(':id/schedule')
  async getSchedule(
    @CurrentUser() user: AccessTokenPayload,
    @Param('id', ParseUUIDPipe) id: string,
  ) {
    const data = await this.svc.getSchedule(user.tenantId, user.sub, user.role, id);
    return { data };
  }

  @Put(':id/schedule')
  async setSchedule(
    @CurrentUser() user: AccessTokenPayload,
    @Param('id', ParseUUIDPipe) id: string,
    @Body(new ZodValidationPipe(SetWorkingHoursSchema)) dto: SetWorkingHoursDto,
  ) {
    const data = await this.svc.setSchedule(user.tenantId, user.sub, user.role, id, dto);
    return { data };
  }
}
