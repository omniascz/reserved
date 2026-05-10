import { Module } from '@nestjs/common';
import { APP_GUARD, Reflector } from '@nestjs/core';
import { AuthConfig } from './auth.config.js';
import { JwtService } from './jwt.service.js';
import { JwtGuard } from './jwt.guard.js';

/**
 * Globální auth modul. JwtGuard je nasazen jako APP_GUARD = vyžaduje Bearer token
 * na všech endpointech, kromě těch s @Public(). To je K6 fix z review tixly:
 * "default deny" místo whitelist URL prefixů.
 *
 * Pozor: APP_GUARD pomocí useClass někdy neumí vyřešit Reflector jako konstruktor
 * dependency — v některých verzích Nestu se Reflector instancuje až po fázi
 * APP_GUARD providers. Proto explicit useFactory s injection.
 */
@Module({
  providers: [
    AuthConfig,
    JwtService,
    {
      provide: APP_GUARD,
      useFactory: (jwt: JwtService, reflector: Reflector) => new JwtGuard(jwt, reflector),
      inject: [JwtService, Reflector],
    },
  ],
  exports: [AuthConfig, JwtService],
})
export class AuthModule {}
