import { Module } from '@nestjs/common';
import { DbModule } from '../db/db.module.js';
import { ServicePeriodsController } from './service-periods.controller.js';
import { ServicePeriodsService } from './service-periods.service.js';

@Module({
  imports: [DbModule],
  controllers: [ServicePeriodsController],
  providers: [ServicePeriodsService],
  exports: [ServicePeriodsService],
})
export class ServicePeriodsModule {}
