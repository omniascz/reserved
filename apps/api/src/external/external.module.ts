import { Module } from '@nestjs/common';
import { ApiKeysModule } from '../api-keys/api-keys.module.js';
import { BookingsModule } from '../bookings/bookings.module.js';
import { CustomersModule } from '../customers/customers.module.js';
import { DbModule } from '../db/db.module.js';
import { AvailabilityModule } from '../availability/availability.module.js';
import { ExternalBookingsController } from './external-bookings.controller.js';
import { ExternalCatalogController } from './external-catalog.controller.js';
import { ExternalCustomersController } from './external-customers.controller.js';

@Module({
  imports: [ApiKeysModule, BookingsModule, CustomersModule, DbModule, AvailabilityModule],
  controllers: [ExternalBookingsController, ExternalCatalogController, ExternalCustomersController],
})
export class ExternalModule {}
