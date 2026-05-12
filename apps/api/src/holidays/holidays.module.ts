import { Module } from '@nestjs/common';
import { DbModule } from '../db/db.module.js';
import { HolidaysController } from './holidays.controller.js';
import { HolidaysService } from './holidays.service.js';

@Module({
  imports: [DbModule],
  controllers: [HolidaysController],
  providers: [HolidaysService],
  exports: [HolidaysService],
})
export class HolidaysModule {}
