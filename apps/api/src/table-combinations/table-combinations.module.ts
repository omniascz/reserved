import { Module } from '@nestjs/common';
import { DbModule } from '../db/db.module.js';
import { TableCombinationsController } from './table-combinations.controller.js';
import { TableCombinationsService } from './table-combinations.service.js';

@Module({
  imports: [DbModule],
  controllers: [TableCombinationsController],
  providers: [TableCombinationsService],
  exports: [TableCombinationsService],
})
export class TableCombinationsModule {}
