import { Body, Controller, HttpCode, Inject, NotFoundException, Post, Req } from '@nestjs/common';
import type { Request } from 'express';
import { AuthService } from './auth.service.js';
import { Public } from './decorators/public.decorator.js';
import { LoginSchema, type LoginDto } from './dto/login.dto.js';
import { RefreshSchema, type RefreshDto } from './dto/refresh.dto.js';
import { RegisterSchema, type RegisterDto } from './dto/register.dto.js';
import { ZodValidationPipe } from './zod-validation.pipe.js';

@Controller('auth')
export class AuthController {
  constructor(@Inject(AuthService) private readonly auth: AuthService) {}

  /**
   * POST /api/v1/auth/register
   * Vytvoří nový tenant + první owner uživatele.
   * Vrací token pair pro okamžité přihlášení.
   */
  @Public()
  @Post('register')
  @HttpCode(201)
  async register(@Body(new ZodValidationPipe(RegisterSchema)) dto: RegisterDto): Promise<{
    tenantId: string;
    userId: string;
    tokens: {
      accessToken: string;
      refreshToken: string;
      expiresIn: number;
    };
  }> {
    return this.auth.register(dto);
  }

  /**
   * POST /api/v1/auth/login
   * Vyžaduje resolved tenant (přes TenantMiddleware: subdomena / custom domain
   * / X-Tenant-ID header). Vrací token pair.
   */
  @Public()
  @Post('login')
  @HttpCode(200)
  async login(
    @Req() req: Request,
    @Body(new ZodValidationPipe(LoginSchema)) dto: LoginDto,
  ): Promise<{
    accessToken: string;
    refreshToken: string;
    expiresIn: number;
  }> {
    if (!req.tenant) {
      throw new NotFoundException({
        error: {
          code: 'TENANT_NOT_FOUND',
          message: 'Tenant context required (subdomain, custom domain, or X-Tenant-ID header).',
        },
      });
    }
    return this.auth.login(req.tenant.id, dto);
  }

  /**
   * POST /api/v1/auth/refresh
   * Rotace refresh tokenu. Vrací nový pár.
   */
  @Public()
  @Post('refresh')
  @HttpCode(200)
  async refresh(@Body(new ZodValidationPipe(RefreshSchema)) dto: RefreshDto): Promise<{
    accessToken: string;
    refreshToken: string;
    expiresIn: number;
  }> {
    return this.auth.refresh(dto.refreshToken);
  }

  /**
   * POST /api/v1/auth/logout
   * Idempotentní — neplatný token vrátí 204 stejně jako platný.
   */
  @Public()
  @Post('logout')
  @HttpCode(204)
  async logout(@Body(new ZodValidationPipe(RefreshSchema)) dto: RefreshDto): Promise<void> {
    await this.auth.logout(dto.refreshToken);
  }
}
