import { Module } from '@nestjs/common';
import { DbModule } from '../db/db.module.js';
import { PlatformBillingConfig } from './platform-billing.config.js';
import { PlatformBillingService } from './platform-billing.service.js';
import { PlatformBillingAdminController } from './platform-billing-admin.controller.js';
import { PlatformBillingWebhookController } from './platform-billing-webhook.controller.js';

@Module({
  imports: [DbModule],
  controllers: [PlatformBillingAdminController, PlatformBillingWebhookController],
  providers: [PlatformBillingConfig, PlatformBillingService],
  exports: [PlatformBillingService],
})
export class PlatformBillingModule {}
