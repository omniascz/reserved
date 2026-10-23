import { createHash, randomBytes } from 'node:crypto';
import postgres from 'postgres';
import { test, expect, shot } from './fixtures';

// Zákaznický portál: sekce „Platební karta" v profilu (P4 — uložená karta).
// Přihlášení: magic-link se známým tokenem → /portal/auth/verify → tokeny do
// localStorage portálu (stejně jako po kliknutí na odkaz z e-mailu).

const PORTAL_URL = process.env.PORTAL_URL ?? 'http://localhost:4003';
const API_URL = process.env.API_URL ?? 'http://localhost:4010/api/v1';
const DB_URL = process.env.DATABASE_URL ?? 'postgresql://dev:dev@localhost:5433/reserved_dev';

test('Portál: profil ukáže sekci Platební karta a hlášku po návratu ze Stripe', async ({
  page,
}) => {
  const sql = postgres(DB_URL, { max: 1 });
  let tokens: { accessToken: string; refreshToken?: string };
  let email: string;
  try {
    const [c] = await sql<Array<{ tenant_id: string; email: string }>>`
      SELECT c.tenant_id, c.email FROM customers c JOIN tenants t ON t.id = c.tenant_id
      WHERE t.slug = 'fitness' AND c.email IS NOT NULL ORDER BY c.created_at LIMIT 1`;
    email = c!.email;
    const raw = randomBytes(32).toString('hex');
    await sql`INSERT INTO customer_magic_links (tenant_id, email, token_hash, purpose, expires_at)
      VALUES (${c!.tenant_id}, ${email}, ${createHash('sha256').update(raw).digest('hex')}, 'login',
        now() + interval '10 minutes')`;
    const res = await fetch(`${API_URL}/portal/auth/verify?token=${raw}`, {
      headers: { 'X-Tenant-ID': c!.tenant_id },
    });
    const body = (await res.json()) as {
      accessToken?: string;
      refreshToken?: string;
      data?: { accessToken: string; refreshToken?: string };
    };
    tokens = body.data ?? { accessToken: body.accessToken!, refreshToken: body.refreshToken };
  } finally {
    await sql.end();
  }

  await page.goto(`${PORTAL_URL}/fitness/login`);
  await page.evaluate(
    ([t, r, e]) => {
      localStorage.setItem('portal_access_token', t);
      localStorage.setItem('portal_refresh_token', r);
      localStorage.setItem('portal_tenant_slug', 'fitness');
      localStorage.setItem('portal_customer_email', e);
    },
    [tokens.accessToken, tokens.refreshToken ?? '', email],
  );
  await page.goto(`${PORTAL_URL}/fitness/profile?karta=ulozena`);

  const karta = page.getByTestId('saved-card');
  await expect(karta.getByRole('heading', { name: 'Platební karta' })).toBeVisible({
    timeout: 30_000,
  });
  await expect(karta.getByText('Děkujeme, karta se ukládá.', { exact: false })).toBeVisible();
  await expect(karta.getByText('Nemáte uloženou žádnou kartu.')).toBeVisible();
  await expect(karta.getByRole('button', { name: 'Uložit kartu' })).toBeVisible();
  await karta.scrollIntoViewIfNeeded();
  await shot(page, '24-portal-platebni-karta');
});
