// GDPR endpointy — export a výmaz osobních údajů.
//
// CESTY: schválně `admin/gdpr/...`, ne `admin/customers/:id/...`. Dva důvody:
//   1. nekříží se s CustomersController,
//   2. na první pohled je poznat, že jde o citlivou operaci — v logu, v auditu
//      i v konfiguraci reverzní proxy se to dá odlišit jedním prefixem.
//
// Prefix `admin/*` je v app.module vyjmutý z TenantMiddleware — tenant se bere
// z přihlašovacího tokenu (`@CurrentUser`), takže na data cizího tenanta se
// nedá dosáhnout ani podvrženým slugem v URL.

import { Body, Controller, Get, Inject, Param, ParseUUIDPipe, Post } from '@nestjs/common';
import { CurrentUser } from '../auth/decorators/current-user.decorator.js';
import type { AccessTokenPayload } from '../auth/auth.types.js';
import { ZodValidationPipe } from '../auth/zod-validation.pipe.js';
import { GdprService } from './gdpr.service.js';
import { EraseRequestSchema, type EraseRequestDto } from './dto/gdpr.dto.js';

@Controller('admin/gdpr')
export class GdprController {
  constructor(@Inject(GdprService) private readonly svc: GdprService) {}

  /**
   * Kompletní export osobních údajů zákazníka ve strojově čitelném JSONu.
   * Odpovídá právu na přenositelnost údajů (čl. 20 GDPR).
   */
  @Get('customers/:id/export')
  async exportCustomer(
    @CurrentUser() user: AccessTokenPayload,
    @Param('id', ParseUUIDPipe) id: string,
  ) {
    const data = await this.svc.exportCustomer(user.tenantId, user.sub, user.role, id);
    return { data };
  }

  /**
   * Výmaz zákazníka — anonymizace, ne smazání řádků. Rezervace a platby drží
   * účetní a daňová evidence, takže záznam zůstává, osobní údaje z něj mizí.
   */
  @Post('customers/:id/erase')
  async eraseCustomer(
    @CurrentUser() user: AccessTokenPayload,
    @Param('id', ParseUUIDPipe) id: string,
    @Body(new ZodValidationPipe(EraseRequestSchema)) dto: EraseRequestDto,
  ) {
    const data = await this.svc.eraseCustomer(user.tenantId, user.sub, user.role, id, dto);
    return { data };
  }

  /** Export osobních údajů zaměstnance (a jeho přihlašovacího účtu, pokud ho má). */
  @Get('employees/:id/export')
  async exportEmployee(
    @CurrentUser() user: AccessTokenPayload,
    @Param('id', ParseUUIDPipe) id: string,
  ) {
    const data = await this.svc.exportEmployee(user.tenantId, user.sub, user.role, id);
    return { data };
  }

  /** Výmaz zaměstnance — anonymizace. Mzdové podklady (výplaty) zůstávají. */
  @Post('employees/:id/erase')
  async eraseEmployee(
    @CurrentUser() user: AccessTokenPayload,
    @Param('id', ParseUUIDPipe) id: string,
    @Body(new ZodValidationPipe(EraseRequestSchema)) dto: EraseRequestDto,
  ) {
    const data = await this.svc.eraseEmployee(user.tenantId, user.sub, user.role, id, dto);
    return { data };
  }
}
