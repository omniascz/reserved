// Password hashing pomocí Argon2id (OWASP doporučený algoritmus 2024+).
//
// Parametry odpovídají OWASP cheat sheet pro Argon2id:
//   - memoryCost = 19456 (~19 MB) — odolné proti GPU brute force
//   - timeCost   = 2          — kompromis výpočet vs. UX
//   - parallelism = 1         — server-side, ne worker pool
//
// Argon2 verze a parametry jsou součástí output stringu, takže rotace
// parametrů (zvýšení nákladů s upgradem hardwaru) probíhá automaticky při
// přihlášení uživatele — `verify` zvládne starší hash, ale následný re-hash
// je odpovědnost AuthService.

import * as argon2 from 'argon2';

const ARGON2_OPTIONS = {
  type: argon2.argon2id,
  memoryCost: 19456,
  timeCost: 2,
  parallelism: 1,
} as const;

export async function hashPassword(plain: string): Promise<string> {
  return argon2.hash(plain, ARGON2_OPTIONS);
}

export async function verifyPassword(hash: string, plain: string): Promise<boolean> {
  return argon2.verify(hash, plain);
}
