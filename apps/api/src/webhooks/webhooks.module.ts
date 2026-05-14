import { Global, Module } from '@nestjs/common';
import { DbModule } from '../db/db.module.js';
import { WebhooksController } from './webhooks.controller.js';
import { WebhooksService } from './webhooks.service.js';

/**
 * Outgoing webhooks pro Zapier / Make / IFTTT. Global module — ostatni
 * services (Bookings, Customers) si WebhooksService injectuji a volaji
 * dispatch(...).
 */
@Global()
@Module({
  imports: [DbModule],
  controllers: [WebhooksController],
  providers: [WebhooksService],
  exports: [WebhooksService],
})
export class WebhooksModule {}
