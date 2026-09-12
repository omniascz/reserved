import { Module } from '@nestjs/common';
import { DbModule } from '../db/db.module.js';
import { AppointmentRecordsController } from './appointment-records.controller.js';
import { AppointmentRecordsService } from './appointment-records.service.js';

@Module({
  imports: [DbModule],
  controllers: [AppointmentRecordsController],
  providers: [AppointmentRecordsService],
  exports: [AppointmentRecordsService],
})
export class AppointmentRecordsModule {}
