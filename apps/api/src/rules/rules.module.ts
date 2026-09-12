import { Module, Global } from '@nestjs/common';
import { CreditPacksModule } from '../credit-packs/credit-packs.module.js';
import { DbModule } from '../db/db.module.js';
import { EmailModule } from '../email/email.module.js';
import { PaymentsModule } from '../payments/payments.module.js';
import { RulesController } from './rules.controller.js';
import { RulesService } from './rules.service.js';
import { EventBus } from './events.bus.js';

@Global() // EventBus je globální — kdokoli může emit
@Module({
  imports: [DbModule, EmailModule, CreditPacksModule, PaymentsModule],
  controllers: [RulesController],
  providers: [RulesService, EventBus],
  exports: [EventBus, RulesService],
})
export class RulesModule {}
