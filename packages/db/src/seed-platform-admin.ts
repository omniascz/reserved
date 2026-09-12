// Idempotentni seed pro prvniho master admina (provozovatele platformy).
// Spustit:
//   DATABASE_URL=... PLATFORM_ADMIN_EMAIL=... PLATFORM_ADMIN_PASSWORD=... \
//     pnpm --filter @reserved/db exec tsx src/seed-platform-admin.ts
//
// E-mail ani heslo NEJSOU v kodu — bez nich seed skonci chybou (zadne defaulty).
// Pouziva service role aby obesel RLS policy na platform_admins.

import * as argon2 from 'argon2';
import { eq } from 'drizzle-orm';
import { db } from './client.js';
import { platformAdmins } from './schema/index.js';

/** Povinna env promenna — bez ni seed skonci chybou (zadny default v kodu). */
function requireEnv(name: string): string {
  const value = process.env[name];
  if (!value) {
    console.error(
      `Seed selhal: nastav ${name} (potreba jsou PLATFORM_ADMIN_EMAIL i PLATFORM_ADMIN_PASSWORD).`,
    );
    process.exit(1);
  }
  return value;
}

const ADMIN_EMAIL = requireEnv('PLATFORM_ADMIN_EMAIL');
const ADMIN_PASSWORD = requireEnv('PLATFORM_ADMIN_PASSWORD');
const ADMIN_FIRST_NAME = process.env.PLATFORM_ADMIN_FIRST_NAME ?? 'Provozovatel';
const ADMIN_LAST_NAME = process.env.PLATFORM_ADMIN_LAST_NAME ?? 'Reserved';

async function main(): Promise<void> {
  await db.transaction(async (tx) => {
    await tx.execute(`SELECT set_config('app.current_role', 'service', true)`);

    const existing = await tx
      .select()
      .from(platformAdmins)
      .where(eq(platformAdmins.email, ADMIN_EMAIL));

    const passwordHash = await argon2.hash(ADMIN_PASSWORD, {
      type: argon2.argon2id,
      memoryCost: 19456,
      timeCost: 2,
      parallelism: 1,
    });

    if (existing.length > 0) {
      await tx
        .update(platformAdmins)
        .set({ passwordHash, isActive: true, updatedAt: new Date() })
        .where(eq(platformAdmins.id, existing[0]!.id));
      console.log(`✓ Aktualizovano heslo pro ${ADMIN_EMAIL}.`);
    } else {
      await tx.insert(platformAdmins).values({
        email: ADMIN_EMAIL,
        passwordHash,
        firstName: ADMIN_FIRST_NAME,
        lastName: ADMIN_LAST_NAME,
        isActive: true,
      });
      console.log(`✓ Vytvoren prvni master admin ${ADMIN_EMAIL}.`);
    }
  });

  // Heslo zamerne NEvypisujeme.
  console.log(`\nMaster admin: ${ADMIN_EMAIL} (heslo z PLATFORM_ADMIN_PASSWORD)`);
  console.log(`Master admin bezi na http://localhost:4001\n`);
  process.exit(0);
}

main().catch((err) => {
  console.error('Seed selhal:', err);
  process.exit(1);
});
