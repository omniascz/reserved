// Sprint 7.0-A: E2E smoke test kritické cesty Reserved.
//
// Tento test ověří, že nový tenant dokáže projít celý onboarding flow:
//   1. Health checks odpovídají (liveness + readiness)
//   2. Registrace nového tenant + ownera vrátí tokeny
//   3. Vytvoření služby (admin endpoint, JWT auth)
//   4. Veřejný widget endpoint vrátí službu (public read, bez auth)
//
// Test běží proti reálnému API (default http://localhost:4000) a vyžaduje
// běžící DB. Pro produkční smoke test stačí přepnout API_URL na staging.
//
// Run: pnpm --filter @reserved/e2e test
// Pre-req: pnpm dev (API musí běžet na portu 4000)

import { describe, it, expect, beforeAll } from 'vitest';

const API_URL = process.env.API_URL ?? 'http://localhost:4000/api/v1';

interface RegisterResponse {
  tenantId: string;
  userId: string;
  tokens: {
    accessToken: string;
    refreshToken: string;
    expiresIn: number;
  };
}

interface ServiceCreated {
  data: {
    id: string;
    name: string;
    durationMinutes: number;
    priceHellers: number;
  };
}

interface PublicServicesResponse {
  data: Array<{
    id: string;
    name: string;
    durationMinutes: number;
    priceHellers: number;
  }>;
}

// Generujeme unikátní slug pro každý běh, aby testy nepadaly na duplicitě.
function uniqueSlug(): string {
  const ts = Date.now().toString(36);
  const rand = Math.random().toString(36).slice(2, 6);
  return `e2e-${ts}-${rand}`.slice(0, 32);
}

async function apiCall<T>(
  path: string,
  init?: RequestInit & { token?: string; tenantHeader?: string },
): Promise<T> {
  const headers: Record<string, string> = {
    'Content-Type': 'application/json',
    ...((init?.headers as Record<string, string>) ?? {}),
  };
  if (init?.token) headers['Authorization'] = `Bearer ${init.token}`;
  if (init?.tenantHeader) headers['X-Tenant-ID'] = init.tenantHeader;

  const res = await fetch(`${API_URL}${path}`, { ...init, headers });
  const text = await res.text();
  const body = text ? JSON.parse(text) : undefined;

  if (!res.ok) {
    throw new Error(`[${res.status}] ${path}: ${text}`);
  }
  return body as T;
}

describe('Critical path E2E', () => {
  const slug = uniqueSlug();
  const email = `${slug}@e2e.local`;
  const password = 'SecureTestPwd123!';

  let accessToken: string;
  let tenantId: string;
  let serviceId: string;

  // ─── 1. Health checks ─────────────────────────────────────────────────

  describe('Health endpoints', () => {
    it('GET /health vraci 200 (liveness)', async () => {
      const data = await apiCall<{ status: string; service: string }>('/health');
      expect(data.status).toBe('ok');
      expect(data.service).toBe('reserved-api');
    });

    it('GET /health/ready vraci 200 (readiness s DB checkem)', async () => {
      const data = await apiCall<{ status: string; info: Record<string, { status: string }> }>(
        '/health/ready',
      );
      expect(data.status).toBe('ok');
      expect(data.info?.database?.status).toBe('up');
    });
  });

  // ─── 2. Onboarding: registrace ───────────────────────────────────────

  describe('Tenant onboarding', () => {
    it('POST /auth/register vytvori novy tenant + owner', async () => {
      const result = await apiCall<RegisterResponse>('/auth/register', {
        method: 'POST',
        body: JSON.stringify({
          tenantSlug: slug,
          tenantName: `E2E Studio ${slug}`,
          email,
          password,
          firstName: 'E2E',
          lastName: 'Tester',
          currency: 'CZK',
          locale: 'cs-CZ',
        }),
      });

      expect(result.tenantId).toBeTruthy();
      expect(result.userId).toBeTruthy();
      expect(result.tokens.accessToken).toBeTruthy();
      expect(result.tokens.refreshToken).toBeTruthy();
      expect(result.tokens.expiresIn).toBeGreaterThan(0);

      // Persist for next tests
      accessToken = result.tokens.accessToken;
      tenantId = result.tenantId;
    });

    it('Duplicitni slug vrati 409', async () => {
      try {
        await apiCall('/auth/register', {
          method: 'POST',
          body: JSON.stringify({
            tenantSlug: slug,
            tenantName: 'Duplicate Test',
            email: `dup-${email}`,
            password,
            firstName: 'Dup',
            lastName: 'Test',
          }),
        });
        throw new Error('Mělo to selhat');
      } catch (err) {
        const msg = err instanceof Error ? err.message : '';
        expect(msg).toMatch(/409|already|conflict/i);
      }
    });
  });

  // ─── 3. Tenant pracuje: vytvori sluzbu ───────────────────────────────

  describe('Admin operations (authenticated)', () => {
    it('POST /admin/services vytvori novou sluzbu', async () => {
      const result = await apiCall<ServiceCreated>('/admin/services', {
        method: 'POST',
        token: accessToken,
        body: JSON.stringify({
          name: 'Strihani vlasu',
          durationMinutes: 60,
          priceHellers: 50000, // 500 Kč
          currency: 'CZK',
          isPublic: true,
        }),
      });

      expect(result.data.id).toBeTruthy();
      expect(result.data.name).toBe('Strihani vlasu');
      expect(result.data.durationMinutes).toBe(60);
      expect(result.data.priceHellers).toBe(50000);

      serviceId = result.data.id;
    });

    it('GET /admin/services obsahuje vytvorenou sluzbu', async () => {
      const result = await apiCall<{ data: Array<{ id: string }> }>('/admin/services', {
        token: accessToken,
      });
      expect(result.data.some((s) => s.id === serviceId)).toBe(true);
    });
  });

  // ─── 4. Verejny widget vidi sluzbu ───────────────────────────────────

  describe('Public widget access', () => {
    it('GET /public/:slug vraci info o tenantovi', async () => {
      const result = await apiCall<{ data: { slug: string; name: string } }>(`/public/${slug}`);
      expect(result.data.slug).toBe(slug);
      expect(result.data.name).toContain('E2E Studio');
    });

    it('GET /public/:slug/services vraci verejne sluzby', async () => {
      const result = await apiCall<PublicServicesResponse>(`/public/${slug}/services`);
      const ourService = result.data.find((s) => s.id === serviceId);
      expect(ourService).toBeDefined();
      expect(ourService?.name).toBe('Strihani vlasu');
      expect(ourService?.durationMinutes).toBe(60);
    });
  });
});
