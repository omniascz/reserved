import postgres from 'postgres';
import { createHash, randomBytes } from 'node:crypto';
import { test, expect, shot, loginAsFitnessAdmin } from './fixtures';

// Playwright: žlutý pruh a proklik ověřovacího odkazu.
//
// Surový token je jen v odeslaném e-mailu, takže si ho test vyrobí sám a do
// databáze uloží jeho OTISK — přesně jak to dělá aplikace. Odkaz pak proklikne
// v prohlížeči jako skutečný uživatel.

const API_URL = process.env.API_URL ?? 'http://localhost:4010/api/v1';
const DB_URL = process.env.DATABASE_URL ?? 'postgresql://dev:dev@localhost:5433/reserved_dev';

function sha256(x: string): string {
  return createHash('sha256').update(x).digest('hex');
}

test.describe('Admin — ověření e-mailu', () => {
  test('ověřenému účtu se žlutý pruh nezobrazuje', async ({ page }) => {
    await loginAsFitnessAdmin(page);
    await page.goto('/dashboard');
    await expect(page.getByRole('heading', { name: 'Dashboard' })).toBeVisible();

    // Tenant fitness je po seedu ověřený → pruh nesmí být nikde.
    await expect(page.getByTestId('email-banner')).toHaveCount(0);
  });

  test('neověřený účet: pruh se zobrazí a proklik odkazu ho odbaví', async ({ page }) => {
    const sql = postgres(DB_URL, { max: 2 });
    try {
      const slug = `pw-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 6)}`.slice(
        0,
        32,
      );
      const email = `${slug}@e2e.local`;
      const heslo = 'SecureTestPwd123!';

      const reg = await page.request.post(`${API_URL}/auth/register`, {
        data: {
          tenantSlug: slug,
          tenantName: `PW ${slug}`,
          email,
          password: heslo,
          firstName: 'Pw',
          lastName: 'Owner',
          currency: 'CZK',
          locale: 'cs-CZ',
        },
      });
      expect(reg.ok(), 'registrace testovacího tenanta musí projít').toBeTruthy();
      const { userId, tenantId } = (await reg.json()) as { userId: string; tenantId: string };

      // ── Přihlásit se jako nový (neověřený) účet ──
      await page.goto('/login');
      await page.locator('#slug').fill(slug);
      await page.locator('#email').fill(email);
      await page.locator('#password').fill(heslo);
      await page.getByRole('button', { name: 'Přihlásit' }).click();
      await page.waitForURL('**/dashboard', { timeout: 20_000 });

      // ── Žlutý pruh ──
      const pruh = page.getByTestId('email-banner');
      await expect(pruh).toBeVisible({ timeout: 15_000 });
      await expect(pruh).toContainText('Potvrďte svůj e-mail');
      await expect(pruh).toContainText(email);
      await expect(pruh.getByRole('button', { name: 'Poslat znovu' })).toBeVisible();
      await shot(page, '16-zluty-pruh');

      // ── Proklik PLATNÉHO odkazu ──
      const raw = randomBytes(32).toString('hex');
      await sql`INSERT INTO email_verifications (tenant_id, user_id, purpose, token_hash, expires_at)
                VALUES (${tenantId}, ${userId}, 'email_confirm', ${sha256(raw)},
                        ${new Date(Date.now() + 3600_000)})`;

      await page.goto(`/verify-email?token=${raw}`);
      await expect(page.getByRole('heading', { name: 'E-mail potvrzen' })).toBeVisible({
        timeout: 15_000,
      });
      await expect(page.getByText(email)).toBeVisible();
      await shot(page, '17-email-potvrzen');

      // ── Po ověření pruh zmizí ──
      await page.goto('/dashboard');
      await expect(page.getByRole('heading', { name: 'Dashboard' })).toBeVisible();
      await expect(page.getByTestId('email-banner')).toHaveCount(0);
      await shot(page, '18-po-overeni-bez-pruhu');
    } finally {
      await sql.end();
    }
  });

  test('neplatný odkaz ukáže srozumitelnou hlášku, ne obecnou chybu', async ({ page, errors }) => {
    // Neplatný token JE očekávaná 404 — povolujeme ji výslovně.
    errors.allow('404');

    await page.goto(`/verify-email?token=${'f'.repeat(64)}`);
    await expect(page.getByRole('heading', { name: 'Odkaz nefunguje' })).toBeVisible({
      timeout: 15_000,
    });
    await expect(page.getByText(/platí 24 hodin/)).toBeVisible();
  });
});
