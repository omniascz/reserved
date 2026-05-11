import { Module } from '@nestjs/common';
import { CustomersModule } from '../customers/customers.module.js';
import { DbModule } from '../db/db.module.js';
import { EmailModule } from '../email/email.module.js';
import { BookingsController } from './bookings.controller.js';
import { BookingsService } from './bookings.service.js';

@Module({
  imports: [DbModule, EmailModule, CustomersModule],
  controllers: [BookingsController],
  providers: [BookingsService],
  exports: [BookingsService],
})
export class BookingsModule {}
