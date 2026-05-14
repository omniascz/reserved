import { Global, Module } from '@nestjs/common';
import { DbModule } from '../db/db.module.js';
import { FeatureFlagsController } from './feature-flags.controller.js';
import { FeatureFlagsService } from './feature-flags.service.js';

// @Global() — feature flags pouziva mnoho modulu pro check (isEnabled),
// takze ho exportujeme globalne pro snazsi injection
@Global()
@Module({
  imports: [DbModule],
  controllers: [FeatureFlagsController],
  providers: [FeatureFlagsService],
  exports: [FeatureFlagsService],
})
export class FeatureFlagsModule {}
