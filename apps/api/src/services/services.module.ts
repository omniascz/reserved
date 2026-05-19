import { Module } from '@nestjs/common';
import { DbModule } from '../db/db.module.js';
import { OnboardingModule } from '../onboarding/onboarding.module.js';
import { ServicesController } from './services.controller.js';
import { ServicesService } from './services.service.js';

@Module({
  imports: [DbModule, OnboardingModule],
  controllers: [ServicesController],
  providers: [ServicesService],
  exports: [ServicesService],
})
export class ServicesModule {}
