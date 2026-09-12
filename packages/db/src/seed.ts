import * as argon2 from 'argon2';
import { randomBytes } from 'node:crypto';
import { db } from './client.js';
import {
  tenants,
  branches,
  users,
  employees,
  employeeBranches,
  employeeServices,
  employeeWorkingHours,
  services,
  serviceCategories,
  customers,
  bookings,
} from './schema/index.js';

const DEMO_EMAIL = 'admin@demo.local';
const DEMO_PASSWORD = 'admin123';
const DEMO_TENANT_SLUG = 'demo';

/** Pracovní dny po–pá v ISO konvenci (1 = pondělí), kterou čeká availability engine. */
const WEEKDAYS = [1, 2, 3, 4, 5] as const;

/** Krátký lidsky čitelný kód rezervace — stejný formát jako API (B-XXXX-XXXX). */
function referenceCode(): string {
  const part = () =>
    randomBytes(2)
      .toString('hex')
      .toUpperCase()
      .replace(/[0OIL1]/g, 'X');
  return `B-${part()}-${part()}`;
}

function addDays(base: Date, days: number): Date {
  const out = new Date(base);
  out.setUTCDate(out.getUTCDate() + days);
  return out;
}

/** Posune so/ne na pracovní den v daném směru — seedovaná data musí padnout do pracovní doby. */
function toWeekday(date: Date, direction: 1 | -1): Date {
  const out = new Date(date);
  while (out.getUTCDay() === 0 || out.getUTCDay() === 6) {
    out.setUTCDate(out.getUTCDate() + direction);
  }
  return out;
}

/** Pracovní den posunutý o `days` ode dneška, s časem `hour:00` UTC. */
function workdayAt(days: number, hour: number): Date {
  const day = toWeekday(addDays(new Date(), days), days < 0 ? -1 : 1);
  day.setUTCHours(hour, 0, 0, 0);
  return day;
}

interface SeedService {
  id: string;
  durationMinutes: number;
  bufferBeforeMinutes: number;
  bufferAfterMinutes: number;
  priceHellers: number;
  currency: string;
}

