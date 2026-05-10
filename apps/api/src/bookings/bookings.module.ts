import { Module } from '@nestjs/common';
import { DbModule } from '../db/db.module.js';
import { EmailModule } from '../email/email.module.js';
import { BookingsController } from './bookings.controller.js';
import { BookingsService } from './bookings.service.js';

@Module({
  imports: [DbModule, EmailModule],
  controllers: [BookingsController],
  providers: [BookingsService],
  exports: [BookingsService],
})
export class BookingsModule {}
