import { Module } from '@nestjs/common';
import { DbModule } from '../db/db.module.js';
import { IcalController } from './ical.controller.js';
import { IcalService } from './ical.service.js';

@Module({
  imports: [DbModule],
  controllers: [IcalController],
  providers: [IcalService],
  exports: [IcalService],
})
export class IcalModule {}
