// External API endpointy pro správu zákazníků.

import {
  Body,
  Controller,
  Get,
  HttpCode,
  Inject,
  Param,
  ParseUUIDPipe,
  Post,
  Query,
  Req,
  UseGuards,
} from '@nestjs/common';
import type { Request } from 'express';
import { z } from 'zod';
import { Public } from '../auth/decorators/public.decorator.js';
import { ZodValidationPipe } from '../auth/zod-validation.pipe.js';
import { CustomersService } from '../customers/customers.service.js';
import { DbService } from '../db/db.service.js';
import { serviceContext } from '@reserved/rls-multitenancy';
import { ApiKeyGuard, requireScope } from '../api-keys/api-key.guard.js';

const SYSTEM_USER = '00000000-0000-0000-0000-000000000000';

const CreateCustomerSchema = z.object({
  firstName: z.string().min(1).max(100),
  lastName: z.string().min(1).max(100),
  email: z.string().email().max(255),
  phone: z.string().max(32).optional(),
});
type CreateCustomerDto = z.infer<typeof CreateCustomerSchema>;

@Public()
@UseGuards(ApiKeyGuard)
@Controller('external/v1/customers')
export class ExternalCustomersController {
  constructor(
    @Inject(CustomersService) private readonly svc: CustomersService,
    @Inject(DbService) private readonly dbService: DbService,
  ) {}

  @Get()
  async list(@Req() req: Request, @Query('search') search?: string, @Query('tag') tag?: string) {
    requireScope(req.apiKey, 'customers:read');
    const data = await this.svc.list(req.apiKey!.tenantId, SYSTEM_USER, 'owner', {
      search,
      tag,
    });
    return { data };
  }

  @Get(':id')
  async get(@Req() req: Request, @Param('id', ParseUUIDPipe) id: string) {
    requireScope(req.apiKey, 'customers:read');
    const data = await this.svc.getDetail(req.apiKey!.tenantId, SYSTEM_USER, 'owner', id);
    return { data };
  }

  @Post()
  @HttpCode(201)
  async create(
    @Req() req: Request,
    @Body(new ZodValidationPipe(CreateCustomerSchema)) dto: CreateCustomerDto,
  ) {
    requireScope(req.apiKey, 'customers:write');
    const tenantId = req.apiKey!.tenantId;
    const result = await this.dbService.withRlsContext(serviceContext(tenantId), async (tx) => {
      return this.svc.findOrCreate(tx, tenantId, {
        firstName: dto.firstName,
        lastName: dto.lastName,
        email: dto.email,
        phone: dto.phone ?? null,
      });
    });
    return { data: result };
  }
}
