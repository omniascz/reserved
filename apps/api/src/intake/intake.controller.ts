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
} from '@nestjs/common';
import { CurrentUser } from '../auth/decorators/current-user.decorator.js';
import type { AccessTokenPayload } from '../auth/auth.types.js';
import { ZodValidationPipe } from '../auth/zod-validation.pipe.js';
import {
  CreateFormSchema,
  UpdateFormSchema,
  type CreateFormDto,
  type UpdateFormDto,
} from './dto/intake.dto.js';
import { IntakeService } from './intake.service.js';

// Sprint 10.10 — intake formuláře (admin).
@Controller('admin/intake-forms')
export class IntakeController {
  constructor(@Inject(IntakeService) private readonly svc: IntakeService) {}

  @Get()
  async list(@CurrentUser() user: AccessTokenPayload) {
    const data = await this.svc.listForms(user.tenantId, user.sub, user.role);
    return { data };
  }

  @Post()
  @HttpCode(201)
  async create(
    @CurrentUser() user: AccessTokenPayload,
    @Body(new ZodValidationPipe(CreateFormSchema)) dto: CreateFormDto,
  ) {
    const data = await this.svc.createForm(user.tenantId, user.sub, user.role, dto);
    return { data };
  }

  @Patch(':id')
  async update(
    @CurrentUser() user: AccessTokenPayload,
    @Param('id', ParseUUIDPipe) id: string,
    @Body(new ZodValidationPipe(UpdateFormSchema)) dto: UpdateFormDto,
  ) {
    const data = await this.svc.updateForm(user.tenantId, user.sub, user.role, id, dto);
    return { data };
  }

  @Delete(':id')
  @HttpCode(204)
  async remove(@CurrentUser() user: AccessTokenPayload, @Param('id', ParseUUIDPipe) id: string) {
    await this.svc.deleteForm(user.tenantId, user.sub, user.role, id);
  }

  @Get(':id/submissions')
  async submissions(
    @CurrentUser() user: AccessTokenPayload,
    @Param('id', ParseUUIDPipe) id: string,
  ) {
    const data = await this.svc.listSubmissions(user.tenantId, user.sub, user.role, id);
    return { data };
  }
}
