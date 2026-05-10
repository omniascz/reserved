import { Injectable } from '@nestjs/common';
import { z } from 'zod';

const DbEnvSchema = z
  .object({
    DATABASE_APP_URL: z.string().url().optional(),
    DATABASE_URL: z.string().url(),
    DATABASE_POOL_MAX: z.coerce.number().int().positive().default(10),
  })
  .transform((env) => ({
    appUrl: env.DATABASE_APP_URL ?? env.DATABASE_URL,
    poolMax: env.DATABASE_POOL_MAX,
  }));

export type DbEnv = z.infer<typeof DbEnvSchema>;

@Injectable()
export class DbConfig {
  private readonly _env: DbEnv;

  constructor() {
    this._env = DbEnvSchema.parse(process.env);
  }

  get appUrl(): string {
    return this._env.appUrl;
  }

  get poolMax(): number {
    return this._env.poolMax;
  }
}
