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
import { Throttle } from '@nestjs/throttler';
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

/**
 * Přísnější limit na citlivé cesty: 20 pokusů / minutu na IP a cestu zvlášť
 * (přepisuje výchozích 300/min). Bez něj šlo hádat hesla úplně bez omezení —
 * ThrottlerModule byl nakonfigurovaný, ale nikde se nevynucoval.
 *
 * PROČ 20, a ne 5: limit dopadá na VŠECHNA přihlášení, ne jen na neúspěšná.
 * Odlišit je nejde — throttler zvyšuje počítadlo v `canActivate`, tedy PŘED
 * spuštěním handleru, kdy ještě není znám výsledek. Pět pokusů za minutu by
 * proto trestalo i legitimní provoz: přihlášení na počítači, pak na mobilu,
 * zavřená karta, návrat. Proti hádání hesla 20/min pořád funguje — útočník
 * potřebuje tisíce pokusů, ne dvacet.
 *
 * Rate limit je PRVNÍ vrstva, ne poslední: brání rychlému hádání z jedné
 * adresy, ale útočník s více adresami ho obejde. Druhou vrstvou je zamykání
 * účtu po N neúspěšných pokusech — `AccountLockoutService`, evidence v tabulce
 * `login_attempts`. Zámek se váže na ÚČET (tenant + e-mail), takže změna IP
 * ho neobejde.
 *
 * Dává se na KONKRÉTNÍ metody, ne na celý controller. Kdyby visel na
 * controlleru, dopadl by i na `refresh`, `logout` a `verify-email/status` —
 * a ty legitimní uživatel volá běžně a opakovaně: obnovu tokenu na pozadí,
 * víc otevřených karet, stavový dotaz žlutého pruhu při každém překliku
 * v adminu. Limit by jim rozbil normální provoz, aniž by cokoli chránil
 * (obnova vyžaduje platný refresh token, hádat se u ní nedá nic).
 */
const CITLIVY_LIMIT = { short: { limit: 20, ttl: 60_000 } };

/**
 * Registrace má MÍRNĚJŠÍ limit než přihlášení (20/min místo 5/min) — záměrně.
 *
 * U přihlášení jde o hádání hesla, tam je přísnost jádrem ochrany. Registrací
 * ale útočník nic neprolomí, jen si založí účty; limit tam brání zahlcení, ne
 * průniku. A 5/min by vadilo i legitimnímu provozu: z jedné firemní adresy
 * (sdílené připojení, coworking, mobilní síť) se může registrovat víc lidí po
 * sobě a šestý by narazil. Klíčuje se podle IP + cesty, takže registrace
 * nevyčerpá limit přihlášení a naopak.
 */
const REGISTRACE_LIMIT = { short: { limit: 20, ttl: 60_000 } };

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
  @Throttle(REGISTRACE_LIMIT)
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
  @Throttle(CITLIVY_LIMIT)
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
    // IP a prohlížeč jdou do evidence pokusů — slouží jen auditu. Zámek se
    // podle nich NEŘÍDÍ, jinak by ho stačilo obejít přepnutím sítě.
    return this.auth.login(req.tenant.id, dto, {
      ip: req.ip,
      userAgent: req.headers['user-agent'],
    });
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
  @Throttle(CITLIVY_LIMIT)
  @Post('verify-email/resend')
  @HttpCode(200)
  async resendVerifyEmail(@CurrentUser() user: AccessTokenPayload) {
    const data = await this.verification.resend(user.tenantId, user.sub);
    return { data };
  }
}
