import { Module, Global } from '@nestjs/common';
import { DbModule } from '../db/db.module.js';
import { EmailModule } from '../email/email.module.js';
import { RulesController } from './rules.controller.js';
import { RulesService } from './rules.service.js';
import { EventBus } from './events.bus.js';

@Global() // EventBus je globální — kdokoli může emit
@Module({
  imports: [DbModule, EmailModule],
  controllers: [RulesController],
  providers: [RulesService, EventBus],
  exports: [EventBus, RulesService],
})
export class RulesModule {}
