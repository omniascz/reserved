import { MiddlewareConsumer, Module, NestModule, RequestMethod } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { AuthModule } from './auth/auth.module.js';
import { AvailabilityModule } from './availability/availability.module.js';
import { BookingsModule } from './bookings/bookings.module.js';
import { CustomersModule } from './customers/customers.module.js';
import { DbModule } from './db/db.module.js';
import { EmailModule } from './email/email.module.js';
import { EmployeesModule } from './employees/employees.module.js';
import { HealthController } from './health/health.controller.js';
import { PublicModule } from './public/public.module.js';
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
    AvailabilityModule,
    EmailModule,
    CustomersModule,
    BookingsModule,
    PublicModule,
  ],
  controllers: [HealthController],
})
export class AppModule implements NestModule {
  configure(consumer: MiddlewareConsumer): void {
    // TenantMiddleware běží jen na customer-facing endpointech (login,
    // customer portal). Admin/platform mají tenant v JWT, public endpointy
    // si ho resolvují přímo ze slugu v URL.
    consumer
      .apply(TenantMiddleware)
      .exclude(
        { path: 'health', method: RequestMethod.ALL },
        { path: 'auth/register', method: RequestMethod.POST },
        { path: 'auth/refresh', method: RequestMethod.POST },
        { path: 'auth/logout', method: RequestMethod.POST },
        { path: 'admin/(.*)', method: RequestMethod.ALL },
        { path: 'platform/(.*)', method: RequestMethod.ALL },
        { path: 'public/(.*)', method: RequestMethod.ALL },
      )
      .forRoutes('*');
  }
}
