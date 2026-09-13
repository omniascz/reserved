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
} from '@nestjs/common';
import type { Request } from 'express';
import { AuthService } from './auth.service.js';
import { EmailVerificationService } from './email-verification.service.js';
import { CurrentUser } from './decorators/current-user.decorator.js';
import type { AccessTokenPayload } from './auth.types.js';
import { Public } from './decorators/public.decorator.js';
import { LoginSchema, type LoginDto } from './dto/login.dto.js';
import { RefreshSchema, type RefreshDto } from './dto/refresh.dto.js';
import { RegisterSchema, type RegisterDto } from './dto/register.dto.js';
import { VerifyEmailQuerySchema } from './dto/email-verification.dto.js';
import { ZodValidationPipe } from './zod-validation.pipe.js';

@Controller('auth')
export class AuthController {
  constructor(
    @Inject(AuthService) private readonly auth: AuthService,
    @Inject(EmailVerificationService) private readonly verification: EmailVerificationService,
  ) {}

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

  // ─── Ověření e-mailu administrátora ──────────────────────────────────
  // Odkaz z e-mailu se otevírá NEPŘIHLÁŠENĚ a bez slugu tenanta, proto @Public().
  // Token je 32 náhodných bajtů, takže sám o sobě je dostatečnou autorizací.

  /** GET /api/v1/auth/verify-email?token=… — potvrdí adresu. Token jednorázový. */
  @Public()
  @Get('verify-email')
  @HttpCode(200)
  async verifyEmail(
    @Query(new ZodValidationPipe(VerifyEmailQuerySchema)) query: { token: string },
  ): Promise<{ data: { email: string; alreadyVerified: boolean } }> {
    const data = await this.verification.verifyByToken(query.token);
    return { data };
  }

  /** GET /api/v1/auth/verify-email/status — podklad pro žlutý pruh v adminu. */
  @Get('verify-email/status')
  @HttpCode(200)
  async verifyEmailStatus(@CurrentUser() user: AccessTokenPayload) {
    const data = await this.verification.status(user.tenantId, user.sub);
    return { data };
  }

  /** POST /api/v1/auth/verify-email/resend — pošle odkaz znovu (s odstupem). */
  @Post('verify-email/resend')
  @HttpCode(200)
  async resendVerifyEmail(@CurrentUser() user: AccessTokenPayload) {
    const data = await this.verification.resend(user.tenantId, user.sub);
    return { data };
  }
}
