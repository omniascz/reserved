import { Module } from '@nestjs/common';
import { DbModule } from '../db/db.module.js';
import { EmailConfig } from './email.config.js';
import { EmailService } from './email.service.js';
import { NotificationsScheduler } from './notifications-scheduler.service.js';

@Module({
  imports: [DbModule],
  providers: [EmailConfig, EmailService, NotificationsScheduler],
  exports: [EmailService, NotificationsScheduler],
})
export class EmailModule {}
