import { Module } from '@nestjs/common';
import { DbModule } from '../db/db.module.js';
import { CorporateAccountsController } from './corporate-accounts.controller.js';
import { CorporateAccountsService } from './corporate-accounts.service.js';

@Module({
  imports: [DbModule],
  controllers: [CorporateAccountsController],
  providers: [CorporateAccountsService],
  exports: [CorporateAccountsService],
})
export class CorporateAccountsModule {}
