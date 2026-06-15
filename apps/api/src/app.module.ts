import { MiddlewareConsumer, Module, NestModule, RequestMethod } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { ThrottlerModule } from '@nestjs/throttler';
import { ApiKeysModule } from './api-keys/api-keys.module.js';
import { AuthModule } from './auth/auth.module.js';
import { AvailabilityModule } from './availability/availability.module.js';
import { BlocksModule } from './blocks/blocks.module.js';
import { BookingsModule } from './bookings/bookings.module.js';
import { BranchesModule } from './branches/branches.module.js';
import { BundlePacksModule } from './bundle-packs/bundle-packs.module.js';
import { CatalogModule } from './catalog/catalog.module.js';
import { ClassSessionsModule } from './class-sessions/class-sessions.module.js';
import { CorporateAccountsModule } from './corporate-accounts/corporate-accounts.module.js';
import { CreditPacksModule } from './credit-packs/credit-packs.module.js';
import { CustomDomainsModule } from './custom-domains/custom-domains.module.js';
import { FeatureFlagsModule } from './feature-flags/feature-flags.module.js';
import { GoogleCalendarModule } from './google-calendar/google-calendar.module.js';
import { SubscriptionsModule } from './subscriptions/subscriptions.module.js';
import { TimePacksModule } from './time-packs/time-packs.module.js';
import { CustomersModule } from './customers/customers.module.js';
import { DbModule } from './db/db.module.js';
import { EmailModule } from './email/email.module.js';
import { EmployeesModule } from './employees/employees.module.js';
import { ExternalModule } from './external/external.module.js';
import { HealthModule } from './health/health.module.js';
import { HolidaysModule } from './holidays/holidays.module.js';
import { IntakeModule } from './intake/intake.module.js';
import { LoyaltyModule } from './loyalty/loyalty.module.js';
import { MarketingModule } from './marketing/marketing.module.js';
import { OnboardingModule } from './onboarding/onboarding.module.js';
import { PaymentsModule } from './payments/payments.module.js';
import { PlatformBillingModule } from './platform-billing/platform-billing.module.js';
import { PlatformModule } from './platform/platform.module.js';
import { PortalModule } from './portal/portal.module.js';
import { PublicModule } from './public/public.module.js';
import { ReportsModule } from './reports/reports.module.js';
import { ResourcesModule } from './resources/resources.module.js';
import { ReviewsModule } from './reviews/reviews.module.js';
import { RulesModule } from './rules/rules.module.js';
import { ChainedBookingsModule } from './chained-bookings/chained-bookings.module.js';
import { ContentModule } from './content/content.module.js';
import { CoursesModule } from './courses/courses.module.js';
import { DepositsModule } from './deposits/deposits.module.js';
import { AccessModule } from './access/access.module.js';
import { ReferralsModule } from './referrals/referrals.module.js';
import { ChallengesModule } from './challenges/challenges.module.js';
import { MakeupModule } from './makeup/makeup.module.js';
import { AdmissionsModule } from './admissions/admissions.module.js';
import { OrdersModule } from './orders/orders.module.js';
import { DispatchModule } from './dispatch/dispatch.module.js';
import { PayrollModule } from './payroll/payroll.module.js';
import { PosModule } from './pos/pos.module.js';
import { SeriesModule } from './series/series.module.js';
import { ServicesModule } from './services/services.module.js';
import { StaysModule } from './stays/stays.module.js';
import { SettingsModule } from './settings/settings.module.js';
import { SmartModule } from './smart/smart.module.js';
import { IcalModule } from './ical/ical.module.js';
import { TenantModule } from './tenant/tenant.module.js';
import { TenantSiteModule } from './tenant-site/tenant-site.module.js';
import { ThemeModule } from './theme/theme.module.js';
import { VouchersModule } from './vouchers/vouchers.module.js';
import { VerticalPresetsModule } from './vertical-presets/vertical-presets.module.js';
import { UploadsModule } from './uploads/uploads.module.js';
import { WebhooksModule } from './webhooks/webhooks.module.js';
import { TenantMiddleware } from './tenant/tenant.middleware.js';

@Module({
  imports: [
    ConfigModule.forRoot({
      isGlobal: true,
      envFilePath: ['.env.local', '.env'],
    }),
    // Rate limit: 2 hladiny — krátký burst (60/min) + denní strop (5000/h).
    // Default in-memory storage; pro multi-instance produkci pridat Redis.
    ThrottlerModule.forRoot([
      { name: 'short', ttl: 60_000, limit: 60 },
      { name: 'long', ttl: 3600_000, limit: 5000 },
    ]),
    DbModule,
    HealthModule,
    TenantModule,
    AuthModule,
    ApiKeysModule,
    ExternalModule,
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
    ClassSessionsModule,
    CreditPacksModule,
    BundlePacksModule,
    CatalogModule,
    TimePacksModule,
    CorporateAccountsModule,
    CustomDomainsModule,
    SubscriptionsModule,
    GoogleCalendarModule,
    PaymentsModule,
    BlocksModule,
    HolidaysModule,
    IntakeModule,
    LoyaltyModule,
    MarketingModule,
    OnboardingModule,
    PlatformModule,
    PlatformBillingModule,
    PortalModule,
    PublicModule,
    ReportsModule,
    ResourcesModule,
    ReviewsModule,
    RulesModule,
    TenantSiteModule,
    ThemeModule,
    UploadsModule,
    VouchersModule,
    VerticalPresetsModule,
    SmartModule,
    SeriesModule,
    IcalModule,
    PayrollModule,
    ContentModule,
    PosModule,
    StaysModule,
    ChainedBookingsModule,
    DispatchModule,
    CoursesModule,
    DepositsModule,
    AccessModule,
    ReferralsModule,
    ChallengesModule,
    MakeupModule,
    AdmissionsModule,
    OrdersModule,
  ],
})
export class AppModule implements NestModule {
  configure(consumer: MiddlewareConsumer): void {
    consumer
      .apply(TenantMiddleware)
      .exclude(
        { path: 'health', method: RequestMethod.ALL },
        { path: 'health/ready', method: RequestMethod.ALL },
        { path: 'auth/register', method: RequestMethod.POST },
        { path: 'auth/refresh', method: RequestMethod.POST },
        { path: 'auth/logout', method: RequestMethod.POST },
        { path: 'admin/(.*)', method: RequestMethod.ALL },
        { path: 'platform/(.*)', method: RequestMethod.ALL },
        { path: 'public/(.*)', method: RequestMethod.ALL },
        // External API klíče nesou tenantId v key recordu, takže middleware
        // pro tenant resolution z URL/hostu zde nepoužíváme.
        { path: 'external/(.*)', method: RequestMethod.ALL },
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
