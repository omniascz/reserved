import { Module } from '@nestjs/common';
import { DbModule } from '../db/db.module.js';
import { OnboardingModule } from '../onboarding/onboarding.module.js';
import { EmployeesController } from './employees.controller.js';
import { EmployeesService } from './employees.service.js';

@Module({
  imports: [DbModule, OnboardingModule],
  controllers: [EmployeesController],
  providers: [EmployeesService],
  exports: [EmployeesService],
})
export class EmployeesModule {}
