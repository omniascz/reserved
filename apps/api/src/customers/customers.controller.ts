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
  Query,
} from '@nestjs/common';
import { CurrentUser } from '../auth/decorators/current-user.decorator.js';
import type { AccessTokenPayload } from '../auth/auth.types.js';
import { ZodValidationPipe } from '../auth/zod-validation.pipe.js';
import { CustomersService } from './customers.service.js';
import {
  CreateCustomerNoteSchema,
  CreateCustomerTagSchema,
  UpdateCustomerSchema,
  type CreateCustomerNoteDto,
  type CreateCustomerTagDto,
  type UpdateCustomerDto,
} from './dto/customer.dto.js';

@Controller('admin/customers')
export class CustomersController {
  constructor(@Inject(CustomersService) private readonly svc: CustomersService) {}

  @Get()
  async list(
    @CurrentUser() user: AccessTokenPayload,
    @Query('search') search?: string,
    @Query('tag') tag?: string,
  ) {
    const data = await this.svc.list(user.tenantId, user.sub, user.role, {
      search,
      tag,
    });
    return { data };
  }

  @Get('tags')
  async listTags(@CurrentUser() user: AccessTokenPayload) {
    const data = await this.svc.listTagsInTenant(user.tenantId, user.sub, user.role);
    return { data };
  }

  @Get(':id')
  async getDetail(@CurrentUser() user: AccessTokenPayload, @Param('id', ParseUUIDPipe) id: string) {
    const data = await this.svc.getDetail(user.tenantId, user.sub, user.role, id);
    return { data };
  }

  @Patch(':id')
  async update(
    @CurrentUser() user: AccessTokenPayload,
    @Param('id', ParseUUIDPipe) id: string,
    @Body(new ZodValidationPipe(UpdateCustomerSchema)) dto: UpdateCustomerDto,
  ) {
    const data = await this.svc.update(user.tenantId, user.sub, user.role, id, dto);
    return { data };
  }

  @Post(':id/tags')
  @HttpCode(201)
  async addTag(
    @CurrentUser() user: AccessTokenPayload,
    @Param('id', ParseUUIDPipe) id: string,
    @Body(new ZodValidationPipe(CreateCustomerTagSchema)) dto: CreateCustomerTagDto,
  ) {
    const data = await this.svc.addTag(user.tenantId, user.sub, user.role, id, dto);
    return { data };
  }

  @Delete(':id/tags/:tag')
  @HttpCode(204)
  async removeTag(
    @CurrentUser() user: AccessTokenPayload,
    @Param('id', ParseUUIDPipe) id: string,
    @Param('tag') tag: string,
  ) {
    await this.svc.removeTag(user.tenantId, user.sub, user.role, id, tag);
  }

  @Post(':id/notes')
  @HttpCode(201)
  async addNote(
    @CurrentUser() user: AccessTokenPayload,
    @Param('id', ParseUUIDPipe) id: string,
    @Body(new ZodValidationPipe(CreateCustomerNoteSchema)) dto: CreateCustomerNoteDto,
  ) {
    const data = await this.svc.addNote(user.tenantId, user.sub, user.role, id, dto);
    return { data };
  }

  @Delete(':id/notes/:noteId')
  @HttpCode(204)
  async deleteNote(
    @CurrentUser() user: AccessTokenPayload,
    @Param('id', ParseUUIDPipe) id: string,
    @Param('noteId', ParseUUIDPipe) noteId: string,
  ) {
    await this.svc.deleteNote(user.tenantId, user.sub, user.role, id, noteId);
  }
}
