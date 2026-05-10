import { db } from './client';
import { tenants, branches, users } from './schema';

async function seed(): Promise<void> {
  console.log('Seeding dev data...');

  const [tenant] = await db
    .insert(tenants)
    .values({
      slug: 'demo',
      name: 'Demo Tenant',
      plan: 'business',
      status: 'active',
    })
    .returning();

  if (!tenant) throw new Error('Failed to insert tenant');

  await db.insert(branches).values({
    tenantId: tenant.id,
    name: 'Hlavní pobočka',
    slug: 'hlavni',
    city: 'Praha',
  });

  await db.insert(users).values({
    tenantId: tenant.id,
    email: 'admin@demo.local',
    firstName: 'Demo',
    lastName: 'Admin',
    role: 'owner',
    isActive: true,
    // password hash placeholder — generuj přes bcrypt v real seedu
    passwordHash: '$2b$10$placeholder.replace.before.use',
  });

  console.log(`✓ Tenant created: ${tenant.slug} (${tenant.id})`);
  console.log('Done.');
  process.exit(0);
}

seed().catch((err) => {
  console.error('Seed failed:', err);
  process.exit(1);
});
