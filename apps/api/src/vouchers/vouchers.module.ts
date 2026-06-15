import { Module } from '@nestjs/common';
import { DbModule } from '../db/db.module.js';
import { EmailModule } from '../email/email.module.js';
import { PaymentsModule } from '../payments/payments.module.js';
import { VouchersController } from './vouchers.controller.js';
import { VouchersService } from './vouchers.service.js';

@Module({
  imports: [DbModule, EmailModule, PaymentsModule],
  controllers: [VouchersController],
  providers: [VouchersService],
  exports: [VouchersService],
})
export class VouchersModule {}
