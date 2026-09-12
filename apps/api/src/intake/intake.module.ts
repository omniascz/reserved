import { Module } from '@nestjs/common';
import { DbModule } from '../db/db.module.js';
import { IntakeController } from './intake.controller.js';
import { IntakeService } from './intake.service.js';

@Module({
  imports: [DbModule],
  controllers: [IntakeController],
  providers: [IntakeService],
  exports: [IntakeService],
})
export class IntakeModule {}
