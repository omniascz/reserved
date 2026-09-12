import { Module } from '@nestjs/common';
import { DbModule } from '../db/db.module.js';
import { PayrollController } from './payroll.controller.js';
import { PayrollService } from './payroll.service.js';

@Module({
  imports: [DbModule],
  controllers: [PayrollController],
  providers: [PayrollService],
  exports: [PayrollService],
})
export class PayrollModule {}
