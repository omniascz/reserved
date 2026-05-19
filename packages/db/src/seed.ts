import * as argon2 from 'argon2';
import { db } from './client.js';
import {
  tenants,
  branches,
  users,
  employees,
  services,
  serviceCategories,
} from './schema/index.js';

const DEMO_EMAIL = 'admin@demo.local';
const DEMO_PASSWORD = 'admin123';
const DEMO_TENANT_SLUG = 'demo';

async function seed(): Promise<void> {
  console.log('Seeding dev data...');

  // 1. Tenant
  const [tenant] = await db
    .insert(tenants)
    .values({
      slug: DEMO_TENANT_SLUG,
      name: 'Demo Tenant',
      plan: 'business',
      status: 'active',
    })
    .returning();
  if (!tenant) throw new Error('Failed to insert tenant');

  // 2. Branch
  const [branch] = await db
    .insert(branches)
    .values({
      tenantId: tenant.id,
      name: 'Hlavní pobočka',
      slug: 'hlavni',
      city: 'Praha',
    })
    .returning();
  if (!branch) throw new Error('Failed to insert branch');

  // 3. Admin user — argon2 hash hesla
  const passwordHash = await argon2.hash(DEMO_PASSWORD, {
    type: argon2.argon2id,
    memoryCost: 19456,
    timeCost: 2,
    parallelism: 1,
  });

  await db.insert(users).values({
    tenantId: tenant.id,
    email: DEMO_EMAIL,
    firstName: 'Demo',
    lastName: 'Admin',
    role: 'owner',
    isActive: true,
    passwordHash,
  });

  // 4. Demo service category
  const [category] = await db
    .insert(serviceCategories)
    .values({
      tenantId: tenant.id,
      name: 'Kadeřnictví',
      sortOrder: 0,
    })
    .returning();

  // 5. Demo service (60min, 500 Kc = 50000 hellers)
  await db.insert(services).values({
    tenantId: tenant.id,
    categoryId: category?.id ?? null,
    name: 'Střih dámský',
    description: 'Klasický střih + foukaná.',
    durationMinutes: 60,
    bufferBeforeMinutes: 0,
    bufferAfterMinutes: 15,
    priceHellers: 50000,
    currency: 'CZK',
    color: '#3b82f6',
    isPublic: true,
    capacity: 1,
    sortOrder: 0,
    isActive: true,
  });

  // 6. Demo employee
  await db.insert(employees).values({
    tenantId: tenant.id,
    firstName: 'Pavla',
    lastName: 'Demo',
    color: '#10b981',
    isPublic: true,
    acceptsOnlineBookings: true,
    sortOrder: 0,
    isActive: true,
  });

  console.log(`\n✓ Seed OK`);
  console.log(`  Tenant: ${tenant.slug} (${tenant.id})`);
  console.log(`  Login:  ${DEMO_EMAIL}  /  ${DEMO_PASSWORD}`);
  console.log(`  Admin:  http://localhost:3000  (tenant: demo)\n`);
  process.exit(0);
}

seed().catch((err) => {
  console.error('Seed failed:', err);
  process.exit(1);
});
