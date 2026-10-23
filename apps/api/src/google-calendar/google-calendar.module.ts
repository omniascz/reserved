import { Module } from '@nestjs/common';
import { DbModule } from '../db/db.module.js';
import { CalendarConfigModule } from '../calendars/calendar-config.module.js';
import { GoogleCalendarController } from './google-calendar.controller.js';
import { GoogleCalendarService } from './google-calendar.service.js';

@Module({
  imports: [DbModule, CalendarConfigModule],
  controllers: [GoogleCalendarController],
  providers: [GoogleCalendarService],
  exports: [GoogleCalendarService],
})
export class GoogleCalendarModule {}
