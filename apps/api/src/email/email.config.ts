import { Injectable } from '@nestjs/common';
import { z } from 'zod';

const EmailEnvSchema = z.object({
  SMTP_HOST: z.string().default('localhost'),
  SMTP_PORT: z.coerce.number().int().positive().default(1026), // Mailhog dev
  SMTP_USER: z.string().optional().default(''),
  SMTP_PASS: z.string().optional().default(''),
  EMAIL_FROM: z.string().email().default('noreply@reserved.local'),
  EMAIL_FROM_NAME: z.string().default('Reserved'),
});

@Injectable()
export class EmailConfig {
  readonly host: string;
  readonly port: number;
  readonly user: string;
  readonly pass: string;
  readonly from: string;
  readonly fromName: string;

  constructor() {
    const env = EmailEnvSchema.parse(process.env);
    this.host = env.SMTP_HOST;
    this.port = env.SMTP_PORT;
    this.user = env.SMTP_USER;
    this.pass = env.SMTP_PASS;
    this.from = env.EMAIL_FROM;
    this.fromName = env.EMAIL_FROM_NAME;
  }

  get authEnabled(): boolean {
    return Boolean(this.user && this.pass);
  }
}
