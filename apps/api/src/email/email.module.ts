import { Module } from '@nestjs/common';
import { DbModule } from '../db/db.module.js';
import { EmailConfig } from './email.config.js';
import { EmailService } from './email.service.js';
import { NotificationsScheduler } from './notifications-scheduler.service.js';
import { BookingRemindersService } from './booking-reminders.service.js';

@Module({
  imports: [DbModule],
  providers: [EmailConfig, EmailService, NotificationsScheduler, BookingRemindersService],
  exports: [EmailService, NotificationsScheduler, BookingRemindersService],
})
export class EmailModule {}
