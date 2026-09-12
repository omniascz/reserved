import { Module } from '@nestjs/common';
import { DbModule } from '../db/db.module.js';
import { ClassSessionsModule } from '../class-sessions/class-sessions.module.js';
import { CustomersModule } from '../customers/customers.module.js';
import { CoursesController } from './courses.controller.js';
import { CoursesService } from './courses.service.js';

@Module({
  imports: [DbModule, ClassSessionsModule, CustomersModule],
  controllers: [CoursesController],
  providers: [CoursesService],
  exports: [CoursesService],
})
export class CoursesModule {}
