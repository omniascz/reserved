import { describe, expect, it, beforeAll } from 'vitest';
import { AuthConfig } from '../auth.config.js';
import { JwtService, type SignAccessTokenInput } from '../jwt.service.js';
import { AuthError } from '../auth.errors.js';

const TEST_USER_ID = '11111111-1111-4111-8111-111111111111';
const TEST_TENANT_ID = '22222222-2222-4222-8222-222222222222';
const TEST_BRANCH_ID = '33333333-3333-4333-8333-333333333333';

function makeService(envOverrides: Record<string, string> = {}): JwtService {
  Object.assign(process.env, {
    JWT_SECRET: 'test_secret_at_least_32_bytes_aaaaaaaaaaaaaaaaaaaaa',
    JWT_ISSUER: 'reserved',
    JWT_AUDIENCE: 'reserved-api',
    JWT_ACCESS_TTL_SECONDS: '900',
    JWT_REFRESH_TTL_SECONDS: '604800',
    ...envOverrides,
  });
  const config = new AuthConfig();
  config.onModuleInit();
  return new JwtService(config);
}

const baseInput: SignAccessTokenInput = {
  userId: TEST_USER_ID,
  tenantId: TEST_TENANT_ID,
  role: 'manager',
  customRoleId: null,
  branchIds: [TEST_BRANCH_ID],
};

describe('JwtService', () => {
  describe('signAccessToken + verifyAccessToken', () => {
    it('round-trips a valid payload', async () => {
      const svc = makeService();
      const { token, jti, expiresIn } = await svc.signAccessToken(baseInput);

      const payload = await svc.verifyAccessToken(token);

      expect(payload.sub).toBe(TEST_USER_ID);
      expect(payload.tenantId).toBe(TEST_TENANT_ID);
      expect(payload.role).toBe('manager');
      expect(payload.customRoleId).toBeNull();
      expect(payload.branchIds).toEqual([TEST_BRANCH_ID]);
      expect(payload.jti).toBe(jti);
      expect(expiresIn).toBe(900);
      expect(payload.exp - payload.iat).toBeCloseTo(900, 0);
    });

    it('preserves customRoleId when set', async () => {
      const svc = makeService();
      const { token } = await svc.signAccessToken({
        ...baseInput,
        customRoleId: '44444444-4444-4444-4444-444444444444',
      });

      const payload = await svc.verifyAccessToken(token);
      expect(payload.customRoleId).toBe('44444444-4444-4444-4444-444444444444');
    });

    it('rejects token signed with different secret (TOKEN_INVALID)', async () => {
      const svcA = makeService({ JWT_SECRET: 'aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa' });
      const { token } = await svcA.signAccessToken(baseInput);

      const svcB = makeService({ JWT_SECRET: 'bbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb' });
      await expect(svcB.verifyAccessToken(token)).rejects.toMatchObject({
        code: 'TOKEN_INVALID',
      });
    });

    it('rejects token with wrong issuer (TOKEN_INVALID — K5 fix)', async () => {
      const svcSigner = makeService({ JWT_ISSUER: 'attacker' });
      const { token } = await svcSigner.signAccessToken(baseInput);

      const svcVerifier = makeService({ JWT_ISSUER: 'reserved' });
      await expect(svcVerifier.verifyAccessToken(token)).rejects.toMatchObject({
        code: 'TOKEN_INVALID',
      });
    });

    it('rejects token with wrong audience (TOKEN_INVALID — K5 fix)', async () => {
      const svcSigner = makeService({ JWT_AUDIENCE: 'attacker-api' });
      const { token } = await svcSigner.signAccessToken(baseInput);

      const svcVerifier = makeService({ JWT_AUDIENCE: 'reserved-api' });
      await expect(svcVerifier.verifyAccessToken(token)).rejects.toMatchObject({
        code: 'TOKEN_INVALID',
      });
    });

    it('rejects expired token (TOKEN_EXPIRED)', async () => {
      const svc = makeService({ JWT_ACCESS_TTL_SECONDS: '1' });
      const { token } = await svc.signAccessToken(baseInput);

      // wait > TTL
      await new Promise((r) => setTimeout(r, 1500));

      await expect(svc.verifyAccessToken(token)).rejects.toMatchObject({
        code: 'TOKEN_EXPIRED',
      });
    });

    it('rejects refresh token used as access token (issuer/audience match but payload differs)', async () => {
      const svc = makeService();
      const { token: refresh } = await svc.signRefreshToken(TEST_USER_ID, 'family-1');

      // Refresh token doesn't have tenantId/role — extractAccessPayload should fail.
      await expect(svc.verifyAccessToken(refresh)).rejects.toMatchObject({
        code: 'TOKEN_INVALID',
      });
    });

    it('rejects token with invalid role (defense vs. token forgery)', async () => {
      const svc = makeService();
      // Manually craft a token with bogus role
      const { SignJWT } = await import('jose');
      const config = (svc as unknown as { config: AuthConfig }).config;
      const malicious = await new SignJWT({
        tenantId: TEST_TENANT_ID,
        role: 'superuser', // not in APP_ROLES
        customRoleId: null,
        branchIds: [],
        jti: 'x',
      })
        .setProtectedHeader({ alg: 'HS256' })
        .setSubject(TEST_USER_ID)
        .setIssuedAt()
        .setExpirationTime('1h')
        .setIssuer(config.issuer)
        .setAudience(config.audience)
        .sign(config.secret);

      await expect(svc.verifyAccessToken(malicious)).rejects.toBeInstanceOf(AuthError);
    });
  });

  describe('signRefreshToken + verifyRefreshToken', () => {
    it('round-trips userId + family', async () => {
      const svc = makeService();
      const { token, jti } = await svc.signRefreshToken(TEST_USER_ID, 'family-abc');

      const payload = await svc.verifyRefreshToken(token);
      expect(payload.sub).toBe(TEST_USER_ID);
      expect(payload.family).toBe('family-abc');
      expect(payload.jti).toBe(jti);
    });
  });
});
