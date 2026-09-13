import { Module } from '@nestjs/common';
import { APP_GUARD, Reflector } from '@nestjs/core';
import { DbModule } from '../db/db.module.js';
import { EmailModule } from '../email/email.module.js';
import { AuthConfig } from './auth.config.js';
import { AuthController } from './auth.controller.js';
import { AuthService } from './auth.service.js';
import { EmailVerificationService } from './email-verification.service.js';
import { JwtService } from './jwt.service.js';
import { JwtGuard } from './jwt.guard.js';

/**
 * Globální auth modul. JwtGuard je nasazen jako APP_GUARD = vyžaduje Bearer token
 * na všech endpointech, kromě těch s @Public(). To je K6 fix z review tixly:
 * "default deny" místo whitelist URL prefixů.
 */
@Module({
  // EmailModule kvůli ověřovacímu e-mailu po registraci — dosud registrace
  // neposílala vůbec nic.
  imports: [DbModule, EmailModule],
  controllers: [AuthController],
  providers: [
    AuthConfig,
    JwtService,
    AuthService,
    EmailVerificationService,
    {
      provide: APP_GUARD,
      useFactory: (jwt: JwtService, reflector: Reflector) => new JwtGuard(jwt, reflector),
      inject: [JwtService, Reflector],
    },
  ],
  // EmailVerificationService se exportuje: blokace veřejných rezervací
  // (public modul) i odchozí pošty (marketing, vouchers) se ptá právě jí.
  exports: [AuthConfig, JwtService, AuthService, EmailVerificationService],
})
export class AuthModule {}
