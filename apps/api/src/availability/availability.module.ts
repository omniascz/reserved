import { Module } from '@nestjs/common';
import { DbModule } from '../db/db.module.js';
import { AvailabilityService } from './availability.service.js';

@Module({
  imports: [DbModule],
  providers: [AvailabilityService],
  exports: [AvailabilityService],
})
export class AvailabilityModule {}
