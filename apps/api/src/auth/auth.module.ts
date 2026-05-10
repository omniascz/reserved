import { Module } from '@nestjs/common';
import { APP_GUARD } from '@nestjs/core';
import { AuthConfig } from './auth.config.js';
import { JwtService } from './jwt.service.js';
import { JwtGuard } from './jwt.guard.js';

/**
 * Globální auth modul. JwtGuard je nasazen jako APP_GUARD = vyžaduje Bearer token
 * na všech endpointech, kromě těch s @Public(). To je K6 fix z review tixly:
 * "default deny" místo whitelist URL prefixů.
 */
@Module({
  providers: [
    AuthConfig,
    JwtService,
    {
      provide: APP_GUARD,
      useClass: JwtGuard,
    },
  ],
  exports: [AuthConfig, JwtService],
})
export class AuthModule {}
