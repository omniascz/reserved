import { Module } from '@nestjs/common';
import { DbModule } from '../db/db.module.js';
import { OnboardingController } from './onboarding.controller.js';
import { OnboardingService } from './onboarding.service.js';

@Module({
  imports: [DbModule],
  controllers: [OnboardingController],
  providers: [OnboardingService],
  exports: [OnboardingService],
})
export class OnboardingModule {}
