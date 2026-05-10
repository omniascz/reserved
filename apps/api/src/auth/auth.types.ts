// Reserved JWT payload — viz reserved-docs/03_architektura_systemu.md "JWT payload" sekce.

import type { AppRole } from '@reserved/rls-multitenancy';

export interface AccessTokenPayload {
  /** UUID admin usera nebo customera. */
  sub: string;
  /** UUID tenanta — povinné pro všechny role kromě cross-tenant service jobs. */
  tenantId: string;
  /** Reserved role enum (owner | manager | employee | receptionist | customer | service). */
  role: AppRole;
  /** Vlastní role definovaná tenantem — null pokud je použita systémová role. */
  customRoleId: string | null;
  /** Pobočky, ke kterým má user přístup. Prázdné pro owner (= všechny). */
  branchIds: string[];
  /** Standard JWT claims. */
  iat: number;
  exp: number;
  jti: string;
}

export interface RefreshTokenPayload {
  sub: string;
  /** Refresh token family — všechny tokeny stejné rodiny se invalidují při detekci reuse. */
  family: string;
  jti: string;
  iat: number;
  exp: number;
}

export interface TokenPair {
  accessToken: string;
  refreshToken: string;
  /** Expirace access tokenu v sekundách (= JWT_ACCESS_TTL_SECONDS). */
  expiresIn: number;
}
