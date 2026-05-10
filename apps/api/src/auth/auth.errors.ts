// Typed errors pro auth flow. Každá má vlastní HTTP status code.

export type AuthErrorCode =
  | 'TOKEN_MISSING'
  | 'TOKEN_INVALID'
  | 'TOKEN_EXPIRED'
  | 'TOKEN_REVOKED'
  | 'INSUFFICIENT_ROLE'
  | 'TENANT_MISMATCH';

const HTTP_STATUS: Record<AuthErrorCode, number> = {
  TOKEN_MISSING: 401,
  TOKEN_INVALID: 401,
  TOKEN_EXPIRED: 401,
  TOKEN_REVOKED: 401,
  INSUFFICIENT_ROLE: 403,
  TENANT_MISMATCH: 403,
};

export class AuthError extends Error {
  readonly code: AuthErrorCode;
  readonly httpStatus: number;

  constructor(code: AuthErrorCode, message?: string) {
    super(message ?? code);
    this.code = code;
    this.httpStatus = HTTP_STATUS[code];
    this.name = 'AuthError';
  }
}
