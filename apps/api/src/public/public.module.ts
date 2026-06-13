import { Module } from '@nestjs/common';
import { AvailabilityModule } from '../availability/availability.module.js';
import { BookingsModule } from '../bookings/bookings.module.js';
import { ClassSessionsModule } from '../class-sessions/class-sessions.module.js';
import { DbModule } from '../db/db.module.js';
import { TenantModule } from '../tenant/tenant.module.js';
import { PublicController } from './public.controller.js';

@Module({
  imports: [DbModule, TenantModule, AvailabilityModule, BookingsModule, ClassSessionsModule],
  controllers: [PublicController],
})
export class PublicModule {}
