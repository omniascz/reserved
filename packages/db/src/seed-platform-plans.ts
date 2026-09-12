// Idempotentni seed defaultnich plánů Reserved.
// Ceny dle pricing strategie v reserved-docs/09_obchodni_model.md a ANALYSIS.md.
// Stripe Price IDs jsou null v dev — production je vytvoří master admin nebo
// CI skript proti live Stripe.

import { eq, sql } from 'drizzle-orm';
import { db } from './client.js';
import { platformPlans } from './schema/index.js';

interface PlanSeed {
  key: string;
  name: string;
  description: string;
  monthlyPriceHellers: number; // 0 = free
  yearlyPriceHellers: number;
  trialDays: number;
  limits: Record<string, unknown>;
  features: Record<string, boolean>;
  sortOrder: number;
}

const PLANS: PlanSeed[] = [
  {
    key: 'free',
    name: 'Start',
    description: 'Pro vyzkousení Reserved. Omezeno na základní funkce.',
    monthlyPriceHellers: 0,
    yearlyPriceHellers: 0,
    trialDays: 0,
    limits: {
      maxBookingsPerMonth: 50,
      maxEmployees: 1,
      maxBranches: 1,
      maxServices: 5,
    },
    features: {
      onlineBookings: true,
      emailNotifications: true,
      smsNotifications: false,
      googleCalendar: false,
      multipleEmployees: false,
      packages: false,
      subscriptions: false,
      corporateAccounts: false,
      apiAccess: false,
      whatsapp: false,
    },
    sortOrder: 0,
  },
  {
    key: 'starter',
    name: 'Starter',
    description: 'Pro malé salony do 3 zaměstnanců.',
    monthlyPriceHellers: 59000, // 590 Kč
    yearlyPriceHellers: 590000, // 5 900 Kč (~830 měsíčně = 2 měsíce zdarma)
    trialDays: 14,
    limits: {
      maxBookingsPerMonth: 500,
      maxEmployees: 3,
      maxBranches: 1,
      maxServices: 20,
    },
    features: {
      onlineBookings: true,
      emailNotifications: true,
      smsNotifications: true,
      googleCalendar: true,
      multipleEmployees: true,
      packages: false,
      subscriptions: false,
      corporateAccounts: false,
      apiAccess: false,
      whatsapp: false,
    },
    sortOrder: 1,
  },
  {
    key: 'professional',
    name: 'Professional',
    description: 'Pro střední salony s 4-10 zaměstnanci, vícevětve a balíčky.',
    monthlyPriceHellers: 129000, // 1 290 Kč
    yearlyPriceHellers: 1290000, // 12 900 Kč
    trialDays: 14,
    limits: {
      maxBookingsPerMonth: 2000,
      maxEmployees: 10,
      maxBranches: 3,
      maxServices: 100,
    },
    features: {
      onlineBookings: true,
      emailNotifications: true,
      smsNotifications: true,
      googleCalendar: true,
      multipleEmployees: true,
      packages: true,
      subscriptions: true,
      corporateAccounts: true,
      apiAccess: true,
      whatsapp: false,
    },
    sortOrder: 2,
  },
  {
    key: 'business',
    name: 'Business',
    description: 'Pro velké provozy bez limitu rezervací, WhatsApp, AI funkce.',
    monthlyPriceHellers: 249000, // 2 490 Kč
    yearlyPriceHellers: 2490000, // 24 900 Kč
    trialDays: 14,
    limits: {
      maxBookingsPerMonth: null, // bez limitu
      maxEmployees: 50,
      maxBranches: 20,
      maxServices: null,
    },
    features: {
      onlineBookings: true,
      emailNotifications: true,
      smsNotifications: true,
      googleCalendar: true,
      multipleEmployees: true,
      packages: true,
      subscriptions: true,
      corporateAccounts: true,
      apiAccess: true,
      whatsapp: true,
      aiNoShowPrediction: true,
    },
    sortOrder: 3,
  },
  {
    key: 'enterprise',
    name: 'Enterprise',
    description: 'Pro řetězce, custom integrace, SLA, dedikovaný account manager.',
    monthlyPriceHellers: 0, // individuální (sjednává master admin)
    yearlyPriceHellers: 0,
    trialDays: 0,
    limits: {},
    features: {
      onlineBookings: true,
      emailNotifications: true,
      smsNotifications: true,
      googleCalendar: true,
      multipleEmployees: true,
      packages: true,
      subscriptions: true,
      corporateAccounts: true,
      apiAccess: true,
      whatsapp: true,
      aiNoShowPrediction: true,
      whiteLabel: true,
      customDomain: true,
      sso: true,
      sla: true,
    },
    sortOrder: 4,
  },
];

async function main(): Promise<void> {
  await db.transaction(async (tx) => {
    await tx.execute(`SELECT set_config('app.current_role', 'service', true)`);
    for (const plan of PLANS) {
      const existing = await tx
        .select({ id: platformPlans.id })
        .from(platformPlans)
        .where(eq(platformPlans.key, plan.key));

      if (existing.length > 0) {
        await tx
          .update(platformPlans)
          .set({
            name: plan.name,
            description: plan.description,
            monthlyPriceHellers: plan.monthlyPriceHellers,
            yearlyPriceHellers: plan.yearlyPriceHellers,
            trialDays: plan.trialDays,
            limits: plan.limits,
            features: plan.features,
            sortOrder: plan.sortOrder,
            updatedAt: new Date(),
          })
          .where(eq(platformPlans.id, existing[0]!.id));
        console.log(`✓ Aktualizovan plan ${plan.key}`);
      } else {
        await tx.insert(platformPlans).values(plan);
        console.log(`✓ Vytvoren plan ${plan.key} (${plan.name})`);
      }
    }
  });

  console.log('\nVsechny plany seedovany.');
  console.log(
    'Pro propojeni se Stripe vytvor v dashboardu Products + Prices, pak update stripeMonthlyPriceId/stripeYearlyPriceId.',
  );
  process.exit(0);
}

main().catch((err) => {
  console.error('Seed selhal:', err);
  process.exit(1);
});
