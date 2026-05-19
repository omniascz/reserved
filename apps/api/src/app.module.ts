import { MiddlewareConsumer, Module, NestModule, RequestMethod } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { AuthModule } from './auth/auth.module.js';
import { AvailabilityModule } from './availability/availability.module.js';
import { BlocksModule } from './blocks/blocks.module.js';
import { BookingsModule } from './bookings/bookings.module.js';
import { BranchesModule } from './branches/branches.module.js';
import { BundlePacksModule } from './bundle-packs/bundle-packs.module.js';
import { CorporateAccountsModule } from './corporate-accounts/corporate-accounts.module.js';
import { CreditPacksModule } from './credit-packs/credit-packs.module.js';
import { FeatureFlagsModule } from './feature-flags/feature-flags.module.js';
import { GoogleCalendarModule } from './google-calendar/google-calendar.module.js';
import { SubscriptionsModule } from './subscriptions/subscriptions.module.js';
import { TimePacksModule } from './time-packs/time-packs.module.js';
import { CustomersModule } from './customers/customers.module.js';
import { DbModule } from './db/db.module.js';
import { EmailModule } from './email/email.module.js';
import { EmployeesModule } from './employees/employees.module.js';
import { HealthController } from './health/health.controller.js';
import { HolidaysModule } from './holidays/holidays.module.js';
import { PaymentsModule } from './payments/payments.module.js';
import { PortalModule } from './portal/portal.module.js';
import { PublicModule } from './public/public.module.js';
import { ReportsModule } from './reports/reports.module.js';
import { RulesModule } from './rules/rules.module.js';
import { ServicesModule } from './services/services.module.js';
import { SettingsModule } from './settings/settings.module.js';
import { TenantModule } from './tenant/tenant.module.js';
import { WebhooksModule } from './webhooks/webhooks.module.js';
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
    FeatureFlagsModule,
    WebhooksModule,
    SettingsModule,
    BranchesModule,
    ServicesModule,
    EmployeesModule,
    AvailabilityModule,
    EmailModule,
    CustomersModule,
    BookingsModule,
    CreditPacksModule,
    BundlePacksModule,
    TimePacksModule,
    CorporateAccountsModule,
    SubscriptionsModule,
    GoogleCalendarModule,
    PaymentsModule,
    BlocksModule,
    HolidaysModule,
    PortalModule,
    PublicModule,
    ReportsModule,
    RulesModule,
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
        // Portal: tenant se resolvuje X-Tenant-ID hlavickou (klient ji posila
        // na vsechny portal requesty), takze tenant middleware na portal/*
        // bezi. Refresh/logout nepotrebuji tenant kontext.
        { path: 'portal/auth/refresh', method: RequestMethod.POST },
        { path: 'portal/auth/logout', method: RequestMethod.POST },
        { path: 'payments/webhooks/(.*)', method: RequestMethod.ALL },
      )
      .forRoutes('*');
  }
}
