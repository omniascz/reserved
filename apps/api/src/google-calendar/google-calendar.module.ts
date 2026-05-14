import { Module } from '@nestjs/common';
import { DbModule } from '../db/db.module.js';
import { GoogleCalendarController } from './google-calendar.controller.js';
import { GoogleCalendarService } from './google-calendar.service.js';

@Module({
  imports: [DbModule],
  controllers: [GoogleCalendarController],
  providers: [GoogleCalendarService],
  exports: [GoogleCalendarService],
})
export class GoogleCalendarModule {}
