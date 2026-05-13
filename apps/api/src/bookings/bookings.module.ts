import { Module } from '@nestjs/common';
import { CreditPacksModule } from '../credit-packs/credit-packs.module.js';
import { CustomersModule } from '../customers/customers.module.js';
import { DbModule } from '../db/db.module.js';
import { EmailModule } from '../email/email.module.js';
import { BookingsController } from './bookings.controller.js';
import { BookingsService } from './bookings.service.js';

@Module({
  imports: [DbModule, EmailModule, CustomersModule, CreditPacksModule],
  controllers: [BookingsController],
  providers: [BookingsService],
  exports: [BookingsService],
})
export class BookingsModule {}
