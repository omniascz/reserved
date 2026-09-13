import * as argon2 from 'argon2';
import { randomBytes } from 'node:crypto';
import { eq } from 'drizzle-orm';
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
  classSessions,
  classSessionWaitlist,
  resources,
  creditPacks,
  customerCreditPacks,
  creditUses,
  timePacks,
  customerTimePacks,
  timePackUses,
  bundlePacks,
  customerBundlePacks,
  bundleItemUses,
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

  // ─── Bundle balíček (salonní, proto v demo tenantovi, ne ve fitness) ──
  const [bundleTpl] = await db
    .insert(bundlePacks)
    .values({
      tenantId: tenant.id,
      name: 'Relaxační balíček',
      description: 'Střih a barvení v jedné ceně.',
      items: [
        { serviceId: strih.id, quantity: 2 },
        { serviceId: barveni.id, quantity: 1 },
      ],
      validityDays: 180,
      priceHellers: 180000,
      currency: 'CZK',
      isActive: true,
    })
    .returning();
  if (!bundleTpl) throw new Error('Failed to insert bundle pack template');

  await db.insert(customerBundlePacks).values({
    tenantId: tenant.id,
    customerId: jana.id,
    bundlePackId: bundleTpl.id,
    // Jeden střih už vyčerpaný → 1× střih + 1× barvení zbývá.
    itemsRemaining: [
      { serviceId: strih.id, quantity: 1 },
      { serviceId: barveni.id, quantity: 1 },
    ],
    snapshotItems: [
      { serviceId: strih.id, quantity: 2 },
      { serviceId: barveni.id, quantity: 1 },
    ],
    snapshotAllowedBranchIds: [],
    snapshotSameVisitRequired: false,
    validFrom: addDays(new Date(), -30),
    validUntil: addDays(new Date(), 150),
    status: 'active',
    pricePaidHellers: 180000,
  });

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
  console.log(`  Bundle:      Relaxační balíček — vydaný Janě (1× střih + 1× barvení zbývá)`);
  console.log(`  Login:       ${DEMO_EMAIL}  /  ${DEMO_PASSWORD}`);
  console.log(`  Admin:       http://localhost:4002  (tenant: demo)\n`);
  await seedFitness();
  process.exit(0);
}

const FITNESS_EMAIL = 'admin@fitness.local';
const FITNESS_PASSWORD = 'fitness123';
const FITNESS_TENANT_SLUG = 'fitness';

/** Krátký kód rezervace do lekce — stejný formát jako API (L-XXXX-XXXX). */
function lessonCode(): string {
  const part = () =>
    randomBytes(2)
      .toString('hex')
      .toUpperCase()
      .replace(/[0OIL1]/g, 'X');
  return `L-${part()}-${part()}`;
}

/**
 * Druhý demo tenant: fitness/EMS studio se skupinovými lekcemi.
 * Tenant `demo` (kadeřnictví) zůstává beze změny.
 *
 * Vytvoří stav, na kterém jde kliknout všechno z admin UI lekcí:
 *   - poloprázdnou skupinovou lekci
 *   - plnou lekci s pořadníkem
 *   - EMS lekci na konkrétním přístroji
 *   - minulou lekci s vyplněnou docházkou (přišel / nepřišel)
 */
