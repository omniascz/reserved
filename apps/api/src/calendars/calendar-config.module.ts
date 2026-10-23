import { Module } from '@nestjs/common';
import { CalendarConfig } from './calendar.config.js';

// Samostatně, aby ji šlo použít v GoogleCalendarModule i CalendarsModule bez cyklu.
@Module({
  providers: [CalendarConfig],
  exports: [CalendarConfig],
})
export class CalendarConfigModule {}
