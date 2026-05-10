// Konfigurace tenant resolution — base doména pro subdomain matching.

import { Injectable, OnModuleInit } from '@nestjs/common';
import { z } from 'zod';

const TenantEnvSchema = z.object({
  /**
   * Base doména. Subdoména `salon-jana` znamená tenant slug `salon-jana`,
   * pokud Host = `salon-jana.<APP_BASE_DOMAIN>`.
   */
  APP_BASE_DOMAIN: z.string().min(1).default('localhost'),
  /**
   * Reserved subdomény, které NIKDY nejsou tenanty (např. `app`, `www`, `api`).
   */
  APP_RESERVED_SUBDOMAINS: z.string().default('app,www,api,admin,static,cdn'),
});

@Injectable()
export class TenantConfig implements OnModuleInit {
  private _baseDomain!: string;
  private _reservedSubdomains!: Set<string>;

  onModuleInit(): void {
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
