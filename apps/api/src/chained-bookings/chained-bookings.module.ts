import { Module } from '@nestjs/common';
import { DbModule } from '../db/db.module.js';
import { ChainedBookingsController } from './chained-bookings.controller.js';
import { ChainedBookingsService } from './chained-bookings.service.js';

@Module({
  imports: [DbModule],
  controllers: [ChainedBookingsController],
  providers: [ChainedBookingsService],
  exports: [ChainedBookingsService],
})
export class ChainedBookingsModule {}
