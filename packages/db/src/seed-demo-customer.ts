// Idempotentni seed pro demo zakaznika v portalu/widgetu.
// Spustit: pnpm --filter @reserved/db exec tsx src/seed-demo-customer.ts

import * as argon2 from 'argon2';
import { eq, and } from 'drizzle-orm';
import { db } from './client.js';
import { tenants, customers } from './schema/index.js';

const TENANT_SLUG = 'demo';
const CUSTOMER_EMAIL = 'jan@demo.local';
const CUSTOMER_PASSWORD = 'heslo123';

async function main(): Promise<void> {
  const [tenant] = await db.select().from(tenants).where(eq(tenants.slug, TENANT_SLUG));
  if (!tenant) throw new Error(`Tenant ${TENANT_SLUG} neexistuje.`);

  const existing = await db
    .select()
    .from(customers)
    .where(and(eq(customers.tenantId, tenant.id), eq(customers.email, CUSTOMER_EMAIL)));

  const passwordHash = await argon2.hash(CUSTOMER_PASSWORD, {
    type: argon2.argon2id,
    memoryCost: 19456,
    timeCost: 2,
    parallelism: 1,
  });

  if (existing.length > 0) {
    await db
      .update(customers)
      .set({ passwordHash, emailVerifiedAt: new Date(), isActive: true })
      .where(eq(customers.id, existing[0]!.id));
    console.log(`✓ Heslo aktualizovano pro existujiciho zakaznika ${CUSTOMER_EMAIL}.`);
  } else {
    await db.insert(customers).values({
      tenantId: tenant.id,
      firstName: 'Jan',
      lastName: 'Demo',
      email: CUSTOMER_EMAIL,
      passwordHash,
      emailVerifiedAt: new Date(),
      isActive: true,
      customerType: 'regular',
    });
    console.log(`✓ Vytvoren demo zakaznik ${CUSTOMER_EMAIL}.`);
  }

  console.log(`\nPortal login: ${CUSTOMER_EMAIL} / ${CUSTOMER_PASSWORD}  (tenant: ${TENANT_SLUG})`);
  process.exit(0);
}

main().catch((err) => {
  console.error('Selhalo:', err);
  process.exit(1);
});
