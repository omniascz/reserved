import { Module } from '@nestjs/common';
import { DbModule } from '../db/db.module.js';
import { EmailConfig } from './email.config.js';
import { EmailService } from './email.service.js';

@Module({
  imports: [DbModule],
  providers: [EmailConfig, EmailService],
  exports: [EmailService],
})
export class EmailModule {}
