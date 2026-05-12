import {
  Body,
  Controller,
  Get,
  HttpCode,
  Inject,
  NotFoundException,
  Post,
  Query,
  Req,
  UseGuards,
} from '@nestjs/common';
import type { Request } from 'express';
import { PortalAuthService } from './portal-auth.service.js';
import { PortalGuard } from './portal.guard.js';
import { Public } from '../auth/decorators/public.decorator.js';
import { ZodValidationPipe } from '../auth/zod-validation.pipe.js';
import {
  PortalLoginSchema,
  RefreshTokenSchema,
  RequestMagicLinkSchema,
  SetPasswordSchema,
  type PortalLoginDto,
  type RefreshTokenDto,
  type RequestMagicLinkDto,
  type SetPasswordDto,
  type VerifyMagicLinkDto,
} from './dto/portal-auth.dto.js';

@Controller('portal/auth')
export class PortalAuthController {
  constructor(@Inject(PortalAuthService) private readonly auth: PortalAuthService) {}

  /**
   * POST /api/v1/portal/auth/magic-link
   * Pošle e-mail s odkazem. Vyžaduje resolved tenant.
   */
  @Public()
  @Post('magic-link')
  @HttpCode(200)
  async requestMagicLink(
    @Req() req: Request,
    @Body(new ZodValidationPipe(RequestMagicLinkSchema)) dto: RequestMagicLinkDto,
  ): Promise<{ sent: true }> {
    if (!req.tenant) {
      throw new NotFoundException({
        error: { code: 'TENANT_NOT_FOUND', message: 'Tenant context required.' },
      });
    }
    const portalBaseUrl = process.env.PORTAL_BASE_URL ?? `http://localhost:3005/${req.tenant.slug}`;
    return this.auth.requestMagicLink(req.tenant.id, dto, {
      ip: req.ip,
      ua: req.headers['user-agent'],
      portalBaseUrl,
    });
  }

  /**
   * GET /api/v1/portal/auth/verify?token=...
   * Konzumuje magic-link token, vydá JWT pár.
   */
  @Public()
  @Get('verify')
  async verify(
    @Req() req: Request,
    @Query('token') token: string,
  ): Promise<{ accessToken: string; refreshToken: string; expiresIn: number }> {
    if (!req.tenant) {
      throw new NotFoundException({
        error: { code: 'TENANT_NOT_FOUND', message: 'Tenant context required.' },
      });
    }
    // Validate token format
    const dto: VerifyMagicLinkDto = { token };
    if (!token || token.length < 32) {
      throw new NotFoundException({
        error: { code: 'TOKEN_INVALID', message: 'Odkaz je neplatný.' },
      });
    }
    return this.auth.verifyMagicLink(req.tenant.id, dto.token);
  }

  /**
   * POST /api/v1/portal/auth/login
   * Email + heslo login (pokud zákazník nastavil heslo).
   */
  @Public()
  @Post('login')
  @HttpCode(200)
  async login(
    @Req() req: Request,
    @Body(new ZodValidationPipe(PortalLoginSchema)) dto: PortalLoginDto,
  ): Promise<{ accessToken: string; refreshToken: string; expiresIn: number }> {
    if (!req.tenant) {
      throw new NotFoundException({
        error: { code: 'TENANT_NOT_FOUND', message: 'Tenant context required.' },
      });
    }
    return this.auth.login(req.tenant.id, dto);
  }

  /**
   * POST /api/v1/portal/auth/refresh
   */
  @Public()
  @Post('refresh')
  @HttpCode(200)
  async refresh(
    @Body(new ZodValidationPipe(RefreshTokenSchema)) dto: RefreshTokenDto,
  ): Promise<{ accessToken: string; refreshToken: string; expiresIn: number }> {
    return this.auth.refresh(dto.refreshToken);
  }

  /**
   * POST /api/v1/portal/auth/logout
   */
  @Public()
  @Post('logout')
  @HttpCode(204)
  async logout(
    @Body(new ZodValidationPipe(RefreshTokenSchema)) dto: RefreshTokenDto,
  ): Promise<void> {
    await this.auth.logout(dto.refreshToken);
  }

  /**
   * POST /api/v1/portal/auth/set-password
   * Authorized — vyžaduje portal access token.
   */
  @Public() // opt-out z globálního admin JwtGuardu
  @UseGuards(PortalGuard)
  @Post('set-password')
  @HttpCode(204)
  async setPassword(
    @Req() req: Request,
    @Body(new ZodValidationPipe(SetPasswordSchema)) dto: SetPasswordDto,
  ): Promise<void> {
    if (!req.portalAuth) {
      throw new NotFoundException({
        error: { code: 'AUTH_REQUIRED', message: 'Přihlášení vyžadováno.' },
      });
    }
    await this.auth.setPassword(req.portalAuth.tenantId, req.portalAuth.sub, dto);
  }
}
