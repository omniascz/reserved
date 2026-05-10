import { Injectable } from '@nestjs/common';
import { z } from 'zod';

const TenantEnvSchema = z.object({
  APP_BASE_DOMAIN: z.string().min(1).default('localhost'),
  APP_RESERVED_SUBDOMAINS: z.string().default('app,www,api,admin,static,cdn'),
});

@Injectable()
export class TenantConfig {
  private readonly _baseDomain: string;
  private readonly _reservedSubdomains: Set<string>;

  constructor() {
    const env = TenantEnvSchema.parse(process.env);
    this._baseDomain = env.APP_BASE_DOMAIN.toLowerCase();
    this._reservedSubdomains = new Set(
      env.APP_RESERVED_SUBDOMAINS.split(',')
        .map((s) => s.trim().toLowerCase())
        .filter(Boolean),
    );
  }

  get baseDomain(): string {
    return this._baseDomain;
  }

  isReservedSubdomain(subdomain: string): boolean {
    return this._reservedSubdomains.has(subdomain.toLowerCase());
  }
}