interface SeedCustomer {
  id: string;
  firstName: string;
  lastName: string;
  email: string;
  phone: string | null;
}

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

  // 5. Dvě služby s různou délkou — ať je co testovat kromě jednoho triviálního případu.
  const [strih] = await db
    .insert(services)
    .values({
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
    })
    .returning();
  if (!strih) throw new Error('Failed to insert service "Střih dámský"');

  const [barveni] = await db
    .insert(services)
    .values({
      tenantId: tenant.id,
      categoryId: category?.id ?? null,
      name: 'Barvení vlasů',
      description: 'Barvení včetně konzultace odstínu a péče po barvení.',
      durationMinutes: 90,
      bufferBeforeMinutes: 15,
      bufferAfterMinutes: 15,
      priceHellers: 95000,
      currency: 'CZK',
      color: '#a855f7',
      isPublic: true,
      capacity: 1,
      sortOrder: 1,
      isActive: true,
    })
    .returning();
  if (!barveni) throw new Error('Failed to insert service "Barvení vlasů"');

  // 6. Dva zaměstnanci s různou pracovní dobou.
  const [pavla] = await db
    .insert(employees)
    .values({
      tenantId: tenant.id,
      firstName: 'Pavla',
      lastName: 'Demo',
      email: 'pavla@demo.local',
      title: 'Kadeřnice',
      color: '#10b981',
      isPublic: true,
      acceptsOnlineBookings: true,
      sortOrder: 0,
      isActive: true,
    })
    .returning();
  if (!pavla) throw new Error('Failed to insert employee Pavla');

  const [tomas] = await db
    .insert(employees)
    .values({
      tenantId: tenant.id,
      firstName: 'Tomáš',
      lastName: 'Demo',
      email: 'tomas@demo.local',
      title: 'Kolorista',
      color: '#f59e0b',
      isPublic: true,
      acceptsOnlineBookings: true,
      sortOrder: 1,
      isActive: true,
    })
    .returning();
  if (!tomas) throw new Error('Failed to insert employee Tomáš');

  // 7. Přiřazení na pobočku — bez něj hold endpoint padá na fallback a filtr
  //    podle pobočky v adminu nic nenajde.
  await db.insert(employeeBranches).values([
    { tenantId: tenant.id, employeeId: pavla.id, branchId: branch.id, isPrimary: true },
    { tenantId: tenant.id, employeeId: tomas.id, branchId: branch.id, isPrimary: true },
  ]);

  // 8. Které služby kdo umí — bez této vazby vrací availability prázdno.
  //    Pavla umí obě služby, Tomáš jen barvení → jde testovat i filtr zaměstnanců.
  await db.insert(employeeServices).values([
    { tenantId: tenant.id, employeeId: pavla.id, serviceId: strih.id },
    { tenantId: tenant.id, employeeId: pavla.id, serviceId: barveni.id },
    { tenantId: tenant.id, employeeId: tomas.id, serviceId: barveni.id },
  ]);

  // 9. Pracovní doba po–pá (ISO dayOfWeek 1–5). Pavla 9–17 s pauzou na oběd,
  //    Tomáš odpolední směna 12–20 — záměrně jiná doba.
  await db.insert(employeeWorkingHours).values([
    ...WEEKDAYS.map((dayOfWeek) => ({
      tenantId: tenant.id,
      employeeId: pavla.id,
      branchId: branch.id,
      dayOfWeek,
      startTime: '09:00:00',
      endTime: '17:00:00',
      breakStartTime: '12:00:00',
      breakEndTime: '12:30:00',
      isActive: true,
    })),
    ...WEEKDAYS.map((dayOfWeek) => ({
      tenantId: tenant.id,
      employeeId: tomas.id,
      branchId: branch.id,
      dayOfWeek,
      startTime: '12:00:00',
      endTime: '20:00:00',
      isActive: true,
    })),
  ]);

  // 10. Demo klienti — rezervace na ně odkazují přes customer_id.
  const customerRows = await db
    .insert(customers)
    .values([
      {
        tenantId: tenant.id,
        firstName: 'Jana',
        lastName: 'Nováková',
        email: 'jana.novakova@demo.local',
        phone: '+420601111111',
        marketingOptIn: true,
      },
      {
        tenantId: tenant.id,
        firstName: 'Petr',
        lastName: 'Svoboda',
        email: 'petr.svoboda@demo.local',
        phone: '+420602222222',
      },
      {
        tenantId: tenant.id,
        firstName: 'Lucie',
        lastName: 'Dvořáková',
        email: 'lucie.dvorakova@demo.local',
        phone: '+420603333333',
      },
    ])
    .returning();
  const [jana, petr, lucie] = customerRows as SeedCustomer[];
  if (!jana || !petr || !lucie) throw new Error('Failed to insert demo customers');

  // 11. Rezervace v minulosti (dokončené → obrat a přehledy nejsou prázdné) i
  //     v budoucnu (→ admin kalendář není prázdný). Časy leží v pracovní době
  //     daného zaměstnance a pro jednoho zaměstnance se nepřekrývají (EXCLUDE).
  const plan: Array<{
    employeeId: string;
    service: SeedService;
    customer: SeedCustomer;
    startsAt: Date;
    status: 'confirmed' | 'completed';
    customerNote?: string;
  }> = [
    // minulost
    {
      employeeId: pavla.id,
      service: strih,
      customer: jana,
      startsAt: workdayAt(-21, 10),
      status: 'completed',
    },
    {
      employeeId: tomas.id,
      service: barveni,
      customer: petr,
      startsAt: workdayAt(-14, 13),
      status: 'completed',
    },
    {
      employeeId: pavla.id,
      service: barveni,
      customer: lucie,
      startsAt: workdayAt(-7, 14),
      status: 'completed',
    },
    // budoucnost
    {
      employeeId: pavla.id,
      service: strih,
      customer: jana,
      startsAt: workdayAt(2, 10),
      status: 'confirmed',
      customerNote: 'Prosím stejný střih jako minule.',
    },
    {
      employeeId: tomas.id,
      service: barveni,
      customer: petr,
      startsAt: workdayAt(4, 15),
      status: 'confirmed',
    },
    {
      employeeId: pavla.id,
      service: barveni,
      customer: lucie,
      startsAt: workdayAt(9, 13),
      status: 'confirmed',
    },
  ];

  const bookingValues = plan.map((item) => {
    const endsAt = new Date(item.startsAt.getTime() + item.service.durationMinutes * 60_000);
    return {
      tenantId: tenant.id,
      branchId: branch.id,
      serviceId: item.service.id,
      employeeId: item.employeeId,
      customerId: item.customer.id,
      customerName: `${item.customer.firstName} ${item.customer.lastName}`,
      customerEmail: item.customer.email,
      customerPhone: item.customer.phone,
      startsAt: item.startsAt,
      endsAt,
      bufferStartsAt: new Date(item.startsAt.getTime() - item.service.bufferBeforeMinutes * 60_000),
      bufferEndsAt: new Date(endsAt.getTime() + item.service.bufferAfterMinutes * 60_000),
      status: item.status,
      pricePaidHellers: item.service.priceHellers,
      currency: item.service.currency,
      customerNote: item.customerNote ?? null,
      referenceCode: referenceCode(),
      completedAt: item.status === 'completed' ? endsAt : null,
      metadata: { source: 'seed' },
    };
  });
  await db.insert(bookings).values(bookingValues);

  const pastCount = plan.filter((p) => p.status === 'completed').length;
  const futureCount = plan.length - pastCount;

  console.log(`\n✓ Seed OK`);
  console.log(`  Tenant:      ${tenant.slug} (${tenant.id})`);
  console.log(`  Pobočka:     ${branch.name}`);
  console.log(`  Služby:      Střih dámský (60 min) · Barvení vlasů (90 min)`);
  console.log(`  Zaměstnanci: Pavla Demo — po–pá 9–17, pauza 12:00–12:30 (obě služby)`);
  console.log(`               Tomáš Demo — po–pá 12–20 (barvení)`);
  console.log(`  Klienti:     ${customerRows.length}`);
  console.log(`  Rezervace:   ${pastCount} v minulosti (dokončené) + ${futureCount} v budoucnu`);
  console.log(`  Login:       ${DEMO_EMAIL}  /  ${DEMO_PASSWORD}`);
  console.log(`  Admin:       http://localhost:4002  (tenant: demo)\n`);
  process.exit(0);
}

seed().catch((err) => {
  console.error('Seed failed:', err);
  process.exit(1);
});
