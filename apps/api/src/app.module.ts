import { MiddlewareConsumer, Module, NestModule, RequestMethod } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { AuthModule } from './auth/auth.module.js';
import { AvailabilityModule } from './availability/availability.module.js';
import { BlocksModule } from './blocks/blocks.module.js';
import { BookingsModule } from './bookings/bookings.module.js';
import { BranchesModule } from './branches/branches.module.js';
import { CustomersModule } from './customers/customers.module.js';
import { DbModule } from './db/db.module.js';
import { EmailModule } from './email/email.module.js';
import { EmployeesModule } from './employees/employees.module.js';
import { HealthController } from './health/health.controller.js';
import { HolidaysModule } from './holidays/holidays.module.js';
import { PortalModule } from './portal/portal.module.js';
import { PublicModule } from './public/public.module.js';
import { ServicesModule } from './services/services.module.js';
import { SettingsModule } from './settings/settings.module.js';
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
    SettingsModule,
    BranchesModule,
    ServicesModule,
    EmployeesModule,
    AvailabilityModule,
    EmailModule,
    CustomersModule,
    BookingsModule,
    BlocksModule,
    HolidaysModule,
    PortalModule,
    PublicModule,
  ],
  controllers: [HealthController],
})
export class AppModule implements NestModule {
  configure(consumer: MiddlewareConsumer): void {
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
