import { Module } from '@nestjs/common';
import { DbModule } from '../db/db.module.js';
import { GoogleCalendarModule } from '../google-calendar/google-calendar.module.js';
import { CalendarConfigModule } from './calendar-config.module.js';
import { CalendarSyncService } from './calendar-sync.service.js';
import { CalendarPushController, CalendarsAdminController } from './calendars.controller.js';

// Kalendáře zaměstnanců: zápis rezervací ven, push notifikace, Outlook a CalDAV.
@Module({
  imports: [DbModule, GoogleCalendarModule, CalendarConfigModule],
  controllers: [CalendarsAdminController, CalendarPushController],
  providers: [CalendarSyncService],
  exports: [CalendarSyncService],
})
export class CalendarsModule {}
