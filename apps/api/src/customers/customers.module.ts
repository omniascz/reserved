import { Module } from '@nestjs/common';
import { DbModule } from '../db/db.module.js';
import { CustomersController } from './customers.controller.js';
import { CustomersService } from './customers.service.js';
import { NoShowRiskService } from './no-show-risk.service.js';

@Module({
  imports: [DbModule],
  controllers: [CustomersController],
  providers: [CustomersService, NoShowRiskService],
  exports: [CustomersService, NoShowRiskService],
})
export class CustomersModule {}
