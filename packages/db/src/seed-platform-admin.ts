// Idempotentni seed pro prvniho master admina (provozovatele platformy).
// Spustit: DATABASE_URL=... pnpm --filter @reserved/db exec tsx src/seed-platform-admin.ts
//
// Pouziva service role aby obesel RLS policy na platform_admins.

import * as argon2 from 'argon2';
import { eq } from 'drizzle-orm';
import { db } from './client.js';
import { platformAdmins } from './schema/index.js';

const ADMIN_EMAIL = process.env.PLATFORM_ADMIN_EMAIL ?? 'omniascz@gmail.com';
const ADMIN_PASSWORD = process.env.PLATFORM_ADMIN_PASSWORD ?? 'reserved2026';
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

  console.log(`\nMaster admin login: ${ADMIN_EMAIL}  /  ${ADMIN_PASSWORD}`);
  console.log(`URL po dokonceni sprintu 5.1: http://localhost:3004\n`);
  process.exit(0);
}

main().catch((err) => {
  console.error('Seed selhal:', err);
  process.exit(1);
});
