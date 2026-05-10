import { MiddlewareConsumer, Module, NestModule, RequestMethod } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { AuthModule } from './auth/auth.module.js';
import { DbModule } from './db/db.module.js';
import { EmployeesModule } from './employees/employees.module.js';
import { HealthController } from './health/health.controller.js';
import { ServicesModule } from './services/services.module.js';
import { TenantModule } from './tenant/tenant.module.js';
import { TenantMiddleware } from './tenant/tenant.middleware.js';

@Module({
  imports: [
    ConfigModule.forRoot({
      isGlobal: true,
      envFilePath: ['.env.local', '.env'],
    }),
    DbModule,
    TenantModule,
    AuthModule,
    ServicesModule,
    EmployeesModule,
  ],
  controllers: [HealthController],
})
export class AppModule implements NestModule {
  configure(consumer: MiddlewareConsumer): void {
    // TenantMiddleware běží na všech endpointech KROMĚ:
    //   - /api/v1/health   — bez tenant kontextu (monitoring)
    //   - /api/v1/auth/register — vytváří NOVÝ tenant, nemá ho v hostname
    //   - /api/v1/auth/refresh, /logout — sub-claim z refresh tokenu nese
    //                                     userId; tenant resolution by selhal
    //                                     na localhost dev bez X-Tenant-ID
    // TenantMiddleware běží jen na public/customer endpointech (login, widget,
    // customer portal). Admin a platform endpointy mají tenant v JWT claimu
    // a tenant resolution z URL je tam zbytečná (na localhost dev navíc selže).
    consumer
      .apply(TenantMiddleware)
      .exclude(
        { path: 'health', method: RequestMethod.ALL },
        { path: 'auth/register', method: RequestMethod.POST },
        { path: 'auth/refresh', method: RequestMethod.POST },
        { path: 'auth/logout', method: RequestMethod.POST },
        { path: 'admin/(.*)', method: RequestMethod.ALL },
        { path: 'platform/(.*)', method: RequestMethod.ALL },
      )
      .forRoutes('*');
  }
}
