import { Module } from '@nestjs/common';
import { DbModule } from '../db/db.module.js';
import { ApiKeysModule } from '../api-keys/api-keys.module.js';
import { AccessController } from './access.controller.js';
import { AccessExternalController } from './access-external.controller.js';
import { AccessService } from './access.service.js';

@Module({
  imports: [DbModule, ApiKeysModule],
  controllers: [AccessController, AccessExternalController],
  providers: [AccessService],
  exports: [AccessService],
})
export class AccessModule {}
