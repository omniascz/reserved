// JWT konfigurace načtená z env. Validuje se v konstruktoru — chybný env shodí
// app při instantiation modulu, ne až při loginu.

import { Injectable } from '@nestjs/common';
import { z } from 'zod';

const AuthEnvSchema = z.object({
  JWT_SECRET: z.string().min(32, 'JWT_SECRET must be at least 32 characters'),
  JWT_ISSUER: z.string().min(1).default('reserved'),
  JWT_AUDIENCE: z.string().min(1).default('reserved-api'),
  JWT_ACCESS_TTL_SECONDS: z.coerce.number().int().positive().default(900),
  JWT_REFRESH_TTL_SECONDS: z.coerce.number().int().positive().default(604800),
});

export type AuthEnv = z.infer<typeof AuthEnvSchema>;

@Injectable()
export class AuthConfig {
  private readonly _env: AuthEnv;
  private readonly _secret: Uint8Array;

  constructor() {
    this._env = AuthEnvSchema.parse(process.env);
    this._secret = new TextEncoder().encode(this._env.JWT_SECRET);
  }

  /** Pro testy: re-initialize z aktuálního process.env. */
  onModuleInit(): void {
    // no-op: env je načten v konstruktoru. Tato metoda existuje pro
    // backward compat s testy, které ji volaly explicitně.
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
