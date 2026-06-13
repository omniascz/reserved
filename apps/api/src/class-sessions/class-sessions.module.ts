import { Module } from '@nestjs/common';
import { DbModule } from '../db/db.module.js';
import { CustomersModule } from '../customers/customers.module.js';
import { ClassSessionsController } from './class-sessions.controller.js';
import { ClassSessionsService } from './class-sessions.service.js';

@Module({
  imports: [DbModule, CustomersModule],
  controllers: [ClassSessionsController],
  providers: [ClassSessionsService],
  exports: [ClassSessionsService],
})
export class ClassSessionsModule {}
