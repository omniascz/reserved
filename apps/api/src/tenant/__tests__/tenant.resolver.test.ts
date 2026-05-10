import { describe, expect, it } from 'vitest';
import { extractTenantCandidates } from '../tenant.resolver.js';

const config = {
  baseDomain: 'reserved.cz',
  isReservedSubdomain: (s: string) => ['app', 'www', 'api'].includes(s),
};

describe('extractTenantCandidates', () => {
  it('returns subdomain candidate for tenant.reserved.cz', () => {
    const result = extractTenantCandidates({ host: 'salon-jana.reserved.cz' }, config);
    expect(result).toEqual([{ source: 'subdomain', value: 'salon-jana' }]);
  });

  it('strips port from host before matching', () => {
    const result = extractTenantCandidates({ host: 'salon-jana.reserved.cz:443' }, config);
    expect(result[0]).toMatchObject({ source: 'subdomain', value: 'salon-jana' });
  });

  it('skips reserved subdomains (app, www, api)', () => {
    expect(extractTenantCandidates({ host: 'app.reserved.cz' }, config)).toEqual([]);
    expect(extractTenantCandidates({ host: 'www.reserved.cz' }, config)).toEqual([]);
    expect(extractTenantCandidates({ host: 'api.reserved.cz' }, config)).toEqual([]);
  });

  it('returns custom_domain candidate when host does not match base domain', () => {
    const result = extractTenantCandidates({ host: 'rezervace.firma.cz' }, config);
    expect(result).toEqual([{ source: 'custom_domain', value: 'rezervace.firma.cz' }]);
  });

  it('returns no subdomain candidate for localhost (dev)', () => {
    const result = extractTenantCandidates({ host: 'localhost' }, config);
    expect(result).toEqual([]);
  });

  it('returns header candidate when X-Tenant-ID provided alongside subdomain (both work)', () => {
    const result = extractTenantCandidates(
      { host: 'salon-jana.reserved.cz', headerValue: 'override-uuid' },
      config,
    );
    expect(result).toEqual([
      { source: 'subdomain', value: 'salon-jana' },
      { source: 'header', value: 'override-uuid' },
    ]);
  });

  it('returns header-only candidate for localhost dev', () => {
    const result = extractTenantCandidates({ host: 'localhost', headerValue: 'demo' }, config);
    expect(result).toEqual([{ source: 'header', value: 'demo' }]);
  });

  it('rejects nested subdomain (a.b.reserved.cz)', () => {
    const result = extractTenantCandidates({ host: 'a.b.reserved.cz' }, config);
    expect(result.find((c) => c.source === 'subdomain')).toBeUndefined();
  });

  it('treats empty header value as absent', () => {
    const result = extractTenantCandidates({ host: 'localhost', headerValue: '   ' }, config);
    expect(result).toEqual([]);
  });

  it('case-insensitive host matching', () => {
    const result = extractTenantCandidates({ host: 'SALON-JANA.Reserved.CZ' }, config);
    expect(result[0]).toMatchObject({ source: 'subdomain', value: 'salon-jana' });
  });
});
