// JWT konfigurace načtená z env při startu modulu.
// Validuje se před prvním requestem — chybný env shodí app na startu, ne až při loginu.

import { Injectable, OnModuleInit } from '@nestjs/common';
import { z } from 'zod';

const AuthEnvSchema = z.object({
  JWT_SECRET: z.string().min(32, 'JWT_SECRET must be at least 32 characters'),
  JWT_ISSUER: z.string().min(1).default('reserved'),
  JWT_AUDIENCE: z.string().min(1).default('reserved-api'),
  JWT_ACCESS_TTL_SECONDS: z.coerce.number().int().positive().default(900), // 15 min
  JWT_REFRESH_TTL_SECONDS: z.coerce.number().int().positive().default(604800), // 7 dní
});

export type AuthEnv = z.infer<typeof AuthEnvSchema>;

@Injectable()
export class AuthConfig implements OnModuleInit {
  private _env!: AuthEnv;
  private _secret!: Uint8Array;

  onModuleInit(): void {
    this._env = AuthEnvSchema.parse(process.env);
    this._secret = new TextEncoder().encode(this._env.JWT_SECRET);
  }

  get secret(): Uint8Array {
    return this._secret;
  }

  get issuer(): string {
    return this._env.JWT_ISSUER;
  }

  get audience(): string {
    return this._env.JWT_AUDIENCE;
  }

  get accessTtl(): number {
    return this._env.JWT_ACCESS_TTL_SECONDS;
  }

  get refreshTtl(): number {
    return this._env.JWT_REFRESH_TTL_SECONDS;
  }
}
