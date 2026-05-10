import { Global, Module } from '@nestjs/common';
import { DbConfig } from './db.config.js';
import { DbService } from './db.service.js';

@Global()
@Module({
  providers: [DbConfig, DbService],
  exports: [DbService],
})
export class DbModule {}
