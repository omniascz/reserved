import { Module } from '@nestjs/common';
import { DbModule } from '../db/db.module.js';
import { CustomersModule } from '../customers/customers.module.js';
import { PaymentsModule } from '../payments/payments.module.js';
import { DepositsController } from './deposits.controller.js';
import { DepositsService } from './deposits.service.js';

@Module({
  imports: [DbModule, CustomersModule, PaymentsModule],
  controllers: [DepositsController],
  providers: [DepositsService],
  exports: [DepositsService],
})
export class DepositsModule {}
