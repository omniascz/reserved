import { Module } from '@nestjs/common';
import { DbModule } from '../db/db.module.js';
import { ApiKeysService } from './api-keys.service.js';
import { ApiKeyGuard } from './api-key.guard.js';
import { ApiKeyThrottlerGuard } from './api-key-throttler.guard.js';
import { ApiKeysController } from './api-keys.controller.js';

@Module({
  imports: [DbModule],
  controllers: [ApiKeysController],
  providers: [ApiKeysService, ApiKeyGuard, ApiKeyThrottlerGuard],
  exports: [ApiKeysService, ApiKeyGuard, ApiKeyThrottlerGuard],
})
export class ApiKeysModule {}
