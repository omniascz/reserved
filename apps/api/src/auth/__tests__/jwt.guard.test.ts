import { describe, expect, it, vi, beforeEach } from 'vitest';
import type { ExecutionContext } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { AuthConfig } from '../auth.config.js';
import { JwtService } from '../jwt.service.js';
import { JwtGuard } from '../jwt.guard.js';
import { AuthError } from '../auth.errors.js';

const TEST_USER_ID = '11111111-1111-4111-8111-111111111111';
const TEST_TENANT_ID = '22222222-2222-4222-8222-222222222222';

function makeJwtService(): JwtService {
  Object.assign(process.env, {
    JWT_SECRET: 'test_secret_at_least_32_bytes_aaaaaaaaaaaaaaaaaaaaa',
    JWT_ISSUER: 'reserved',
    JWT_AUDIENCE: 'reserved-api',
    JWT_ACCESS_TTL_SECONDS: '900',
    JWT_REFRESH_TTL_SECONDS: '604800',
  });
  const config = new AuthConfig();
  config.onModuleInit();
  return new JwtService(config);
}

function makeContext(
  headers: Record<string, string>,
  isPublicMeta?: boolean,
): {
  ctx: ExecutionContext;
  request: { headers: Record<string, string>; auth?: unknown };
  reflector: Reflector;
} {
  const request = { headers, auth: undefined as unknown };
  const ctx = {
    switchToHttp: () => ({ getRequest: () => request }),
    getHandler: () => () => undefined,
    getClass: () => class {},
  } as unknown as ExecutionContext;

  const reflector = new Reflector();
  // mock getAllAndOverride to return whatever isPublicMeta is
  vi.spyOn(reflector, 'getAllAndOverride').mockReturnValue(isPublicMeta);

  return { ctx, request, reflector };
}

describe('JwtGuard', () => {
  let jwt: JwtService;

  beforeEach(() => {
    jwt = makeJwtService();
  });

  it('returns true and skips token check when @Public() is set', async () => {
    const { ctx, request, reflector } = makeContext({}, true);
    const guard = new JwtGuard(jwt, reflector);

    const result = await guard.canActivate(ctx);

    expect(result).toBe(true);
    expect(request.auth).toBeUndefined();
  });

  it('throws TOKEN_MISSING when Authorization header absent', async () => {
    const { ctx, reflector } = makeContext({}, false);
    const guard = new JwtGuard(jwt, reflector);

    await expect(guard.canActivate(ctx)).rejects.toMatchObject({
      code: 'TOKEN_MISSING',
    });
  });

  it('throws TOKEN_MISSING when Authorization is not Bearer scheme', async () => {
    const { ctx, reflector } = makeContext({ authorization: 'Basic abc' }, false);
    const guard = new JwtGuard(jwt, reflector);

    await expect(guard.canActivate(ctx)).rejects.toBeInstanceOf(AuthError);
  });

  it('throws TOKEN_INVALID when Bearer token is malformed', async () => {
    const { ctx, reflector } = makeContext({ authorization: 'Bearer not-a-jwt' }, false);
    const guard = new JwtGuard(jwt, reflector);

    await expect(guard.canActivate(ctx)).rejects.toMatchObject({
      code: 'TOKEN_INVALID',
    });
  });

  it('returns true and attaches payload to request when token is valid', async () => {
    const { token } = await jwt.signAccessToken({
      userId: TEST_USER_ID,
      tenantId: TEST_TENANT_ID,
      role: 'employee',
      customRoleId: null,
      branchIds: [],
    });

    const { ctx, request, reflector } = makeContext({ authorization: `Bearer ${token}` }, false);
    const guard = new JwtGuard(jwt, reflector);

    const result = await guard.canActivate(ctx);

    expect(result).toBe(true);
    expect(request.auth).toMatchObject({
      sub: TEST_USER_ID,
      tenantId: TEST_TENANT_ID,
      role: 'employee',
    });
  });
});
