import { Module } from '@nestjs/common';
import { APP_GUARD, Reflector } from '@nestjs/core';
import { DbModule } from '../db/db.module.js';
import { AuthConfig } from './auth.config.js';
import { AuthController } from './auth.controller.js';
import { AuthService } from './auth.service.js';
import { JwtService } from './jwt.service.js';
import { JwtGuard } from './jwt.guard.js';

/**
 * Globální auth modul. JwtGuard je nasazen jako APP_GUARD = vyžaduje Bearer token
 * na všech endpointech, kromě těch s @Public(). To je K6 fix z review tixly:
 * "default deny" místo whitelist URL prefixů.
 */
@Module({
  imports: [DbModule],
  controllers: [AuthController],
  providers: [
    AuthConfig,
    JwtService,
    AuthService,
    {
      provide: APP_GUARD,
      useFactory: (jwt: JwtService, reflector: Reflector) => new JwtGuard(jwt, reflector),
      inject: [JwtService, Reflector],
    },
  ],
  exports: [AuthConfig, JwtService, AuthService],
})
export class AuthModule {}
