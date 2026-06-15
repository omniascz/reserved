import { Module } from '@nestjs/common';
import { DbModule } from '../db/db.module.js';
import { EmailModule } from '../email/email.module.js';
import { AuthModule } from '../auth/auth.module.js';
import { BundlePacksModule } from '../bundle-packs/bundle-packs.module.js';
import { CreditPacksModule } from '../credit-packs/credit-packs.module.js';
import { SubscriptionsModule } from '../subscriptions/subscriptions.module.js';
import { TimePacksModule } from '../time-packs/time-packs.module.js';
import { ContentModule } from '../content/content.module.js';
import { SeriesModule } from '../series/series.module.js';
import { MakeupModule } from '../makeup/makeup.module.js';
import { PortalAuthController } from './portal-auth.controller.js';
import { PortalAuthService } from './portal-auth.service.js';
import { PortalMeController } from './portal-me.controller.js';
import { PortalMeService } from './portal-me.service.js';
import { PortalJwtService } from './portal-jwt.service.js';
import { PortalGuard } from './portal.guard.js';

@Module({
  imports: [
    DbModule,
    EmailModule,
    AuthModule,
    CreditPacksModule,
    BundlePacksModule,
    TimePacksModule,
    SubscriptionsModule,
    ContentModule,
    SeriesModule,
    MakeupModule,
  ],
  controllers: [PortalAuthController, PortalMeController],
  providers: [PortalAuthService, PortalMeService, PortalJwtService, PortalGuard],
  exports: [PortalJwtService, PortalGuard],
})
export class PortalModule {}
