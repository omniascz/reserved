import { Module } from '@nestjs/common';
import { DbModule } from '../db/db.module.js';
import { TableReservationsController } from './table-reservations.controller.js';
import { TableReservationsService } from './table-reservations.service.js';

@Module({
  imports: [DbModule],
  controllers: [TableReservationsController],
  providers: [TableReservationsService],
  exports: [TableReservationsService],
})
export class TableReservationsModule {}
