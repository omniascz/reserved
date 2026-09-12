import { Module } from '@nestjs/common';
import { AccessModule } from '../access/access.module.js';
import { PaymentsModule } from '../payments/payments.module.js';
import { AdmissionsController } from './admissions.controller.js';
import { AdmissionsService } from './admissions.service.js';

@Module({
  imports: [AccessModule, PaymentsModule],
  controllers: [AdmissionsController],
  providers: [AdmissionsService],
  exports: [AdmissionsService],
})
export class AdmissionsModule {}