async function seedFitness(): Promise<void> {
  console.log('Seeding fitness demo data...');

  const [tenant] = await db
    .insert(tenants)
    .values({
      slug: FITNESS_TENANT_SLUG,
      name: 'Fitness Demo',
      plan: 'business',
      status: 'active',
      businessType: 'fitness',
    })
    .returning();
  if (!tenant) throw new Error('Failed to insert fitness tenant');

  const [branch] = await db
    .insert(branches)
    .values({
      tenantId: tenant.id,
      name: 'Studio Karlín',
      slug: 'karlin',
      city: 'Praha',
    })
    .returning();
  if (!branch) throw new Error('Failed to insert fitness branch');

  const passwordHash = await argon2.hash(FITNESS_PASSWORD, {
    type: argon2.argon2id,
    memoryCost: 19456,
    timeCost: 2,
    parallelism: 1,
  });
  await db.insert(users).values({
    tenantId: tenant.id,
    email: FITNESS_EMAIL,
    firstName: 'Fitness',
    lastName: 'Admin',
    role: 'owner',
    isActive: true,
    passwordHash,
  });

  const [category] = await db
    .insert(serviceCategories)
    .values({ tenantId: tenant.id, name: 'Skupinové lekce', sortOrder: 0 })
    .returning();

  // Skupinová služba (kapacita 12) + EMS služba na přístroj (kapacita 1).
  const [trx] = await db
    .insert(services)
    .values({
      tenantId: tenant.id,
      categoryId: category?.id ?? null,
      name: 'TRX skupinová lekce',
      description: 'Kruhový trénink na závěsném systému, maximálně 12 lidí.',
      durationMinutes: 55,
      bufferBeforeMinutes: 0,
      bufferAfterMinutes: 5,
      priceHellers: 25000,
      currency: 'CZK',
      color: '#0ea5e9',
      isPublic: true,
      capacity: 12,
      archetype: 'skupinova_lekce',
      sortOrder: 0,
      isActive: true,
    })
    .returning();
  if (!trx) throw new Error('Failed to insert TRX service');

  const [ems] = await db
    .insert(services)
    .values({
      tenantId: tenant.id,
      categoryId: category?.id ?? null,
      name: 'EMS trénink',
      description: 'Dvacetiminutový trénink na EMS přístroji, jeden klient na stroj.',
      durationMinutes: 20,
      bufferBeforeMinutes: 5,
      bufferAfterMinutes: 10,
      priceHellers: 60000,
      currency: 'CZK',
      color: '#f97316',
      isPublic: true,
      capacity: 1,
      archetype: 'ems_pristrojovy',
      sortOrder: 1,
      isActive: true,
    })
    .returning();
  if (!ems) throw new Error('Failed to insert EMS service');

  const [marek] = await db
    .insert(employees)
    .values({
      tenantId: tenant.id,
      firstName: 'Marek',
      lastName: 'Trenér',
      email: 'marek@fitness.local',
      title: 'Hlavní trenér',
      color: '#22c55e',
      isPublic: true,
      acceptsOnlineBookings: true,
      sortOrder: 0,
      isActive: true,
    })
    .returning();
  if (!marek) throw new Error('Failed to insert fitness employee');

  await db
    .insert(employeeBranches)
    .values({ tenantId: tenant.id, employeeId: marek.id, branchId: branch.id, isPrimary: true });
  await db.insert(employeeServices).values([
    { tenantId: tenant.id, employeeId: marek.id, serviceId: trx.id },
    { tenantId: tenant.id, employeeId: marek.id, serviceId: ems.id },
  ]);
  await db.insert(employeeWorkingHours).values(
    WEEKDAYS.map((dayOfWeek) => ({
      tenantId: tenant.id,
      employeeId: marek.id,
      branchId: branch.id,
      dayOfWeek,
      startTime: '08:00:00',
      endTime: '20:00:00',
      isActive: true,
    })),
  );

  // Dva EMS přístroje — bez nich nelze EMS lekci vypsat.
  const machineRows = await db
    .insert(resources)
    .values([
      { tenantId: tenant.id, branchId: branch.id, name: 'EMS přístroj #1', type: 'ems_machine' },
      { tenantId: tenant.id, branchId: branch.id, name: 'EMS přístroj #2', type: 'ems_machine' },
    ])
    .returning();
  const machineOne = machineRows[0];
  if (!machineOne) throw new Error('Failed to insert EMS machines');

  const customerRows = (await db
    .insert(customers)
    .values([
      {
        tenantId: tenant.id,
        firstName: 'Klára',
        lastName: 'Veselá',
        email: 'klara@fitness.local',
        phone: '+420611111111',
      },
      {
        tenantId: tenant.id,
        firstName: 'Tomáš',
        lastName: 'Horák',
        email: 'tomas.horak@fitness.local',
        phone: '+420612222222',
      },
      {
        tenantId: tenant.id,
        firstName: 'Nikola',
        lastName: 'Králová',
        email: 'nikola@fitness.local',
        phone: '+420613333333',
      },
      {
        tenantId: tenant.id,
        firstName: 'Radek',
        lastName: 'Pokorný',
        email: 'radek@fitness.local',
        phone: '+420614444444',
      },
      {
        tenantId: tenant.id,
        firstName: 'Zuzana',
        lastName: 'Marková',
        email: 'zuzana@fitness.local',
        phone: '+420615555555',
      },
      {
        tenantId: tenant.id,
        firstName: 'Ondřej',
        lastName: 'Beneš',
        email: 'ondrej@fitness.local',
        phone: '+420616666666',
      },
    ])
    .returning()) as SeedCustomer[];
  const [klara, tomasH, nikola, radek, zuzana, ondrej] = customerRows;
  if (!klara || !tomasH || !nikola || !radek || !zuzana || !ondrej) {
    throw new Error('Failed to insert fitness customers');
  }

  // Zúžení typu z `if (!tenant) throw` se do vnořené funkce nepřenese, proto
  // si id vytáhneme do proměnných, které nejsou volitelné.
  const tenantId = tenant.id;
  const branchId = branch.id;

  /** Vypíše lekci a přihlásí do ní dané klienty (booking = účastník). */
  async function createSession(opts: {
    service: SeedService;
    startsAt: Date;
    capacity: number;
    employeeId: string | null;
    resourceId: string | null;
    status: 'open' | 'completed';
    participants: Array<{
      customer: SeedCustomer;
      status: 'confirmed' | 'completed' | 'no_show';
    }>;
  }): Promise<string> {
    const endsAt = new Date(opts.startsAt.getTime() + opts.service.durationMinutes * 60_000);
    const bufferStartsAt = new Date(
      opts.startsAt.getTime() - opts.service.bufferBeforeMinutes * 60_000,
    );
    const bufferEndsAt = new Date(endsAt.getTime() + opts.service.bufferAfterMinutes * 60_000);

    const [session] = await db
      .insert(classSessions)
      .values({
        tenantId,
        branchId,
        serviceId: opts.service.id,
        employeeId: opts.employeeId,
        resourceId: opts.resourceId,
        startsAt: opts.startsAt,
        endsAt,
        bufferStartsAt,
        bufferEndsAt,
        capacity: opts.capacity,
        bookedCount: opts.participants.length,
        status: opts.status,
      })
      .returning();
    if (!session) throw new Error('Failed to insert class session');

    if (opts.participants.length > 0) {
      await db.insert(bookings).values(
        opts.participants.map((p) => ({
          tenantId,
          branchId,
          serviceId: opts.service.id,
          employeeId: opts.employeeId,
          sessionId: session.id,
          customerId: p.customer.id,
          customerName: `${p.customer.firstName} ${p.customer.lastName}`,
          customerEmail: p.customer.email,
          customerPhone: p.customer.phone,
          startsAt: opts.startsAt,
          endsAt,
          bufferStartsAt,
          bufferEndsAt,
          status: p.status,
          pricePaidHellers: opts.service.priceHellers,
          currency: opts.service.currency,
          referenceCode: lessonCode(),
          completedAt: p.status === 'completed' ? endsAt : null,
          metadata: { source: 'seed', kind: 'class_session' },
        })),
      );
    }
    return session.id;
  }

  // 1. Poloprázdná skupinová lekce (4 z 12).
  await createSession({
    service: trx,
    startsAt: workdayAt(2, 17),
    capacity: 12,
    employeeId: marek.id,
    resourceId: null,
    status: 'open',
    participants: [
      { customer: klara, status: 'confirmed' },
      { customer: tomasH, status: 'confirmed' },
      { customer: nikola, status: 'confirmed' },
      { customer: radek, status: 'confirmed' },
    ],
  });

  // 2. Plná lekce (3 z 3) + pořadník se třemi čekajícími.
  const fullSessionId = await createSession({
    service: trx,
    startsAt: workdayAt(4, 18),
    capacity: 3,
    employeeId: marek.id,
    resourceId: null,
    status: 'open',
    participants: [
      { customer: klara, status: 'confirmed' },
      { customer: tomasH, status: 'confirmed' },
      { customer: nikola, status: 'confirmed' },
    ],
  });
  await db.insert(classSessionWaitlist).values(
    [radek, zuzana, ondrej].map((c, i) => ({
      tenantId: tenant.id,
      sessionId: fullSessionId,
      customerId: c.id,
      customerName: `${c.firstName} ${c.lastName}`,
      customerEmail: c.email,
      customerPhone: c.phone,
      position: i + 1,
      status: 'waiting',
    })),
  );

  // 3. EMS lekce na přístroji #1 — bez trenéra, kapacita 1, obsazená.
  await createSession({
    service: ems,
    startsAt: workdayAt(3, 9),
    capacity: 1,
    employeeId: null,
    resourceId: machineOne.id,
    status: 'open',
    participants: [{ customer: zuzana, status: 'confirmed' }],
  });

  // 4. Minulá lekce s vyplněnou docházkou: dva přišli, jeden ne.
  await createSession({
    service: trx,
    startsAt: workdayAt(-7, 17),
    capacity: 12,
    employeeId: marek.id,
    resourceId: null,
    status: 'completed',
    participants: [
      { customer: klara, status: 'completed' },
      { customer: tomasH, status: 'completed' },
      { customer: nikola, status: 'no_show' },
    ],
  });

  // ─── Permanentky (UI 2) ───────────────────────────────────────────────
  // Čtyři instance v různých stavech, ať je na čem klikat — a hlavně ať je
  // vidět rozdíl mezi uloženým a vypočteným stavem u propadlé permanentky.

  const [creditTpl] = await db
    .insert(creditPacks)
    .values({
      tenantId,
      name: '10× EMS',
      description: 'Deset vstupů na EMS trénink, platnost 90 dní.',
      mode: 'per_visit',
      totalCredits: 10,
      validityDays: 90,
      priceHellers: 500000,
      currency: 'CZK',
      isActive: true,
    })
    .returning();
  if (!creditTpl) throw new Error('Failed to insert credit pack template');

  const [timeTpl] = await db
    .insert(timePacks)
    .values({
      tenantId,
      name: '30 dní neomezeně',
      description: 'Neomezené lekce po 30 dní, maximálně 2 vstupy denně.',
      durationDays: 30,
      maxBookingsPerDay: 2,
      priceHellers: 180000,
      currency: 'CZK',
      isActive: true,
    })
    .returning();
  if (!timeTpl) throw new Error('Failed to insert time pack template');

  // Zúžení typu z `if (!creditTpl) throw` se do vnořené funkce nepřenese —
  // proto si id vytáhneme do proměnné, která volitelná není.
  const creditTplId = creditTpl.id;

  /** Vydá kreditovou permanentku a vrátí id instance. */
  async function issueCreditPass(opts: {
    customer: SeedCustomer;
    creditsRemaining: number;
    validFrom: Date;
    validUntil: Date | null;
    status: string;
    note?: string;
  }): Promise<string> {
    const [row] = await db
      .insert(customerCreditPacks)
      .values({
        tenantId,
        customerId: opts.customer.id,
        creditPackId: creditTplId,
        creditsRemaining: opts.creditsRemaining,
        creditsAtPurchase: 10,
        snapshotMode: 'per_visit',
        snapshotAllowedServiceIds: [],
        snapshotAllowedBranchIds: [],
        snapshotCreditCosts: {},
        validFrom: opts.validFrom,
        validUntil: opts.validUntil,
        status: opts.status,
        pricePaidHellers: 500000,
        note: opts.note ?? null,
      })
      .returning();
    if (!row) throw new Error('Failed to issue credit pass');
    return row.id;
  }

  // Rozjetá: 7 z 10, platná ještě 83 dní.
  const startedPass = await issueCreditPass({
    customer: klara,
    creditsRemaining: 7,
    validFrom: addDays(new Date(), -7),
    validUntil: addDays(new Date(), 83),
    status: 'active',
  });

  // Vyčerpaná: 0 z 10.
  const usedUpPass = await issueCreditPass({
    customer: tomasH,
    creditsRemaining: 0,
    validFrom: addDays(new Date(), -60),
    validUntil: addDays(new Date(), 30),
    status: 'used_up',
  });

  // Propadlá, ale ve sloupci pořád 'active' — přesně ten rozdíl, který musí UI
  // ukázat jako „Propadlá" (expiraci nikdo neuklízí).
  const expiredPass = await issueCreditPass({
    customer: nikola,
    creditsRemaining: 4,
    validFrom: addDays(new Date(), -120),
    validUntil: addDays(new Date(), -14),
    status: 'active',
    note: 'Propadlá — ve sloupci status zůstalo active.',
  });

  // Pozastavená: klient na dva měsíce odjel.
  const suspendedPass = await issueCreditPass({
    customer: radek,
    creditsRemaining: 6,
    validFrom: addDays(new Date(), -20),
    validUntil: addDays(new Date(), 70),
    status: 'suspended',
    note: 'Klient na dva měsíce v zahraničí.',
  });

  // Časový balíček: rozjetý, platí ještě 23 dní.
  const [timePass] = await db
    .insert(customerTimePacks)
    .values({
      tenantId,
      customerId: zuzana.id,
      timePackId: timeTpl.id,
      snapshotMaxBookingsPerPeriod: null,
      snapshotMaxBookingsPerDay: 2,
      snapshotAllowedServiceIds: [],
      snapshotAllowedBranchIds: [],
      bookingsUsed: 3,
      validFrom: addDays(new Date(), -7),
      validUntil: addDays(new Date(), 23),
      status: 'active',
      pricePaidHellers: 180000,
    })
    .returning();
  if (!timePass) throw new Error('Failed to issue time pass');

  // Čerpání navázané na SKUTEČNÉ rezervace fitness lekcí, ať historie není prázdná.
  const fitnessBookings = await db
    .select({
      id: bookings.id,
      customerId: bookings.customerId,
      startsAt: bookings.startsAt,
    })
    .from(bookings)
    .where(eq(bookings.tenantId, tenantId));

  const bookingsOf = (customerId: string) =>
    fitnessBookings.filter((b) => b.customerId === customerId);

  const creditUseRows: Array<typeof creditUses.$inferInsert> = [];
  // Klára: tři čerpání (10 → 7).
  for (const b of bookingsOf(klara.id).slice(0, 3)) {
    creditUseRows.push({
      tenantId,
      customerCreditPackId: startedPass,
      bookingId: b.id,
      creditsDeducted: 1,
      action: 'consumed',
      performedBy: null,
    });
  }
  // Tomáš: dvě čerpání + ruční doplnění, aby historie měla i jinou akci.
  for (const b of bookingsOf(tomasH.id).slice(0, 2)) {
    creditUseRows.push({
      tenantId,
      customerCreditPackId: usedUpPass,
      bookingId: b.id,
      creditsDeducted: 1,
      action: 'consumed',
      performedBy: null,
    });
  }
  creditUseRows.push({
    tenantId,
    customerCreditPackId: usedUpPass,
    bookingId: null,
    creditsDeducted: -2,
    action: 'admin_adjustment',
    performedBy: null,
    note: 'Dobití za zrušenou lekci.',
  });
  // Nikola (propadlá): dvě čerpání.
  for (const b of bookingsOf(nikola.id).slice(0, 2)) {
    creditUseRows.push({
      tenantId,
      customerCreditPackId: expiredPass,
      bookingId: b.id,
      creditsDeducted: 1,
      action: 'consumed',
      performedBy: null,
    });
  }
  // Radek (pozastavená): jedno čerpání + záznam o pozastavení.
  for (const b of bookingsOf(radek.id).slice(0, 1)) {
    creditUseRows.push({
      tenantId,
      customerCreditPackId: suspendedPass,
      bookingId: b.id,
      creditsDeducted: 1,
      action: 'consumed',
      performedBy: null,
    });
  }
  creditUseRows.push({
    tenantId,
    customerCreditPackId: suspendedPass,
    bookingId: null,
    creditsDeducted: 0,
    action: 'admin_adjustment',
    performedBy: null,
    note: 'Pozastaveno: klient na dva měsíce v zahraničí.',
  });
  await db.insert(creditUses).values(creditUseRows);

  // Časový balíček: tři použití (service_id je u ručních úprav NULL, u čerpání služba).
  const zuzanaBookings = bookingsOf(zuzana.id).slice(0, 3);
  if (zuzanaBookings.length > 0) {
    await db.insert(timePackUses).values(
      zuzanaBookings.map((b) => ({
        tenantId,
        customerTimePackId: timePass.id,
        bookingId: b.id,
        serviceId: ems.id,
        usageDate: b.startsAt,
        action: 'consumed',
        performedBy: null,
      })),
    );
  }

  console.log(`\n✓ Fitness seed OK`);
  console.log(`  Tenant:      ${tenant.slug} (${tenant.id})`);
  console.log(`  Pobočka:     ${branch.name}`);
  console.log(
    `  Služby:      TRX skupinová lekce (55 min, kap. 12) · EMS trénink (20 min, kap. 1)`,
  );
  console.log(`  Trenér:      Marek Trenér — po–pá 8–20`);
  console.log(`  Přístroje:   EMS přístroj #1, #2`);
  console.log(`  Klienti:     ${customerRows.length}`);
  console.log(`  Lekce:       poloprázdná (4/12) · plná (3/3) + 3 v pořadníku ·`);
  console.log(`               EMS na přístroji #1 (1/1) · minulá s docházkou (2 přišli, 1 ne)`);
  console.log(`  Permanentky: 10× EMS — rozjetá (7/10) · vyčerpaná (0/10) ·`);
  console.log(`               propadlá (v DB 'active', ve výpisu 'Propadlá') · pozastavená`);
  console.log(`               30 dní neomezeně — rozjetá (3 použití, 2/den)`);
  console.log(`  Login:       ${FITNESS_EMAIL}  /  ${FITNESS_PASSWORD}`);
  console.log(`  Admin:       http://localhost:4002  (tenant: fitness)\n`);
}

seed().catch((err) => {
  console.error('Seed failed:', err);
  process.exit(1);
});
