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
  AddMemberSchema,
  CreateCorporateAccountSchema,
  UpdateCorporateAccountSchema,
  UpdateMemberSchema,
  type AddMemberDto,
  type CreateCorporateAccountDto,
  type UpdateCorporateAccountDto,
  type UpdateMemberDto,
} from './dto/corporate-account.dto.js';
import { CorporateAccountsService } from './corporate-accounts.service.js';

@Controller('admin')
export class CorporateAccountsController {
  constructor(@Inject(CorporateAccountsService) private readonly svc: CorporateAccountsService) {}

  // ─── Firmy /admin/corporate-accounts ──────────────────────────────

  @Get('corporate-accounts')
  async list(@CurrentUser() user: AccessTokenPayload) {
    return { data: await this.svc.list(user.tenantId, user.sub, user.role) };
  }

  @Get('corporate-accounts/:id')
  async get(@CurrentUser() user: AccessTokenPayload, @Param('id', ParseUUIDPipe) id: string) {
    return { data: await this.svc.get(user.tenantId, user.sub, user.role, id) };
  }

  @Post('corporate-accounts')
  @HttpCode(201)
  async create(
    @CurrentUser() user: AccessTokenPayload,
    @Body(new ZodValidationPipe(CreateCorporateAccountSchema)) dto: CreateCorporateAccountDto,
  ) {
    return { data: await this.svc.create(user.tenantId, user.sub, user.role, dto) };
  }

  @Patch('corporate-accounts/:id')
  async update(
    @CurrentUser() user: AccessTokenPayload,
    @Param('id', ParseUUIDPipe) id: string,
    @Body(new ZodValidationPipe(UpdateCorporateAccountSchema)) dto: UpdateCorporateAccountDto,
  ) {
    return { data: await this.svc.update(user.tenantId, user.sub, user.role, id, dto) };
  }

  @Delete('corporate-accounts/:id')
  @HttpCode(204)
  async delete(@CurrentUser() user: AccessTokenPayload, @Param('id', ParseUUIDPipe) id: string) {
    await this.svc.delete(user.tenantId, user.sub, user.role, id);
  }

  // ─── Členové /admin/corporate-accounts/:id/members ────────────────

  @Get('corporate-accounts/:id/members')
  async listMembers(
    @CurrentUser() user: AccessTokenPayload,
    @Param('id', ParseUUIDPipe) id: string,
  ) {
    return { data: await this.svc.listMembers(user.tenantId, user.sub, user.role, id) };
  }

  @Post('corporate-accounts/:id/members')
  @HttpCode(201)
  async addMember(
    @CurrentUser() user: AccessTokenPayload,
    @Param('id', ParseUUIDPipe) id: string,
    @Body(new ZodValidationPipe(AddMemberSchema)) dto: AddMemberDto,
  ) {
    return { data: await this.svc.addMember(user.tenantId, user.sub, user.role, id, dto) };
  }

  @Patch('corporate-accounts/members/:memberId')
  async updateMember(
    @CurrentUser() user: AccessTokenPayload,
    @Param('memberId', ParseUUIDPipe) memberId: string,
    @Body(new ZodValidationPipe(UpdateMemberSchema)) dto: UpdateMemberDto,
  ) {
    return { data: await this.svc.updateMember(user.tenantId, user.sub, user.role, memberId, dto) };
  }

  @Delete('corporate-accounts/members/:memberId')
  @HttpCode(204)
  async removeMember(
    @CurrentUser() user: AccessTokenPayload,
    @Param('memberId', ParseUUIDPipe) memberId: string,
  ) {
    await this.svc.removeMember(user.tenantId, user.sub, user.role, memberId);
  }

  // ─── Reverse: do kterych firem patri customer ────────────────────

  @Get('customers/:customerId/corporate-accounts')
  async listForCustomer(
    @CurrentUser() user: AccessTokenPayload,
    @Param('customerId', ParseUUIDPipe) customerId: string,
  ) {
    return {
      data: await this.svc.listForCustomer(user.tenantId, user.sub, user.role, customerId),
    };
  }
}
