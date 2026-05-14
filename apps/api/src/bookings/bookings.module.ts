import { Module } from '@nestjs/common';
import { BundlePacksModule } from '../bundle-packs/bundle-packs.module.js';
import { CreditPacksModule } from '../credit-packs/credit-packs.module.js';
import { GoogleCalendarModule } from '../google-calendar/google-calendar.module.js';
import { TimePacksModule } from '../time-packs/time-packs.module.js';
import { CustomersModule } from '../customers/customers.module.js';
import { DbModule } from '../db/db.module.js';
import { EmailModule } from '../email/email.module.js';
import { RulesModule } from '../rules/rules.module.js';
import { BookingsController } from './bookings.controller.js';
import { BookingsService } from './bookings.service.js';

@Module({
  // RulesModule je @Global() ale explicitni import = jistota kdyby @Global zmizel.
  imports: [
    DbModule,
    EmailModule,
    CustomersModule,
    CreditPacksModule,
    BundlePacksModule,
    TimePacksModule,
    GoogleCalendarModule,
    RulesModule,
  ],
  controllers: [BookingsController],
  providers: [BookingsService],
  exports: [BookingsService],
})
export class BookingsModule {}
