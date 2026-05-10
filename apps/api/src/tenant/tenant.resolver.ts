// Pure logika tenant resolution (bez HTTP / DB závislostí), aby šla snadno
// unit-testovat. Service vrstva volá `extractCandidateFromRequest` + DB lookup.

import type { TenantConfig } from './tenant.config.js';

export interface TenantCandidate {
  source: 'subdomain' | 'custom_domain' | 'header';
  /** Pro subdomain: hodnota subdomény (slug). Pro custom_domain: hostname.
   *  Pro header: UUID nebo slug z X-Tenant-ID. */
  value: string;
}

export interface TenantResolverInput {
  /** Hostname requestu (bez portu). */
  host: string;
  /** Hodnota X-Tenant-ID hlavičky, pokud je. */
  headerValue?: string;
}

/**
 * Vrátí kandidáty na resolution v pořadí priority:
 *   1. subdoména (pokud Host = `<sub>.<APP_BASE_DOMAIN>` a není reserved)
 *   2. custom_domain (pokud Host neodpovídá subdomain pattern)
 *   3. X-Tenant-ID header (pro API integrace)
 *
 * Volající (TenantMiddleware) projde kandidáty od prvního a po prvním DB
 * matchi se zastaví.
 */
export function extractTenantCandidates(
  input: TenantResolverInput,
  config: Pick<TenantConfig, 'baseDomain' | 'isReservedSubdomain'>,
): TenantCandidate[] {
  const candidates: TenantCandidate[] = [];
  const host = stripPort(input.host).toLowerCase();
  const baseDomain = config.baseDomain.toLowerCase();

  // 1. Subdomain: <sub>.<base>
  if (host.endsWith('.' + baseDomain)) {
    const sub = host.slice(0, -('.' + baseDomain).length);
    if (sub && !sub.includes('.') && !config.isReservedSubdomain(sub)) {
      candidates.push({ source: 'subdomain', value: sub });
    }
  } else if (host !== baseDomain && host !== 'localhost') {
    // 2. Custom domain — Host nemá base doménu jako suffix.
    candidates.push({ source: 'custom_domain', value: host });
  }

  // 3. X-Tenant-ID header (poslední fallback nebo pro localhost dev)
  if (input.headerValue && input.headerValue.trim() !== '') {
    candidates.push({ source: 'header', value: input.headerValue.trim() });
  }

  return candidates;
}

function stripPort(host: string): string {
  const idx = host.indexOf(':');
  return idx === -1 ? host : host.slice(0, idx);
}
